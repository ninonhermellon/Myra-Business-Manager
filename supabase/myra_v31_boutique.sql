-- ============================================================================
-- Myra Business Manager V31 — Boutique en ligne publique (boutique.html)
-- Les visiteurs n'ont accès qu'à 2 fonctions : voir le catalogue, passer commande.
-- Aucune table n'est ouverte aux visiteurs. Ajouts uniquement, rejouable.
-- ============================================================================

-- Origine de la commande (app / boutique en ligne) et numéro WhatsApp du client
alter table public.customer_orders add column if not exists source text not null default 'app';
alter table public.customer_orders add column if not exists customer_whatsapp text;
create index if not exists customer_orders_source_idx on public.customer_orders (source);

-- Réglages de la boutique (un seul enregistrement)
create table if not exists public.shop_settings (
  id boolean primary key default true check (id),
  is_open boolean not null default true,
  headline text not null default 'Le secret de nos marmites',
  intro text not null default 'Plats et produits traditionnels faits maison à Brazzaville. Commandez en ligne, nous vous livrons.',
  delivery_info text not null default 'Livraison à Brazzaville sous 24 à 48 h. Frais de livraison confirmés par téléphone.',
  min_order numeric(14,2) not null default 0 check (min_order >= 0),
  whatsapp text,
  updated_at timestamptz not null default now()
);
insert into public.shop_settings (id) values (true) on conflict (id) do nothing;
select private.myra_v29_policies('shop_settings', array['owner','admin','manager','sales'], array['owner','admin','manager']);

-- ---------------------------------------------------------------------------
-- Catalogue public : produits actifs, prix public, disponibilité (sans quantité exacte),
-- note moyenne des avis, informations de la boutique.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_catalog()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'shop', (select jsonb_build_object('open', s.is_open, 'headline', s.headline, 'intro', s.intro, 'delivery', s.delivery_info, 'min_order', s.min_order, 'whatsapp', s.whatsapp) from public.shop_settings s limit 1),
    'company', (select jsonb_build_object('name', cs.company_name, 'phone', cs.phone, 'email', cs.email, 'address', cs.address, 'currency', coalesce(cs.currency_label, 'FCFA')) from public.company_settings cs order by cs.created_at limit 1),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
                            from public.product_categories c where exists (select 1 from public.products p where p.category_id = c.id and p.is_active)), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'description', p.description, 'unit', p.unit, 'price', p.sale_price, 'image', p.image_url,
        'category_id', p.category_id, 'available', p.stock_quantity > 0,
        'rating', (select round(avg(r.rating)::numeric, 1) from public.order_reviews r
                   where r.rating is not null and (exists (select 1 from public.customer_order_items i where i.order_id = r.order_id and i.product_id = p.id)
                                                   or exists (select 1 from public.sale_items si where si.sale_id = r.sale_id and si.product_id = p.id))),
        'reviews', (select count(*) from public.order_reviews r
                    where r.rating is not null and (exists (select 1 from public.customer_order_items i where i.order_id = r.order_id and i.product_id = p.id)
                                                    or exists (select 1 from public.sale_items si where si.sale_id = r.sale_id and si.product_id = p.id)))
      ) order by (p.stock_quantity > 0) desc, p.name) from public.products p where p.is_active and p.sale_price > 0), '[]'::jsonb)
  );
$$;
revoke all on function public.get_public_catalog() from public;
grant execute on function public.get_public_catalog() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Commande publique. Le prix est TOUJOURS recalculé ici (jamais celui du navigateur).
-- La commande arrive en « brouillon » dans le module Commandes, à confirmer par l'équipe.
-- Anti-abus : 30 articles max, quantités 1 à 500, 3 commandes par numéro et par heure,
-- 60 commandes en ligne par heure au total.
-- ---------------------------------------------------------------------------
create or replace function public.place_public_order(
  p_name text, p_phone text, p_whatsapp text, p_address text, p_zone text,
  p_delivery_date date, p_notes text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_wa text := nullif(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'), '');
  v_name text := left(trim(coalesce(p_name, '')), 120);
  v_customer uuid; v_order uuid; v_number text; v_sub numeric(14,2) := 0; v_item jsonb; v_prod record; v_qty numeric; v_lines int := 0;
  v_shop public.shop_settings%rowtype;
begin
  select * into v_shop from public.shop_settings limit 1;
  if found and not v_shop.is_open then raise exception 'La boutique est momentanément fermée. Contactez-nous sur WhatsApp.'; end if;
  if length(v_name) < 2 then raise exception 'Indiquez votre nom.'; end if;
  if length(v_phone) < 8 or length(v_phone) > 15 then raise exception 'Numéro de téléphone invalide.'; end if;
  if v_wa is not null and (length(v_wa) < 8 or length(v_wa) > 15) then raise exception 'Numéro WhatsApp invalide.'; end if;
  if length(trim(coalesce(p_address, ''))) < 3 then raise exception 'Indiquez votre adresse de livraison.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Votre panier est vide.'; end if;
  if jsonb_array_length(p_items) > 30 then raise exception 'Trop d''articles dans une seule commande.'; end if;
  if p_delivery_date is not null and (p_delivery_date < current_date or p_delivery_date > current_date + 60) then raise exception 'Date de livraison invalide.'; end if;
  -- anti-abus
  if (select count(*) from public.customer_orders o where o.source = 'web' and o.created_at > now() - interval '1 hour'
        and regexp_replace(coalesce((select c.phone from public.customers c where c.id = o.customer_id), ''), '\D', '', 'g') = v_phone) >= 3 then
    raise exception 'Vous avez déjà passé plusieurs commandes récemment. Nous vous contactons très vite.';
  end if;
  if (select count(*) from public.customer_orders o where o.source = 'web' and o.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Trop de commandes en ce moment, réessayez dans quelques minutes ou écrivez-nous sur WhatsApp.';
  end if;

  -- client : retrouvé par son numéro, sinon créé
  select c.id into v_customer from public.customers c where regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = v_phone order by c.created_at limit 1;
  if v_customer is null then
    insert into public.customers (full_name, phone, address, notes)
    values (v_name, p_phone, left(trim(p_address), 300), 'Client créé depuis la boutique en ligne' || case when v_wa is not null and v_wa <> v_phone then ' · WhatsApp : ' || p_whatsapp else '' end)
    returning id into v_customer;
  end if;

  v_number := 'WEB-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  insert into public.customer_orders (order_number, customer_id, order_date, requested_delivery_at, delivery_address, delivery_zone, delivery_fee, subtotal, discount, total, status, notes, source, customer_whatsapp)
  values (v_number, v_customer, now(), p_delivery_date::timestamptz, left(trim(p_address), 300), nullif(left(trim(coalesce(p_zone, '')), 80), ''), 0, 0, 0, 0, 'draft',
          concat_ws(E'\n', 'Commande passée sur la boutique en ligne par ' || v_name, nullif(left(trim(coalesce(p_notes, '')), 500), '')), 'web', coalesce(v_wa, v_phone))
  returning id into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item->'quantity') is distinct from 'number' then raise exception 'Quantité invalide.'; end if;
    v_qty := round(coalesce((v_item->>'quantity')::numeric, 0));
    if v_qty < 1 or v_qty > 500 then raise exception 'Quantité invalide.'; end if;
    if coalesce(v_item->>'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Un produit de votre panier n''est plus disponible. Actualisez la page.'; end if;
    select p.id, p.name, p.unit, p.sale_price into v_prod from public.products p where p.id = (v_item->>'product_id')::uuid and p.is_active and p.sale_price > 0;
    if not found then raise exception 'Un produit de votre panier n''est plus disponible. Actualisez la page.'; end if;
    insert into public.customer_order_items (order_id, product_id, product_name, unit, quantity, unit_price, line_total)
    values (v_order, v_prod.id, v_prod.name, v_prod.unit, v_qty, v_prod.sale_price, round(v_prod.sale_price * v_qty, 2));
    v_sub := v_sub + round(v_prod.sale_price * v_qty, 2); v_lines := v_lines + 1;
  end loop;
  if v_shop.min_order > 0 and v_sub < v_shop.min_order then raise exception 'Le minimum de commande est de % FCFA.', v_shop.min_order; end if;
  update public.customer_orders set subtotal = v_sub, total = v_sub where id = v_order;
  return jsonb_build_object('order_number', v_number, 'total', v_sub, 'lines', v_lines);
end $$;
revoke all on function public.place_public_order(text,text,text,text,text,date,text,jsonb) from public;
grant execute on function public.place_public_order(text,text,text,text,text,date,text,jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
