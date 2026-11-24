-- ============================================================================
-- Myra Business Manager V30 — performances, sécurité, espace client, avis,
-- parrainage, objectifs, lieu de vente, temps réel.
-- Ajouts uniquement : aucune donnée supprimée. Rejouable sans danger.
-- Prérequis : myra_v29_extensions.sql.
-- ============================================================================

do $$ begin
  if to_regclass('public.stock_locations') is null or to_regclass('public.gift_cards') is null then
    raise exception 'Installation V30 arrêtée, rien n''a été modifié : exécutez d''abord myra_v29_extensions.sql';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Performances : un index pour chaque clé étrangère qui n'en a pas
--    (accélère les jointures et les suppressions quand les données grossissent).
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conrelid as relid, a.attname as col, c.conname
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace and n.nspname = 'public'
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and array_length(c.conkey, 1) = 1
      and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
  loop
    execute format('create index if not exists %I on %s (%I)', left(r.conname, 55) || '_idx', r.tbl, r.col);
  end loop;
end $$;
create index if not exists sales_sale_date_idx on public.sales (sale_date desc);
create index if not exists sales_status_idx on public.sales (status);
create index if not exists payments_payment_date_idx on public.payments (payment_date desc);

-- ---------------------------------------------------------------------------
-- 2. Règles d'accès V29 sans doublon : la lecture a sa règle, l'écriture est
--    découpée en ajout / modification / suppression (un seul contrôle par lecture).
-- ---------------------------------------------------------------------------
create or replace function private.myra_v29_policies(p_table text, p_read text[], p_write text[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_cmd text;
begin
  execute format('alter table public.%I enable row level security', p_table);
  execute format('drop policy if exists %I on public.%I', p_table||'_v29_read', p_table);
  execute format('drop policy if exists %I on public.%I', p_table||'_v29_write', p_table);
  execute format('create policy %I on public.%I for select to authenticated using ((select private.current_staff_role()) = any(%L::text[]))', p_table||'_v29_read', p_table, p_read);
  foreach v_cmd in array array['insert','update','delete'] loop
    execute format('drop policy if exists %I on public.%I', p_table||'_v29_'||v_cmd, p_table);
  end loop;
  execute format('create policy %I on public.%I for insert to authenticated with check ((select private.current_staff_role()) = any(%L::text[]))', p_table||'_v29_insert', p_table, p_write);
  execute format('create policy %I on public.%I for update to authenticated using ((select private.current_staff_role()) = any(%L::text[])) with check ((select private.current_staff_role()) = any(%L::text[]))', p_table||'_v29_update', p_table, p_write, p_write);
  execute format('create policy %I on public.%I for delete to authenticated using ((select private.current_staff_role()) = any(%L::text[]))', p_table||'_v29_delete', p_table, p_write);
  execute format('grant select, insert, update, delete on public.%I to authenticated', p_table);
end $$;
revoke all on function private.myra_v29_policies(text,text[],text[]) from public, anon, authenticated;

select private.myra_v29_policies('product_lots',          array['owner','admin','manager','sales','stock_manager','accountant'], array['owner','admin','manager','stock_manager']);
select private.myra_v29_policies('complaints',            array['owner','admin','manager','sales','stock_manager'],              array['owner','admin','manager','sales']);
select private.myra_v29_policies('customer_prices',       array['owner','admin','manager','sales','accountant'],                 array['owner','admin','manager']);
select private.myra_v29_policies('volume_prices',         array['owner','admin','manager','sales','accountant'],                 array['owner','admin','manager']);
select private.myra_v29_policies('recurring_orders',      array['owner','admin','manager','sales'],                              array['owner','admin','manager','sales']);
select private.myra_v29_policies('payment_schedules',     array['owner','admin','manager','sales','accountant'],                 array['owner','admin','manager','accountant']);
select private.myra_v29_policies('catering_events',       array['owner','admin','manager','sales','accountant'],                 array['owner','admin','manager','sales']);
select private.myra_v29_policies('gift_cards',            array['owner','admin','manager','sales','accountant'],                 array['owner','admin','manager']);
select private.myra_v29_policies('gift_card_transactions',array['owner','admin','manager','sales','accountant'],                 array['owner','admin','manager']);
select private.myra_v29_policies('sales_targets',         array['owner','admin','manager'],                                      array['owner','admin','manager']);
select private.myra_v29_policies('employees',             array['owner','admin','manager','accountant'],                         array['owner','admin','manager']);
select private.myra_v29_policies('attendance',            array['owner','admin','manager','accountant'],                         array['owner','admin','manager']);
select private.myra_v29_policies('salary_advances',       array['owner','admin','manager','accountant'],                         array['owner','admin','manager','accountant']);
select private.myra_v29_policies('stock_locations',       array['owner','admin','manager','sales','stock_manager','accountant'], array['owner','admin','manager','stock_manager']);
select private.myra_v29_policies('location_stock',        array['owner','admin','manager','sales','stock_manager','accountant'], array['owner','admin','manager','stock_manager','sales']);
select private.myra_v29_policies('stock_transfers',       array['owner','admin','manager','sales','stock_manager','accountant'], array['owner','admin','manager','stock_manager','sales']);
select private.myra_v29_policies('inventory_sessions',    array['owner','admin','manager','stock_manager'],                      array['owner','admin','manager','stock_manager']);
select private.myra_v29_policies('inventory_lines',       array['owner','admin','manager','stock_manager'],                      array['owner','admin','manager','stock_manager']);
select private.myra_v29_policies('recurring_expenses',    array['owner','admin','manager','accountant'],                         array['owner','admin','manager','accountant']);
select private.myra_v29_policies('expense_budgets',       array['owner','admin','manager','accountant'],                         array['owner','admin','manager','accountant']);
select private.myra_v29_policies('message_campaigns',     array['owner','admin','manager','sales'],                              array['owner','admin','manager','sales']);

-- ---------------------------------------------------------------------------
-- 3. Lieu de vente (comparaison boutique / marché…) et parrainage
-- ---------------------------------------------------------------------------
alter table public.sales add column if not exists location_id uuid references public.stock_locations(id) on delete set null;
create index if not exists sales_location_id_idx on public.sales (location_id);
alter table public.customers add column if not exists referred_by uuid references public.customers(id) on delete set null;
create index if not exists customers_referred_by_idx on public.customers (referred_by);

create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.customers(id) on delete cascade,
  referee_id uuid not null unique references public.customers(id) on delete cascade,
  gift_card_id uuid references public.gift_cards(id) on delete set null,
  amount numeric(14,2) not null default 0 check (amount >= 0),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists referral_rewards_referrer_idx on public.referral_rewards (referrer_id);
create index if not exists referral_rewards_gift_card_idx on public.referral_rewards (gift_card_id);
create index if not exists referral_rewards_created_by_idx on public.referral_rewards (created_by);

-- ---------------------------------------------------------------------------
-- 4. Objectifs de l'entreprise (par mois)
-- ---------------------------------------------------------------------------
create table if not exists public.business_goals (
  id uuid primary key default gen_random_uuid(),
  month date not null unique,
  sales_target numeric(14,2) not null default 0 check (sales_target >= 0),
  new_customers_target integer not null default 0 check (new_customers_target >= 0),
  notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. Espace client en ligne (lien personnel sans mot de passe)
--    Le lien contient un jeton aléatoire de 244 bits, révocable, avec date d'expiration.
-- ---------------------------------------------------------------------------
create table if not exists public.customer_portal_links (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  expires_at timestamptz not null default now() + interval '365 days',
  revoked boolean not null default false,
  last_seen_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists customer_portal_links_customer_idx on public.customer_portal_links (customer_id);
create index if not exists customer_portal_links_created_by_idx on public.customer_portal_links (created_by);

create or replace function public.get_customer_portal(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare l public.customer_portal_links%rowtype; c public.customers%rowtype; v jsonb;
begin
  if p_token is null or length(p_token) < 40 then raise exception 'Lien invalide'; end if;
  select * into l from public.customer_portal_links where token = p_token;
  if not found or l.revoked or l.expires_at < now() then raise exception 'Lien invalide ou expiré'; end if;
  update public.customer_portal_links set last_seen_at = now() where id = l.id;
  select * into c from public.customers where id = l.customer_id;
  select jsonb_build_object(
    'company', (select jsonb_build_object('name', cs.company_name, 'phone', cs.phone, 'email', cs.email, 'address', cs.address, 'logo', cs.logo_url, 'currency', coalesce(cs.currency_label, 'FCFA')) from public.company_settings cs order by cs.created_at limit 1),
    'customer', jsonb_build_object('name', c.full_name, 'company', c.company_name),
    'points', coalesce((select la.points_balance from public.loyalty_accounts la where la.customer_id = c.id), 0),
    'outstanding', coalesce((select sum(s.total - s.amount_paid) from public.sales s where s.customer_id = c.id and s.status in ('confirmed','partially_paid')), 0),
    'sales', coalesce((select jsonb_agg(x order by x->>'date' desc) from (
        select jsonb_build_object('number', s.sale_number, 'date', s.sale_date, 'status', s.status, 'subtotal', s.subtotal, 'discount', s.discount,
          'shipping', s.shipping_fee, 'total', s.total, 'paid', s.amount_paid,
          'items', coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'unit', p.unit, 'quantity', si.quantity, 'price', si.unit_price, 'total', si.line_total))
                             from public.sale_items si join public.products p on p.id = si.product_id where si.sale_id = s.id), '[]'::jsonb)) as x
        from public.sales s where s.customer_id = c.id and s.status not in ('draft','cancelled') order by s.sale_date desc limit 100) t), '[]'::jsonb)
  ) into v;
  return v;
end $$;
revoke all on function public.get_customer_portal(text) from public;
grant execute on function public.get_customer_portal(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Avis clients après livraison (lien personnel, une seule réponse par lien)
-- ---------------------------------------------------------------------------
create table if not exists public.order_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.customer_orders(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  rating smallint check (rating between 1 and 5),
  comment text check (comment is null or length(comment) <= 1000),
  requested_at timestamptz not null default now(),
  submitted_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  check (order_id is not null or sale_id is not null)
);
create index if not exists order_reviews_order_idx on public.order_reviews (order_id);
create index if not exists order_reviews_sale_idx on public.order_reviews (sale_id);
create index if not exists order_reviews_customer_idx on public.order_reviews (customer_id);
create index if not exists order_reviews_created_by_idx on public.order_reviews (created_by);

create or replace function public.get_review_request(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r public.order_reviews%rowtype;
begin
  if p_token is null or length(p_token) < 40 then raise exception 'Lien invalide'; end if;
  select * into r from public.order_reviews where token = p_token;
  if not found then raise exception 'Lien invalide'; end if;
  return jsonb_build_object(
    'company', (select cs.company_name from public.company_settings cs order by cs.created_at limit 1),
    'customer', (select split_part(c.full_name, ' ', 1) from public.customers c where c.id = r.customer_id),
    'reference', coalesce((select o.order_number from public.customer_orders o where o.id = r.order_id), (select s.sale_number from public.sales s where s.id = r.sale_id)),
    'items', coalesce(
      (select jsonb_agg(distinct i.product_name) from public.customer_order_items i where i.order_id = r.order_id),
      (select jsonb_agg(distinct p.name) from public.sale_items si join public.products p on p.id = si.product_id where si.sale_id = r.sale_id), '[]'::jsonb),
    'submitted', r.submitted_at is not null, 'rating', r.rating);
end $$;
revoke all on function public.get_review_request(text) from public;
grant execute on function public.get_review_request(text) to anon, authenticated;

create or replace function public.submit_review(p_token text, p_rating integer, p_comment text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'Note invalide'; end if;
  update public.order_reviews set rating = p_rating, comment = nullif(left(trim(coalesce(p_comment, '')), 1000), ''), submitted_at = now()
  where token = p_token and submitted_at is null returning id into v_id;
  if v_id is null then raise exception 'Ce lien a déjà été utilisé ou n''existe pas'; end if;
  return true;
end $$;
revoke all on function public.submit_review(text,integer,text) from public;
grant execute on function public.submit_review(text,integer,text) to anon, authenticated;

-- Note moyenne par produit (calculée avec les droits de la personne connectée)
create or replace view public.product_ratings with (security_invoker = true) as
  select p.id as product_id, p.name, round(avg(r.rating)::numeric, 1) as average, count(*) as reviews
  from public.order_reviews r
  join lateral (
    select i.product_id from public.customer_order_items i where i.order_id = r.order_id
    union select si.product_id from public.sale_items si where si.sale_id = r.sale_id
  ) x on true
  join public.products p on p.id = x.product_id
  where r.rating is not null
  group by p.id, p.name;
grant select on public.product_ratings to authenticated;

-- ---------------------------------------------------------------------------
-- Règles d'accès des nouvelles tables
-- ---------------------------------------------------------------------------
select private.myra_v29_policies('referral_rewards',      array['owner','admin','manager','sales','accountant'], array['owner','admin','manager']);
select private.myra_v29_policies('business_goals',        array['owner','admin','manager','sales','accountant'], array['owner','admin','manager']);
select private.myra_v29_policies('customer_portal_links', array['owner','admin','manager','sales'],              array['owner','admin','manager','sales']);
select private.myra_v29_policies('order_reviews',         array['owner','admin','manager','sales'],              array['owner','admin','manager','sales']);

-- ---------------------------------------------------------------------------
-- 7. Temps réel : les ventes, commandes et paiements apparaissent tout de suite
--    sur les autres appareils (les règles d'accès s'appliquent toujours).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['sales','customer_orders','payments'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
