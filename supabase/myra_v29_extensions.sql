-- ============================================================================
-- Myra Business Manager V29 — 16 nouvelles fonctionnalités
-- À exécuter UNE fois dans Supabase > SQL Editor (rejouable sans danger :
-- "if not exists", "create or replace", "drop policy if exists").
-- Ne supprime aucune donnée. N'altère pas les fonctions existantes.
--
-- Rôles utilisés (fonction existante private.current_staff_role()) :
--   tous : owner, admin, manager, sales, stock_manager, accountant
--   direction : owner, admin, manager
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Colonnes ajoutées aux tables existantes
-- ---------------------------------------------------------------------------
alter table public.products  add column if not exists barcode text;
alter table public.products  add column if not exists wholesale_price numeric(14,2) check (wholesale_price is null or wholesale_price >= 0);
create index if not exists products_barcode_idx on public.products(barcode) where barcode is not null;

alter table public.customers add column if not exists price_tier text not null default 'retail';
alter table public.customers add column if not exists credit_limit numeric(14,2) check (credit_limit is null or credit_limit >= 0);
alter table public.customers add column if not exists payment_terms_days integer check (payment_terms_days is null or payment_terms_days between 0 and 365);
alter table public.customers add column if not exists birth_date date;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.customers'::regclass and conname='customers_price_tier_check') then
    alter table public.customers add constraint customers_price_tier_check check (price_tier in ('retail','wholesale'));
  end if;
end $$;

alter table public.customer_orders add column if not exists recurring_order_id uuid;
alter table public.customer_orders add column if not exists delivery_driver text;

-- ---------------------------------------------------------------------------
-- Aide : création des politiques d'accès standard pour une table
-- ---------------------------------------------------------------------------
create or replace function private.myra_v29_policies(p_table text, p_read text[], p_write text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  execute format('alter table public.%I enable row level security', p_table);
  execute format('drop policy if exists %I on public.%I', p_table||'_v29_read', p_table);
  execute format('drop policy if exists %I on public.%I', p_table||'_v29_write', p_table);
  execute format('create policy %I on public.%I for select to authenticated using ((select private.current_staff_role()) = any(%L::text[]))', p_table||'_v29_read', p_table, p_read);
  execute format('create policy %I on public.%I for all to authenticated using ((select private.current_staff_role()) = any(%L::text[])) with check ((select private.current_staff_role()) = any(%L::text[]))', p_table||'_v29_write', p_table, p_write, p_write);
  execute format('grant select, insert, update, delete on public.%I to authenticated', p_table);
end $$;
revoke all on function private.myra_v29_policies(text,text[],text[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Lots et dates limites (DLC)
-- ---------------------------------------------------------------------------
create table if not exists public.product_lots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  lot_number text not null unique,
  production_date date not null default current_date,
  expiry_date date,
  quantity_initial numeric(14,3) not null default 0 check (quantity_initial >= 0),
  quantity_remaining numeric(14,3) not null default 0 check (quantity_remaining >= 0),
  notes text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists product_lots_expiry_idx on public.product_lots(expiry_date) where quantity_remaining > 0;

-- ---------------------------------------------------------------------------
-- 3. Retours et réclamations
-- ---------------------------------------------------------------------------
create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  lot_id uuid references public.product_lots(id) on delete set null,
  category text not null default 'quality' check (category in ('damaged','quality','delivery','missing','other')),
  description text not null,
  resolution text not null default 'none' check (resolution in ('none','refund','voucher','replacement')),
  resolution_amount numeric(14,2) not null default 0 check (resolution_amount >= 0),
  status text not null default 'open' check (status in ('open','resolved','rejected')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ---------------------------------------------------------------------------
-- 4. Prix par client et prix par quantité
-- ---------------------------------------------------------------------------
create table if not exists public.customer_prices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  price numeric(14,2) not null check (price >= 0),
  notes text,
  created_at timestamptz not null default now(),
  unique (customer_id, product_id)
);
create table if not exists public.volume_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  min_quantity numeric(14,3) not null check (min_quantity > 0),
  price numeric(14,2) not null check (price >= 0),
  created_at timestamptz not null default now(),
  unique (product_id, min_quantity)
);

-- Prix applicable : prix négocié du client > meilleur prix entre gros (client « gros »),
-- palier de quantité et prix public.
create or replace function public.resolve_price(p_product_id uuid, p_customer_id uuid, p_quantity numeric)
returns numeric language sql stable security invoker set search_path = public as $$
  select coalesce(
    (select cp.price from public.customer_prices cp where cp.product_id = p_product_id and cp.customer_id = p_customer_id),
    least(
      p.sale_price,
      coalesce((select vp.price from public.volume_prices vp where vp.product_id = p_product_id and vp.min_quantity <= coalesce(p_quantity,1) order by vp.min_quantity desc limit 1), p.sale_price),
      case when (select c.price_tier from public.customers c where c.id = p_customer_id) = 'wholesale' then coalesce(p.wholesale_price, p.sale_price) else p.sale_price end
    ))
  from public.products p where p.id = p_product_id
$$;
grant execute on function public.resolve_price(uuid,uuid,numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Commandes récurrentes (abonnements clients)
-- ---------------------------------------------------------------------------
create table if not exists public.recurring_orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  label text,
  frequency text not null default 'weekly' check (frequency in ('weekly','biweekly','monthly')),
  next_date date not null default current_date,
  items jsonb not null default '[]'::jsonb,
  delivery_zone text,
  delivery_address text,
  delivery_fee numeric(14,2) not null default 0 check (delivery_fee >= 0),
  is_active boolean not null default true,
  last_generated_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname='customer_orders_recurring_fk') then
    alter table public.customer_orders add constraint customer_orders_recurring_fk foreign key (recurring_order_id) references public.recurring_orders(id) on delete set null;
  end if;
end $$;

-- Crée les commandes dues (date du jour atteinte) et avance la prochaine date.
create or replace function public.generate_due_recurring_orders()
returns integer language plpgsql security invoker set search_path = public, private as $$
declare r public.recurring_orders%rowtype; v_order uuid; v_sub numeric(14,2); v_count integer := 0; v_item jsonb; v_prod record; v_price numeric;
begin
  if private.current_staff_role() not in ('owner','admin','manager','sales') then raise exception 'Accès refusé'; end if;
  for r in select * from public.recurring_orders where is_active and next_date <= current_date for update skip locked loop
    if jsonb_array_length(r.items) = 0 then continue; end if;
    insert into public.customer_orders(order_number, customer_id, order_date, requested_delivery_at, delivery_address, delivery_zone, delivery_fee, subtotal, discount, total, status, notes, created_by, recurring_order_id)
    values ('ABO-'||to_char(r.next_date,'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)), r.customer_id, now(), r.next_date::timestamptz,
            r.delivery_address, r.delivery_zone, r.delivery_fee, 0, 0, r.delivery_fee, 'confirmed', concat_ws(E'\n', 'Commande récurrente'||coalesce(' : '||r.label,''), r.notes), auth.uid(), r.id)
    returning id into v_order;
    v_sub := 0;
    for v_item in select * from jsonb_array_elements(r.items) loop
      select id, name, unit into v_prod from public.products where id = (v_item->>'product_id')::uuid;
      if not found then continue; end if;
      v_price := public.resolve_price(v_prod.id, r.customer_id, (v_item->>'quantity')::numeric);
      insert into public.customer_order_items(order_id, product_id, product_name, unit, quantity, unit_price, line_total)
      values (v_order, v_prod.id, v_prod.name, v_prod.unit, (v_item->>'quantity')::numeric, v_price, round(v_price*(v_item->>'quantity')::numeric, 2));
      v_sub := v_sub + round(v_price*(v_item->>'quantity')::numeric, 2);
    end loop;
    update public.customer_orders set subtotal = v_sub, total = v_sub + r.delivery_fee where id = v_order;
    update public.recurring_orders set last_generated_at = now(),
      next_date = case r.frequency when 'weekly' then r.next_date + 7 when 'biweekly' then r.next_date + 14 else (r.next_date + interval '1 month')::date end
    where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.generate_due_recurring_orders() from public, anon;
grant execute on function public.generate_due_recurring_orders() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Crédit client : échéancier + vue des encours
-- ---------------------------------------------------------------------------
create table if not exists public.payment_schedules (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  due_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  is_paid boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
create or replace view public.customer_credit with (security_invoker = true) as
  select c.id as customer_id, c.full_name, c.phone, c.credit_limit, c.payment_terms_days,
         coalesce(sum(s.total - s.amount_paid) filter (where s.status in ('confirmed','partially_paid')), 0) as outstanding,
         min(s.sale_date) filter (where s.status in ('confirmed','partially_paid') and s.total > s.amount_paid) as oldest_unpaid_at,
         count(s.id) filter (where s.status in ('confirmed','partially_paid') and s.total > s.amount_paid) as unpaid_sales
  from public.customers c left join public.sales s on s.customer_id = c.id
  group by c.id;
grant select on public.customer_credit to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Traiteur et événements
-- ---------------------------------------------------------------------------
create table if not exists public.catering_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  title text not null,
  event_type text not null default 'wedding' check (event_type in ('wedding','birthday','corporate','funeral','religious','other')),
  event_date timestamptz not null,
  location text,
  guests integer not null default 0 check (guests >= 0),
  price_per_guest numeric(14,2) not null default 0 check (price_per_guest >= 0),
  extra_fees numeric(14,2) not null default 0 check (extra_fees >= 0),
  total_amount numeric(14,2) generated always as (guests * price_per_guest + extra_fees) stored,
  deposit_amount numeric(14,2) not null default 0 check (deposit_amount >= 0),
  deposit_paid numeric(14,2) not null default 0 check (deposit_paid >= 0),
  status text not null default 'quote' check (status in ('quote','confirmed','done','cancelled')),
  menu text,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 8. Bons cadeaux
-- ---------------------------------------------------------------------------
create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  initial_amount numeric(14,2) not null check (initial_amount > 0),
  balance numeric(14,2) not null check (balance >= 0),
  customer_id uuid references public.customers(id) on delete set null,
  buyer_name text,
  expires_at date,
  status text not null default 'active' check (status in ('active','used','expired','cancelled')),
  notes text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.gift_card_transactions (
  id uuid primary key default gen_random_uuid(),
  gift_card_id uuid not null references public.gift_cards(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete set null,
  amount numeric(14,2) not null,
  note text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create or replace function public.redeem_gift_card(p_code text, p_amount numeric, p_sale_id uuid default null, p_note text default null)
returns numeric language plpgsql security definer set search_path = '' as $$
declare g public.gift_cards%rowtype;
begin
  if (select private.current_staff_role()) not in ('owner','admin','manager','sales') then raise exception 'Accès refusé'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Montant invalide'; end if;
  select * into g from public.gift_cards where code = upper(trim(p_code)) for update;
  if not found then raise exception 'Bon cadeau introuvable'; end if;
  if g.status <> 'active' then raise exception 'Ce bon cadeau n''est plus actif'; end if;
  if g.expires_at is not null and g.expires_at < current_date then
    update public.gift_cards set status = 'expired' where id = g.id; raise exception 'Ce bon cadeau est expiré';
  end if;
  if g.balance < p_amount then raise exception 'Solde insuffisant (reste % FCFA)', g.balance; end if;
  update public.gift_cards set balance = balance - p_amount, status = case when balance - p_amount = 0 then 'used' else status end where id = g.id;
  insert into public.gift_card_transactions(gift_card_id, sale_id, amount, note) values (g.id, p_sale_id, -p_amount, p_note);
  return g.balance - p_amount;
end $$;
revoke all on function public.redeem_gift_card(text,numeric,uuid,text) from public, anon;
grant execute on function public.redeem_gift_card(text,numeric,uuid,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Objectifs et commissions des vendeuses + 10. Employés, présences, avances
-- ---------------------------------------------------------------------------
create table if not exists public.sales_targets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references auth.users(id) on delete cascade,
  month date not null,
  target_amount numeric(14,2) not null default 0 check (target_amount >= 0),
  commission_rate numeric(5,2) not null default 0 check (commission_rate between 0 and 100),
  created_at timestamptz not null default now(),
  unique (profile_id, month)
);
-- Liste de l'équipe (nom + rôle) lisible par la direction, sans ouvrir la table des profils.
create or replace function public.get_team_members()
returns table (id uuid, full_name text, role text, is_active boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select private.current_staff_role()) not in ('owner','admin','manager') then raise exception 'Accès refusé'; end if;
  return query select p.id, p.full_name, p.role, p.is_active from public.profiles p order by p.full_name;
end $$;
revoke all on function public.get_team_members() from public, anon;
grant execute on function public.get_team_members() to authenticated;

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  job_title text,
  monthly_salary numeric(14,2) not null default 0 check (monthly_salary >= 0),
  hired_at date,
  is_active boolean not null default true,
  profile_id uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null default current_date,
  status text not null default 'present' check (status in ('present','late','absent','leave','half')),
  check_in time,
  check_out time,
  notes text,
  created_at timestamptz not null default now(),
  unique (employee_id, work_date)
);
create table if not exists public.salary_advances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  advance_date date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  reason text,
  payroll_month date,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 11. Stock par lieu (cuisine, boutique, marché…) et transferts
-- ---------------------------------------------------------------------------
create table if not exists public.stock_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null default 'shop' check (kind in ('kitchen','shop','market','depot','other')),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.location_stock (
  location_id uuid not null references public.stock_locations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity numeric(14,3) not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (location_id, product_id)
);
create table if not exists public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  from_location_id uuid references public.stock_locations(id) on delete set null,
  to_location_id uuid references public.stock_locations(id) on delete set null,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity numeric(14,3) not null check (quantity > 0),
  notes text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
-- Transfert atomique. Lieu vide (null) = stock « non affecté » (stock total – stock réparti).
create or replace function public.transfer_stock(p_from uuid, p_to uuid, p_product uuid, p_quantity numeric, p_notes text default null)
returns uuid language plpgsql security invoker set search_path = public, private as $$
declare v_avail numeric; v_id uuid;
begin
  if private.current_staff_role() not in ('owner','admin','manager','stock_manager','sales') then raise exception 'Accès refusé'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantité invalide'; end if;
  if p_from is not distinct from p_to then raise exception 'Choisissez deux lieux différents'; end if;
  perform 1 from public.products where id = p_product for update;
  if p_from is null then
    select p.stock_quantity - coalesce((select sum(ls.quantity) from public.location_stock ls where ls.product_id = p_product), 0)
      into v_avail from public.products p where p.id = p_product;
  else
    select quantity into v_avail from public.location_stock where location_id = p_from and product_id = p_product for update;
  end if;
  if coalesce(v_avail,0) < p_quantity then raise exception 'Stock insuffisant à l''origine (disponible : %)', coalesce(v_avail,0); end if;
  if p_from is not null then
    update public.location_stock set quantity = quantity - p_quantity, updated_at = now() where location_id = p_from and product_id = p_product;
  end if;
  if p_to is not null then
    insert into public.location_stock(location_id, product_id, quantity) values (p_to, p_product, p_quantity)
    on conflict (location_id, product_id) do update set quantity = public.location_stock.quantity + excluded.quantity, updated_at = now();
  end if;
  insert into public.stock_transfers(from_location_id, to_location_id, product_id, quantity, notes) values (p_from, p_to, p_product, p_quantity, p_notes) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.transfer_stock(uuid,uuid,uuid,numeric,text) from public, anon;
grant execute on function public.transfer_stock(uuid,uuid,uuid,numeric,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 14. Inventaire par scan : comptage puis application des écarts
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_sessions (
  id uuid primary key default gen_random_uuid(),
  label text not null default 'Inventaire',
  status text not null default 'open' check (status in ('open','applied','cancelled')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);
create table if not exists public.inventory_lines (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.inventory_sessions(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  counted_quantity numeric(14,3) not null check (counted_quantity >= 0),
  expected_quantity numeric(14,3),
  created_at timestamptz not null default now(),
  unique (session_id, product_id)
);
create or replace function public.apply_inventory(p_session_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare s public.inventory_sessions%rowtype; l record; v_diff numeric; v_count integer := 0;
begin
  if (select private.current_staff_role()) not in ('owner','admin','manager','stock_manager') then raise exception 'Accès refusé'; end if;
  select * into s from public.inventory_sessions where id = p_session_id for update;
  if not found then raise exception 'Inventaire introuvable'; end if;
  if s.status <> 'open' then raise exception 'Cet inventaire est déjà appliqué ou annulé'; end if;
  for l in select il.product_id, il.counted_quantity, p.stock_quantity from public.inventory_lines il join public.products p on p.id = il.product_id where il.session_id = p_session_id for update of p loop
    v_diff := l.counted_quantity - l.stock_quantity;
    if v_diff <> 0 then
      begin
        insert into public.product_movements(product_id, movement_type, quantity, reference_type, reference_id, notes)
        values (l.product_id, case when v_diff > 0 then 'adjustment_in' else 'adjustment_out' end, abs(v_diff), 'inventory', p_session_id, 'Écart d''inventaire : '||s.label);
      exception when check_violation then
        -- Si la base n'accepte pas l'origine « inventory », on trace l'écart comme un ajustement simple.
        insert into public.product_movements(product_id, movement_type, quantity, notes)
        values (l.product_id, case when v_diff > 0 then 'adjustment_in' else 'adjustment_out' end, abs(v_diff), 'Écart d''inventaire : '||s.label);
      end;
      -- Valeur absolue : correcte qu'un déclencheur existant ait déjà ajusté le stock ou non.
      update public.products set stock_quantity = l.counted_quantity, updated_at = now() where id = l.product_id;
      v_count := v_count + 1;
    end if;
  end loop;
  update public.inventory_sessions set status = 'applied', applied_at = now() where id = p_session_id;
  return v_count;
end $$;
revoke all on function public.apply_inventory(uuid) from public, anon, authenticated;
grant execute on function public.apply_inventory(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 15. Dépenses récurrentes et budget mensuel
-- ---------------------------------------------------------------------------
create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  amount numeric(14,2) not null check (amount > 0),
  day_of_month integer not null default 1 check (day_of_month between 1 and 28),
  payment_method text not null default 'cash' check (payment_method in ('cash','mtn_momo','airtel_money','bank_transfer','card','other')),
  payee text,
  is_active boolean not null default true,
  last_generated_month date,
  notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.expense_budgets (
  id uuid primary key default gen_random_uuid(),
  month date not null unique,
  amount numeric(14,2) not null check (amount >= 0),
  notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 16. Historique des messages groupés
-- ---------------------------------------------------------------------------
create table if not exists public.message_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  audience text not null,
  template text not null,
  recipients integer not null default 0,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Politiques d'accès (lecture : toute l'équipe concernée ; écriture : selon le module)
-- ---------------------------------------------------------------------------
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
select private.myra_v29_policies('location_stock',        array['owner','admin','manager','sales','stock_manager','accountant'], array['owner','admin','manager','stock_manager']);
select private.myra_v29_policies('stock_transfers',       array['owner','admin','manager','sales','stock_manager','accountant'], array['owner','admin','manager','stock_manager','sales']);
select private.myra_v29_policies('inventory_sessions',    array['owner','admin','manager','stock_manager'],                      array['owner','admin','manager','stock_manager']);
select private.myra_v29_policies('inventory_lines',       array['owner','admin','manager','stock_manager'],                      array['owner','admin','manager','stock_manager']);
select private.myra_v29_policies('recurring_expenses',    array['owner','admin','manager','accountant'],                         array['owner','admin','manager','accountant']);
select private.myra_v29_policies('expense_budgets',       array['owner','admin','manager','accountant'],                         array['owner','admin','manager','accountant']);
select private.myra_v29_policies('message_campaigns',     array['owner','admin','manager','sales'],                              array['owner','admin','manager','sales']);

-- Vérification rapide : doit lister 21 tables avec rowsecurity = true
select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename in
 ('product_lots','complaints','customer_prices','volume_prices','recurring_orders','payment_schedules','catering_events',
  'gift_cards','gift_card_transactions','sales_targets','employees','attendance','salary_advances','stock_locations',
  'location_stock','stock_transfers','inventory_sessions','inventory_lines','recurring_expenses','expense_budgets','message_campaigns')
order by tablename;
