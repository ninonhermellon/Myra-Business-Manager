-- ============================================================================
-- Myra Business Manager V36 — Centre de notifications, boutique enrichie, codes promo en ligne,
-- suivi de commande public. Ajouts uniquement, rejouable.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Historique des notifications (une ligne par événement) + lecture par personne
-- ---------------------------------------------------------------------------
create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  title text not null,
  body text,
  url text,
  tag text,
  actor uuid,
  created_at timestamptz not null default now()
);
create index if not exists app_notifications_created_idx on public.app_notifications (created_at desc);
alter table public.app_notifications enable row level security;

create table if not exists public.app_notification_reads (
  notification_id uuid not null references public.app_notifications(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);
create index if not exists app_notification_reads_user_idx on public.app_notification_reads (user_id);
alter table public.app_notification_reads enable row level security;

-- Qui voit quoi (mêmes règles que les notifications push)
create or replace function private.myra_notif_allowed(p_kind text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_kind
    when 'orders'   then private.current_staff_role() is not null
    when 'sales'    then private.current_staff_role() in ('owner','super_admin','admin','manager','accountant','sales')
    when 'payments' then private.current_staff_role() in ('owner','super_admin','admin','manager','accountant')
    when 'reviews'  then private.current_staff_role() in ('owner','super_admin','admin','manager','sales')
    when 'stock'    then private.current_staff_role() in ('owner','super_admin','admin','manager','stock_manager')
    else private.current_staff_role() in ('owner','super_admin','admin','manager') end
$$;
revoke all on function private.myra_notif_allowed(text) from public, anon;
grant execute on function private.myra_notif_allowed(text) to authenticated;

revoke all on public.app_notifications, public.app_notification_reads from anon;
grant select on public.app_notifications to authenticated;
grant select, insert, delete on public.app_notification_reads to authenticated;

drop policy if exists app_notifications_read on public.app_notifications;
create policy app_notifications_read on public.app_notifications for select to authenticated
  using ((actor is null or actor <> (select auth.uid())) and private.myra_notif_allowed(kind));

drop policy if exists app_notification_reads_select on public.app_notification_reads;
create policy app_notification_reads_select on public.app_notification_reads for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists app_notification_reads_insert on public.app_notification_reads;
create policy app_notification_reads_insert on public.app_notification_reads for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists app_notification_reads_delete on public.app_notification_reads;
create policy app_notification_reads_delete on public.app_notification_reads for delete to authenticated using (user_id = (select auth.uid()));

-- Tout marquer comme lu (uniquement ce que la personne a le droit de voir)
create or replace function public.mark_all_notifications_read() returns integer
language sql security invoker set search_path = '' as $$
  with ins as (
    insert into public.app_notification_reads (notification_id, user_id)
    select n.id, auth.uid() from public.app_notifications n
    where not exists (select 1 from public.app_notification_reads r where r.notification_id = n.id and r.user_id = auth.uid())
    on conflict do nothing returning 1)
  select count(*)::int from ins
$$;
revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- Temps réel : la cloche se met à jour instantanément
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_notifications') then
    alter publication supabase_realtime add table public.app_notifications;
  end if;
exception when undefined_object then null; end $$;

-- Chaque événement est désormais enregistré dans l'historique, puis envoyé en push aux appareils abonnés
create or replace function private.myra_push(p_kind text, p_title text, p_body text, p_url text, p_tag text, p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.push_config%rowtype;
begin
  begin
    insert into public.app_notifications (kind, title, body, url, tag, actor) values (p_kind, left(p_title, 160), left(p_body, 600), p_url, p_tag, p_actor);
    if random() < 0.02 then delete from public.app_notifications where created_at < now() - interval '120 days'; end if;
  exception when others then raise warning 'Historique de notification non enregistré : %', sqlerrm; end;
  if not exists (select 1 from public.push_subscriptions) then return; end if;
  select * into c from public.push_config limit 1;
  if not found then return; end if;
  perform net.http_post(
    url := c.function_url,
    body := jsonb_build_object('action', 'event', 'kind', p_kind, 'title', p_title, 'body', p_body, 'url', p_url, 'tag', p_tag, 'actor', p_actor),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-myra-hook', c.hook_secret),
    timeout_milliseconds := 8000);
exception when others then
  raise warning 'Notification non envoyée : %', sqlerrm;
end $$;
revoke all on function private.myra_push(text,text,text,text,text,uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Boutique : image d'accueil, bandeau d'annonce, horaires, réseaux sociaux, promotions affichées
-- ---------------------------------------------------------------------------
alter table public.shop_settings add column if not exists hero_image_url text;
alter table public.shop_settings add column if not exists announcement text;
alter table public.shop_settings add column if not exists hours text default 'Du lundi au samedi, 8 h – 19 h';
alter table public.shop_settings add column if not exists facebook_url text;
alter table public.shop_settings add column if not exists instagram_url text;
alter table public.shop_settings add column if not exists tiktok_url text;
alter table public.promo_campaigns add column if not exists show_on_shop boolean not null default false;

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
        'rating', (select round(avg(r.rating)::numeric, 1) from public.order_reviews r
                   where r.rating is not null and (exists (select 1 from public.customer_order_items i where i.order_id = r.order_id and i.product_id = p.id)
                                                   or exists (select 1 from public.sale_items si where si.sale_id = r.sale_id and si.product_id = p.id))),
        'reviews', (select count(*) from public.order_reviews r
                    where r.rating is not null and (exists (select 1 from public.customer_order_items i where i.order_id = r.order_id and i.product_id = p.id)
                                                    or exists (select 1 from public.sale_items si where si.sale_id = r.sale_id and si.product_id = p.id)))
      ) order by (p.stock_quantity > 0) desc, p.name) from public.products p where p.is_active and p.sale_price > 0), '[]'::jsonb),
    -- les plus commandés (90 derniers jours) : identifiants seulement, aucun chiffre de vente publié
    'popular', coalesce((select jsonb_agg(x.product_id order by x.q desc) from (
        select t.product_id, sum(t.q) q from (
          select si.product_id, si.quantity q from public.sale_items si join public.sales s on s.id = si.sale_id
            where s.status in ('confirmed','partially_paid','paid') and s.sale_date > now() - interval '90 days'
          union all
          select i.product_id, i.quantity from public.customer_order_items i join public.customer_orders o on o.id = i.order_id
            where o.status not in ('cancelled','converted') and o.created_at > now() - interval '90 days') t
        join public.products p on p.id = t.product_id and p.is_active and p.sale_price > 0
        group by t.product_id order by sum(t.q) desc limit 8) x), '[]'::jsonb),
    -- promotions que l'équipe a choisi d'afficher sur la boutique
    'promos', coalesce((select jsonb_agg(jsonb_build_object('name', pc.name, 'code', pc.code, 'description', pc.description, 'type', pc.discount_type,
                          'value', pc.discount_value, 'min_order', pc.min_order_amount, 'ends_at', pc.ends_at) order by pc.ends_at nulls last)
                        from public.promo_campaigns pc
                        where pc.show_on_shop and pc.is_active and (pc.starts_at is null or pc.starts_at <= now()) and (pc.ends_at is null or pc.ends_at > now())
                          and (pc.max_uses is null or pc.uses_count < pc.max_uses)), '[]'::jsonb)
  );
$$;
revoke all on function public.get_public_catalog() from public;
grant execute on function public.get_public_catalog() to anon, authenticated;

-- Vérification d'un code promo avant l'envoi de la commande
create or replace function private.myra_promo_discount(p_code text, p_subtotal numeric, out promo_id uuid, out promo_name text, out discount numeric)
language plpgsql stable security definer set search_path = '' as $$
declare p public.promo_campaigns%rowtype;
begin
  select * into p from public.promo_campaigns where code = upper(trim(coalesce(p_code, '')));
  if not found or not p.is_active or (p.starts_at is not null and p.starts_at > now()) or (p.ends_at is not null and p.ends_at <= now())
     or (p.max_uses is not null and p.uses_count >= p.max_uses) then raise exception 'Code promo invalide ou expiré.'; end if;
  if coalesce(p_subtotal, 0) < p.min_order_amount then raise exception 'Ce code est valable dès % d''achat.', private.myra_fcfa(p.min_order_amount); end if;
  promo_id := p.id; promo_name := p.name;
  discount := least(coalesce(p_subtotal, 0), case when p.discount_type = 'percent' then round(p_subtotal * p.discount_value / 100) else p.discount_value end);
end $$;
revoke all on function private.myra_promo_discount(text, numeric) from public, anon, authenticated;

create or replace function public.check_public_promo(p_code text, p_subtotal numeric)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r record;
begin
  select * into r from private.myra_promo_discount(p_code, p_subtotal);
  return jsonb_build_object('name', r.promo_name, 'discount', r.discount, 'code', upper(trim(p_code)));
end $$;
revoke all on function public.check_public_promo(text, numeric) from public;
grant execute on function public.check_public_promo(text, numeric) to anon, authenticated;

-- Commande publique : identique à la V31 + code promo facultatif (remise recalculée par le serveur)
drop function if exists public.place_public_order(text,text,text,text,text,date,text,jsonb);
create or replace function public.place_public_order(
  p_name text, p_phone text, p_whatsapp text, p_address text, p_zone text,
  p_delivery_date date, p_notes text, p_items jsonb, p_promo_code text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_wa text := nullif(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'), '');
  v_name text := left(trim(coalesce(p_name, '')), 120);
  v_customer uuid; v_order uuid; v_number text; v_sub numeric(14,2) := 0; v_item jsonb; v_prod record; v_qty numeric; v_lines int := 0;
  v_shop public.shop_settings%rowtype; v_promo record; v_disc numeric(14,2) := 0;
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
  if (select count(*) from public.customer_orders o where o.source = 'web' and o.created_at > now() - interval '1 hour'
        and regexp_replace(coalesce((select c.phone from public.customers c where c.id = o.customer_id), ''), '\D', '', 'g') = v_phone) >= 3 then
    raise exception 'Vous avez déjà passé plusieurs commandes récemment. Nous vous contactons très vite.';
  end if;
  if (select count(*) from public.customer_orders o where o.source = 'web' and o.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Trop de commandes en ce moment, réessayez dans quelques minutes ou écrivez-nous sur WhatsApp.';
  end if;

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

  if nullif(trim(coalesce(p_promo_code, '')), '') is not null then
    select * into v_promo from private.myra_promo_discount(p_promo_code, v_sub);
    v_disc := v_promo.discount;
    update public.promo_campaigns set uses_count = uses_count + 1, updated_at = now() where id = v_promo.promo_id;
    update public.customer_orders set notes = concat_ws(E'\n', notes, 'Code promo ' || upper(trim(p_promo_code)) || ' (' || v_promo.promo_name || ') : − ' || private.myra_fcfa(v_disc)) where id = v_order;
  end if;
  update public.customer_orders set subtotal = v_sub, discount = v_disc, total = v_sub - v_disc where id = v_order;
  return jsonb_build_object('order_number', v_number, 'subtotal', v_sub, 'discount', v_disc, 'total', v_sub - v_disc, 'lines', v_lines);
end $$;
revoke all on function public.place_public_order(text,text,text,text,text,date,text,jsonb,text) from public;
grant execute on function public.place_public_order(text,text,text,text,text,date,text,jsonb,text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Suivi de commande public : numéro de commande + téléphone du client (les 8 derniers chiffres)
-- ---------------------------------------------------------------------------
create or replace function public.get_public_order(p_number text, p_phone text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare o record; v_digits text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 8); v_sale_status text; v_paid numeric;
begin
  if length(v_digits) < 8 or length(trim(coalesce(p_number, ''))) < 4 then raise exception 'Indiquez le numéro de commande et votre téléphone.'; end if;
  select co.*, c.full_name, c.phone as cphone into o from public.customer_orders co left join public.customers c on c.id = co.customer_id
   where upper(co.order_number) = upper(trim(p_number));
  if not found or right(regexp_replace(coalesce(o.cphone, ''), '\D', '', 'g'), 8) <> v_digits then
    raise exception 'Commande introuvable. Vérifiez le numéro de commande et le téléphone.';
  end if;
  if o.converted_sale_id is not null then select status, amount_paid into v_sale_status, v_paid from public.sales where id = o.converted_sale_id; end if;
  return jsonb_build_object(
    'number', o.order_number, 'status', o.status, 'created_at', o.created_at, 'updated_at', o.updated_at, 'order_date', o.order_date,
    'requested_delivery_at', o.requested_delivery_at, 'delivery_zone', o.delivery_zone, 'delivery_address', o.delivery_address,
    'customer', split_part(coalesce(o.full_name, ''), ' ', 1),
    'subtotal', o.subtotal, 'discount', o.discount, 'delivery_fee', o.delivery_fee, 'total', o.total,
    'sale_status', v_sale_status, 'paid', v_paid,
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.product_name, 'unit', i.unit, 'quantity', i.quantity, 'price', i.unit_price, 'total', i.line_total,
                        'image', (select p.image_url from public.products p where p.id = i.product_id))) from public.customer_order_items i where i.order_id = o.id), '[]'::jsonb),
    'company', (select jsonb_build_object('name', cs.company_name, 'phone', cs.phone, 'currency', coalesce(cs.currency_label, 'FCFA')) from public.company_settings cs order by cs.created_at limit 1),
    'whatsapp', (select s2.whatsapp from public.shop_settings s2 limit 1));
end $$;
revoke all on function public.get_public_order(text, text) from public;
grant execute on function public.get_public_order(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
