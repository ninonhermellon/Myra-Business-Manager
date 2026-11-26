-- ============================================================================
-- Myra Business Manager V37 — Avis clients détaillés
-- Notes de 1 à 5 par critère : produit, boutique (commande en ligne), service, livraison, SAV.
-- Avis déposés depuis la boutique (fiche produit), avis « achat vérifié », relances des clients.
-- Ajouts uniquement, rejouable.
-- ============================================================================

-- 1. Critères et relances sur les demandes d'avis existantes (lien envoyé par WhatsApp)
alter table public.order_reviews add column if not exists rating_product smallint check (rating_product between 1 and 5);
alter table public.order_reviews add column if not exists rating_shop smallint check (rating_shop between 1 and 5);
alter table public.order_reviews add column if not exists rating_service smallint check (rating_service between 1 and 5);
alter table public.order_reviews add column if not exists rating_delivery smallint check (rating_delivery between 1 and 5);
alter table public.order_reviews add column if not exists rating_after_sales smallint check (rating_after_sales between 1 and 5);
alter table public.order_reviews add column if not exists reminded_at timestamptz;
alter table public.order_reviews add column if not exists reminder_count integer not null default 0;

-- 2. Avis déposés depuis la boutique en ligne
create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  author_name text not null check (length(author_name) between 2 and 80),
  phone_digits text,
  verified boolean not null default false,
  rating smallint not null check (rating between 1 and 5),
  rating_product smallint check (rating_product between 1 and 5),
  rating_shop smallint check (rating_shop between 1 and 5),
  rating_service smallint check (rating_service between 1 and 5),
  rating_delivery smallint check (rating_delivery between 1 and 5),
  rating_after_sales smallint check (rating_after_sales between 1 and 5),
  comment text check (comment is null or length(comment) <= 1000),
  status text not null default 'published' check (status in ('published', 'hidden')),
  reply text check (reply is null or length(reply) <= 1000),
  replied_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists product_reviews_product_idx on public.product_reviews (product_id, created_at desc);
create index if not exists product_reviews_customer_idx on public.product_reviews (customer_id);
create index if not exists product_reviews_phone_idx on public.product_reviews (phone_digits);
alter table public.product_reviews enable row level security;
select private.myra_v29_policies('product_reviews', array['owner','admin','manager','sales'], array['owner','admin','manager','sales']);

-- Contrôle des notes reçues ({"product":5,"shop":4,...}) : chaque critère est facultatif, 1 à 5
create or replace function private.myra_rating(p jsonb, k text) returns smallint
language plpgsql immutable set search_path = '' as $$
declare v numeric;
begin
  if p is null or not (p ? k) or jsonb_typeof(p->k) = 'null' then return null; end if;
  if jsonb_typeof(p->k) <> 'number' then raise exception 'Note invalide.'; end if;
  v := (p->>k)::numeric;
  if v < 1 or v > 5 or v <> round(v) then raise exception 'Note invalide.'; end if;
  return v::smallint;
end $$;

-- Note globale d'un produit (avis de commande + avis boutique publiés)
create or replace function private.myra_product_rating(p_product uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with all_r as (
    select coalesce(r.rating_product, r.rating) as v from public.order_reviews r
     where r.rating is not null and (exists (select 1 from public.customer_order_items i where i.order_id = r.order_id and i.product_id = p_product)
                                  or exists (select 1 from public.sale_items si where si.sale_id = r.sale_id and si.product_id = p_product))
    union all
    select coalesce(pr.rating_product, pr.rating) from public.product_reviews pr where pr.product_id = p_product and pr.status = 'published')
  select jsonb_build_object('rating', round(avg(v)::numeric, 1), 'reviews', count(*)) from all_r
$$;

-- 3. Lien d'avis (avis.html) : notes par critère
create or replace function public.submit_review(p_token text, p_rating integer, p_comment text, p_details jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_p smallint := private.myra_rating(p_details, 'product'); v_s smallint := private.myra_rating(p_details, 'shop');
  v_v smallint := private.myra_rating(p_details, 'service'); v_d smallint := private.myra_rating(p_details, 'delivery'); v_a smallint := private.myra_rating(p_details, 'after_sales');
  v_r integer := p_rating;
begin
  if v_r is null then select round(avg(x)) into v_r from unnest(array[v_p, v_s, v_v, v_d, v_a]) x; end if;
  if v_r is null or v_r < 1 or v_r > 5 then raise exception 'Donnez au moins une note.'; end if;
  update public.order_reviews set rating = v_r, rating_product = v_p, rating_shop = v_s, rating_service = v_v, rating_delivery = v_d, rating_after_sales = v_a,
         comment = nullif(left(trim(coalesce(p_comment, '')), 1000), ''), submitted_at = now()
   where token = p_token and submitted_at is null returning id into v_id;
  if v_id is null then raise exception 'Ce lien a déjà été utilisé ou n''existe pas'; end if;
  return true;
end $$;
revoke all on function public.submit_review(text,integer,text,jsonb) from public;
grant execute on function public.submit_review(text,integer,text,jsonb) to anon, authenticated;

-- 4. Avis depuis la boutique (fiche produit) : sans compte, avec téléphone (non publié)
create or replace function public.submit_product_review(p_product_id uuid, p_name text, p_phone text, p_details jsonb, p_comment text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'); v_name text := left(trim(coalesce(p_name, '')), 80);
  v_prod record; v_cust uuid; v_verified boolean := false; v_id uuid;
  v_p smallint := private.myra_rating(p_details, 'product'); v_s smallint := private.myra_rating(p_details, 'shop');
  v_v smallint := private.myra_rating(p_details, 'service'); v_d smallint := private.myra_rating(p_details, 'delivery'); v_a smallint := private.myra_rating(p_details, 'after_sales'); v_r integer;
begin
  select id, name into v_prod from public.products where id = p_product_id and is_active;
  if not found then raise exception 'Produit introuvable.'; end if;
  if length(v_name) < 2 then raise exception 'Indiquez votre prénom.'; end if;
  if length(v_phone) < 8 or length(v_phone) > 15 then raise exception 'Numéro de téléphone invalide.'; end if;
  if v_p is null then raise exception 'Notez au moins le produit.'; end if;
  select round(avg(x)) into v_r from unnest(array[v_p, v_s, v_v, v_d, v_a]) x;
  if exists (select 1 from public.product_reviews where product_id = p_product_id and right(phone_digits, 8) = right(v_phone, 8) and created_at > now() - interval '30 days') then
    raise exception 'Vous avez déjà donné votre avis sur ce produit ce mois-ci. Merci !';
  end if;
  if (select count(*) from public.product_reviews where created_at > now() - interval '1 hour') >= 40 then
    raise exception 'Trop d''avis en ce moment, réessayez un peu plus tard.';
  end if;
  select c.id into v_cust from public.customers c where right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 8) = right(v_phone, 8) order by c.created_at limit 1;
  if v_cust is not null then
    v_verified := exists (select 1 from public.customer_order_items i join public.customer_orders o on o.id = i.order_id where o.customer_id = v_cust and i.product_id = p_product_id and o.status <> 'cancelled')
               or exists (select 1 from public.sale_items si join public.sales s on s.id = si.sale_id where s.customer_id = v_cust and si.product_id = p_product_id and s.status in ('confirmed','partially_paid','paid'));
  end if;
  insert into public.product_reviews (product_id, customer_id, author_name, phone_digits, verified, rating, rating_product, rating_shop, rating_service, rating_delivery, rating_after_sales, comment)
  values (p_product_id, v_cust, v_name, v_phone, v_verified, v_r, v_p, v_s, v_v, v_d, v_a, nullif(left(trim(coalesce(p_comment, '')), 1000), ''))
  returning id into v_id;
  perform private.myra_push('reviews', '⭐ Avis boutique : ' || v_r || '/5', v_name || ' · ' || v_prod.name || coalesce(' : « ' || left(nullif(trim(p_comment), ''), 140) || ' »', ''), './#/reviews', 'preview-' || v_id, null);
  return jsonb_build_object('id', v_id, 'verified', v_verified, 'rating', v_r);
end $$;
revoke all on function public.submit_product_review(uuid,text,text,jsonb,text) from public;
grant execute on function public.submit_product_review(uuid,text,text,jsonb,text) to anon, authenticated;

-- 5. Avis publics d'un produit (sans téléphone : prénom + initiale seulement)
create or replace function public.get_product_reviews(p_product_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with r as (
    select coalesce(pr.rating_product, pr.rating) as rp, pr.rating, pr.rating_product, pr.rating_shop, pr.rating_service, pr.rating_delivery, pr.rating_after_sales,
           pr.comment, pr.created_at, pr.verified, pr.reply, pr.author_name as name
      from public.product_reviews pr where pr.product_id = p_product_id and pr.status = 'published'
    union all
    select coalesce(o.rating_product, o.rating), o.rating, o.rating_product, o.rating_shop, o.rating_service, o.rating_delivery, o.rating_after_sales,
           o.comment, o.submitted_at, true, null, coalesce((select c.full_name from public.customers c where c.id = o.customer_id), 'Client')
      from public.order_reviews o
     where o.rating is not null and (exists (select 1 from public.customer_order_items i where i.order_id = o.order_id and i.product_id = p_product_id)
                                  or exists (select 1 from public.sale_items si where si.sale_id = o.sale_id and si.product_id = p_product_id)))
  select jsonb_build_object(
    'summary', (select jsonb_build_object('rating', round(avg(rp)::numeric, 1), 'count', count(*),
                  'product', round(avg(rating_product)::numeric, 1), 'shop', round(avg(rating_shop)::numeric, 1), 'service', round(avg(rating_service)::numeric, 1),
                  'delivery', round(avg(rating_delivery)::numeric, 1), 'after_sales', round(avg(rating_after_sales)::numeric, 1),
                  'stars', jsonb_build_object('5', count(*) filter (where rp = 5), '4', count(*) filter (where rp = 4), '3', count(*) filter (where rp = 3), '2', count(*) filter (where rp = 2), '1', count(*) filter (where rp = 1))) from r),
    'reviews', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select split_part(trim(name), ' ', 1) || coalesce(' ' || nullif(left(split_part(trim(name), ' ', 2), 1), '') || '.', '') as author,
               rp as rating, rating_shop as shop, rating_service as service, rating_delivery as delivery, rating_after_sales as after_sales,
               comment, created_at, verified, reply
          from r order by created_at desc limit 20) x), '[]'::jsonb));
$$;
revoke all on function public.get_product_reviews(uuid) from public;
grant execute on function public.get_product_reviews(uuid) to anon, authenticated;

-- 6. Catalogue public : note de chaque produit = avis de commande + avis boutique
create or replace function public.get_public_catalog()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'shop', (select jsonb_build_object('open', s.is_open, 'headline', s.headline, 'intro', s.intro, 'delivery', s.delivery_info, 'min_order', s.min_order, 'whatsapp', s.whatsapp,
              'hero_image', s.hero_image_url, 'announcement', s.announcement, 'hours', s.hours, 'facebook', s.facebook_url, 'instagram', s.instagram_url, 'tiktok', s.tiktok_url) from public.shop_settings s limit 1),
    'company', (select jsonb_build_object('name', cs.company_name, 'phone', cs.phone, 'email', cs.email, 'address', cs.address, 'currency', coalesce(cs.currency_label, 'FCFA')) from public.company_settings cs order by cs.created_at limit 1),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'description', c.description,
                              'image', (select p.image_url from public.products p where p.category_id = c.id and p.is_active and p.image_url is not null order by p.stock_quantity desc limit 1),
                              'count', (select count(*) from public.products p where p.category_id = c.id and p.is_active and p.sale_price > 0)) order by c.name)
                            from public.product_categories c where exists (select 1 from public.products p where p.category_id = c.id and p.is_active and p.sale_price > 0)), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'description', p.description, 'unit', p.unit, 'price', p.sale_price, 'image', p.image_url,
        'category_id', p.category_id, 'available', p.stock_quantity > 0, 'is_new', p.created_at > now() - interval '45 days',
        'rating', (private.myra_product_rating(p.id)->>'rating')::numeric, 'reviews', (private.myra_product_rating(p.id)->>'reviews')::int
      ) order by (p.stock_quantity > 0) desc, p.name) from public.products p where p.is_active and p.sale_price > 0), '[]'::jsonb),
    'popular', coalesce((select jsonb_agg(x.product_id order by x.q desc) from (
        select t.product_id, sum(t.q) q from (
          select si.product_id, si.quantity q from public.sale_items si join public.sales s on s.id = si.sale_id
            where s.status in ('confirmed','partially_paid','paid') and s.sale_date > now() - interval '90 days'
          union all
          select i.product_id, i.quantity from public.customer_order_items i join public.customer_orders o on o.id = i.order_id
            where o.status not in ('cancelled','converted') and o.created_at > now() - interval '90 days') t
        join public.products p on p.id = t.product_id and p.is_active and p.sale_price > 0
        group by t.product_id order by sum(t.q) desc limit 8) x), '[]'::jsonb),
    'promos', coalesce((select jsonb_agg(jsonb_build_object('name', pc.name, 'code', pc.code, 'description', pc.description, 'type', pc.discount_type,
                          'value', pc.discount_value, 'min_order', pc.min_order_amount, 'ends_at', pc.ends_at) order by pc.ends_at nulls last)
                        from public.promo_campaigns pc
                        where pc.show_on_shop and pc.is_active and (pc.starts_at is null or pc.starts_at <= now()) and (pc.ends_at is null or pc.ends_at > now())
                          and (pc.max_uses is null or pc.uses_count < pc.max_uses)), '[]'::jsonb)
  );
$$;
revoke all on function public.get_public_catalog() from public;
grant execute on function public.get_public_catalog() to anon, authenticated;

-- 7. Note par produit dans l'application (avis de commande + avis boutique publiés)
create or replace view public.product_ratings with (security_invoker = true) as
  select p.id as product_id, p.name, round(avg(x.v)::numeric, 1) as average, count(*) as reviews
  from (
    select ip.product_id, coalesce(r.rating_product, r.rating) as v from public.order_reviews r
      join lateral (select i.product_id from public.customer_order_items i where i.order_id = r.order_id
                    union select si.product_id from public.sale_items si where si.sale_id = r.sale_id) ip on true
     where r.rating is not null
    union all
    select pr.product_id, coalesce(pr.rating_product, pr.rating) from public.product_reviews pr where pr.status = 'published') x
  join public.products p on p.id = x.product_id
  group by p.id, p.name;
grant select on public.product_ratings to authenticated;

notify pgrst, 'reload schema';
