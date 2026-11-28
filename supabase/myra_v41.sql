-- ============================================================================
-- LSM Business Manager V41
--  1. Trésorerie complète (comptes Espèces / MTN MoMo / Banque, apports, retraits, transferts, rapprochement)
--  2. Bénéfice réel du mois (catégories de dépenses, coût des produits vendus)
--  3. Caisse rapide au comptoir (vente + encaissement en une fois)
--  4. Planning de production et besoins en matières premières
--  6. Retours et remboursements clients
--  7. Reçu en ligne (lien WhatsApp) et envoi automatique (API WhatsApp Business, si configurée)
--  9. Sauvegarde automatique chaque nuit (30 jours)
-- 10. Paiement MTN MoMo validé automatiquement (API MoMo, si configurée)
-- (5. catalogue Facebook/Instagram/WhatsApp et 8. sons/alertes : côté fonctions serveur et application)
-- Rejouable. Fuseau : Africa/Brazzaville.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Trésorerie
-- ---------------------------------------------------------------------------
insert into public.cash_accounts (name, account_type, provider, opening_balance, current_balance, is_active)
select 'MTN MoMo', 'mobile_money', 'MTN', 0, 0, true where not exists (select 1 from public.cash_accounts where account_type = 'mobile_money' and provider ilike 'MTN%');
insert into public.cash_accounts (name, account_type, provider, opening_balance, current_balance, is_active)
select 'Airtel Money', 'mobile_money', 'Airtel', 0, 0, false where not exists (select 1 from public.cash_accounts where account_type = 'mobile_money' and provider ilike 'Airtel%');
insert into public.cash_accounts (name, account_type, provider, opening_balance, current_balance, is_active)
select 'Banque', 'bank', null, 0, 0, false where not exists (select 1 from public.cash_accounts where account_type = 'bank');

-- Compte du bon type selon le mode de paiement (MTN → compte MTN, Airtel → compte Airtel…)
create or replace function private.myra_cash_account_for(p_account uuid, p_method text) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select id from public.cash_accounts where id = p_account and is_active),
    (select id from public.cash_accounts where is_active and account_type = 'mobile_money' and p_method = 'mtn_momo' and coalesce(provider, name) ilike '%MTN%' order by created_at limit 1),
    (select id from public.cash_accounts where is_active and account_type = 'mobile_money' and p_method = 'airtel_money' and coalesce(provider, name) ilike '%Airtel%' order by created_at limit 1),
    (select id from public.cash_accounts where is_active and account_type = case
        when p_method in ('mtn_momo','airtel_money') then 'mobile_money'
        when p_method in ('bank_transfer','card') then 'bank' else 'cash' end order by created_at limit 1),
    (select id from public.cash_accounts where is_active and name = 'Caisse principale' limit 1),
    (select id from public.cash_accounts where is_active and account_type = 'cash' order by created_at limit 1),
    (select id from public.cash_accounts where is_active order by created_at limit 1))
$$;
revoke all on function private.myra_cash_account_for(uuid, text) from public, anon, authenticated;

create or replace function private.myra_cash_post_in(p_type text, p_id uuid, p_account uuid, p_amount numeric, p_date timestamptz, p_label text, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_account is null or coalesce(p_amount, 0) <= 0 then return; end if;
  insert into public.cash_transactions (cash_account_id, transaction_date, direction, amount, source_type, source_id, description, created_by)
  values (p_account, coalesce(p_date, now()), 'in', p_amount, p_type, p_id, left(p_label, 300), case when exists (select 1 from public.profiles where id = p_user) then p_user end);
  update public.cash_accounts set current_balance = current_balance + p_amount where id = p_account;
end $$;
revoke all on function private.myra_cash_post_in(text, uuid, uuid, numeric, timestamptz, text, uuid) from public, anon, authenticated;

-- Encaissement d'une vente : l'argent va sur le compte du mode de paiement (MoMo → compte MTN MoMo)
create or replace function public.register_sale_payment(p_sale_id uuid, p_cash_account_id uuid, p_amount numeric, p_payment_method text, p_idempotency_key uuid, p_reference text default null, p_notes text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  v_user_id uuid := auth.uid(); v_role text; v_sale public.sales%rowtype; v_account public.cash_accounts%rowtype; v_payment_id uuid; v_new_paid numeric; v_type text;
begin
  if v_user_id is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user_id and is_active = true;
  if v_role is null or v_role not in ('owner','admin','manager','sales','accountant') then raise exception 'Permission insuffisante pour enregistrer un paiement'; end if;
  if p_idempotency_key is null then raise exception 'Une clé d’idempotence est obligatoire'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Le montant du paiement doit être supérieur à zéro'; end if;
  select id into v_payment_id from public.payments where idempotency_key = p_idempotency_key;
  if v_payment_id is not null then return jsonb_build_object('success', true, 'duplicate_request', true, 'payment_id', v_payment_id); end if;
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Vente introuvable'; end if;
  select id into v_payment_id from public.payments where idempotency_key = p_idempotency_key;
  if v_payment_id is not null then return jsonb_build_object('success', true, 'duplicate_request', true, 'payment_id', v_payment_id); end if;
  if v_sale.status not in ('confirmed','partially_paid') then raise exception 'Le paiement est impossible pour une vente au statut %', v_sale.status; end if;
  if p_amount > (v_sale.total - v_sale.amount_paid) then raise exception 'Le paiement dépasse le solde restant : %', (v_sale.total - v_sale.amount_paid); end if;
  -- V41 : compte choisi automatiquement selon le mode de paiement quand celui transmis n'est pas du bon type
  select account_type into v_type from public.cash_accounts where id = p_cash_account_id;
  if v_type is distinct from (case when p_payment_method in ('mtn_momo','airtel_money') then 'mobile_money' when p_payment_method in ('bank_transfer','card') then 'bank' else 'cash' end)
     or p_payment_method in ('mtn_momo','airtel_money') then
    p_cash_account_id := coalesce(private.myra_cash_account_for(null, p_payment_method), p_cash_account_id);
  end if;
  select * into v_account from public.cash_accounts where id = p_cash_account_id and is_active = true for update;
  if not found then raise exception 'Compte de trésorerie inactif ou introuvable'; end if;
  insert into public.payments (sale_id, payment_date, amount, payment_method, direction, reference, notes, received_by, idempotency_key)
  values (p_sale_id, now(), p_amount, p_payment_method, 'incoming', p_reference, p_notes, v_user_id, p_idempotency_key) returning id into v_payment_id;
  insert into public.cash_transactions (cash_account_id, transaction_date, direction, amount, source_type, source_id, description, created_by)
  values (p_cash_account_id, now(), 'in', p_amount, 'payment', v_payment_id, 'Encaissement de la vente ' || v_sale.sale_number, v_user_id);
  update public.cash_accounts set current_balance = current_balance + p_amount where id = p_cash_account_id;
  v_new_paid := v_sale.amount_paid + p_amount;
  update public.sales set amount_paid = v_new_paid, status = case when v_new_paid >= total then 'paid' else 'partially_paid' end, updated_at = now() where id = p_sale_id;
  return jsonb_build_object('success', true, 'duplicate_request', false, 'payment_id', v_payment_id, 'sale_id', p_sale_id, 'amount_paid', v_new_paid,
    'remaining_balance', v_sale.total - v_new_paid, 'cash_account_id', p_cash_account_id);
end; $function$;

create table if not exists public.cash_reconciliations (
  id uuid primary key default gen_random_uuid(),
  cash_account_id uuid not null references public.cash_accounts(id) on delete cascade,
  reconciled_at timestamptz not null default now(),
  expected_balance numeric(14,2) not null,
  actual_balance numeric(14,2) not null,
  difference numeric(14,2) not null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null
);
create index if not exists cash_reconciliations_account_idx on public.cash_reconciliations (cash_account_id, reconciled_at desc);
create index if not exists cash_reconciliations_user_idx on public.cash_reconciliations (created_by);
do $$ begin perform private.myra_v29_policies('cash_reconciliations', array['owner','admin','manager','accountant'], array['owner','admin']); end $$;
revoke insert, update, delete on public.cash_reconciliations from authenticated;

-- Apport, retrait, transfert entre comptes
create or replace function public.cash_movement(p_kind text, p_account uuid, p_amount numeric, p_note text default null, p_to_account uuid default null, p_date timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_role text := private.current_staff_role(); v_id uuid := gen_random_uuid(); v_from text; v_to text; v_note text := nullif(left(trim(coalesce(p_note, '')), 200), '');
begin
  if v_role not in ('owner','admin','accountant') then raise exception 'Réservé au propriétaire, aux administrateurs et à la comptabilité.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000000 then raise exception 'Montant invalide.'; end if;
  select name into v_from from public.cash_accounts where id = p_account and is_active;
  if v_from is null then raise exception 'Compte introuvable ou inactif.'; end if;
  if p_date is not null and (p_date > now() + interval '1 day' or p_date < now() - interval '366 days') then raise exception 'Date invalide.'; end if;
  if p_kind = 'contribution' then
    perform private.myra_cash_post_in('contribution', v_id, p_account, p_amount, p_date, 'Apport' || coalesce(' : ' || v_note, ''), auth.uid());
  elsif p_kind = 'withdrawal' then
    perform private.myra_cash_post_out('withdrawal', v_id, p_account, p_amount, p_date, 'Retrait' || coalesce(' : ' || v_note, ''), auth.uid());
  elsif p_kind = 'transfer' then
    select name into v_to from public.cash_accounts where id = p_to_account and is_active;
    if v_to is null or p_to_account = p_account then raise exception 'Choisissez un autre compte de destination.'; end if;
    perform private.myra_cash_post_out('transfer', v_id, p_account, p_amount, p_date, 'Transfert vers ' || v_to || coalesce(' : ' || v_note, ''), auth.uid());
    perform private.myra_cash_post_in('transfer', v_id, p_to_account, p_amount, p_date, 'Transfert depuis ' || v_from || coalesce(' : ' || v_note, ''), auth.uid());
  else raise exception 'Opération inconnue.'; end if;
  return v_id;
end $$;
revoke all on function public.cash_movement(text, uuid, numeric, text, uuid, timestamptz) from public, anon;
grant execute on function public.cash_movement(text, uuid, numeric, text, uuid, timestamptz) to authenticated;

create or replace function public.cancel_cash_movement(p_source uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_type text;
begin
  if private.current_staff_role() not in ('owner','admin') then raise exception 'Réservé au propriétaire et aux administrateurs.'; end if;
  select source_type into v_type from public.cash_transactions where source_id = p_source and source_type in ('contribution','withdrawal','transfer','adjustment') limit 1;
  if v_type is null then raise exception 'Seuls les apports, retraits, transferts et ajustements peuvent être annulés ici.'; end if;
  perform private.myra_cash_unpost(v_type, p_source);
end $$;
revoke all on function public.cancel_cash_movement(uuid) from public, anon;
grant execute on function public.cancel_cash_movement(uuid) to authenticated;

-- Rapprochement : le solde réel (compté ou relevé MTN) remplace le solde de l'application, l'écart est enregistré
create or replace function public.reconcile_cash_account(p_account uuid, p_actual numeric, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_bal numeric; v_diff numeric; v_id uuid := gen_random_uuid(); v_name text;
begin
  if private.current_staff_role() not in ('owner','admin','accountant') then raise exception 'Réservé au propriétaire, aux administrateurs et à la comptabilité.'; end if;
  if p_actual is null or abs(p_actual) > 1000000000 then raise exception 'Solde réel invalide.'; end if;
  select current_balance, name into v_bal, v_name from public.cash_accounts where id = p_account for update;
  if not found then raise exception 'Compte introuvable.'; end if;
  v_diff := round(p_actual - v_bal, 2);
  if v_diff > 0 then perform private.myra_cash_post_in('adjustment', v_id, p_account, v_diff, now(), 'Rapprochement : écart positif' || coalesce(' · ' || nullif(trim(p_note), ''), ''), auth.uid());
  elsif v_diff < 0 then perform private.myra_cash_post_out('adjustment', v_id, p_account, -v_diff, now(), 'Rapprochement : écart négatif' || coalesce(' · ' || nullif(trim(p_note), ''), ''), auth.uid()); end if;
  insert into public.cash_reconciliations (cash_account_id, expected_balance, actual_balance, difference, notes, created_by)
  values (p_account, v_bal, p_actual, v_diff, nullif(left(trim(coalesce(p_note, '')), 300), ''), auth.uid());
  return jsonb_build_object('account', v_name, 'expected', v_bal, 'actual', p_actual, 'difference', v_diff);
end $$;
revoke all on function public.reconcile_cash_account(uuid, numeric, text) from public, anon;
grant execute on function public.reconcile_cash_account(uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Catégories de dépenses et bénéfice réel
-- ---------------------------------------------------------------------------
alter table public.expense_categories add column if not exists is_stock_purchase boolean not null default false, add column if not exists sort_order integer not null default 0;
insert into public.expense_categories (name, description, is_stock_purchase, sort_order)
select v.* from (values
  ('Matières premières & emballages', 'Ingrédients, pots, étiquettes : déjà comptés dans le coût des produits vendus', true, 1),
  ('Loyer & charges', 'Loyer, électricité, eau', false, 2), ('Salaires & primes', null, false, 3), ('Transport & livraison', 'Carburant, taxis, livreurs', false, 4),
  ('Communication & marketing', 'Branding, publicité, réseaux sociaux', false, 5), ('Internet & téléphone', null, false, 6),
  ('Matériel & entretien', null, false, 7), ('Impôts & taxes', null, false, 8), ('Autres dépenses', null, false, 9)
) v(name, description, is_stock_purchase, sort_order)
where not exists (select 1 from public.expense_categories c where lower(c.name) = lower(v.name));
update public.expense_categories set is_stock_purchase = true where lower(name) = lower('Matières premières & emballages');
-- Classement des dépenses déjà saisies
update public.expenses e set category_id = (select id from public.expense_categories where name = 'Matières premières & emballages')
 where category_id is null and (description ilike '%mati%' or description ilike '%emballage%' or description ilike '%ingr%');
update public.expenses e set category_id = (select id from public.expense_categories where name = 'Communication & marketing')
 where category_id is null and (description ilike '%brand%' or description ilike '%pub%' or description ilike '%marketing%');
update public.expenses e set category_id = (select id from public.expense_categories where name = 'Internet & téléphone')
 where category_id is null and (description ilike '%internet%' or description ilike '%forfait%' or description ilike '%crédit%');

-- Coût de revient unitaire actuel d'un produit (recette, sinon prix d'achat) + emballage + main-d'œuvre
create or replace function private.myra_unit_cost(p_product uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(
    case when p.is_bundle then (select sum(bi.quantity * (coalesce(c.cost_price, 0) + c.packaging_cost + c.labour_cost)) from public.product_bundle_items bi join public.products c on c.id = bi.component_id where bi.bundle_id = p.id) end,
    (select round(sum(ri.quantity * coalesce(rm.average_cost, 0)) / nullif(max(r.yield_quantity), 0), 2)
       from public.recipes r join public.recipe_items ri on ri.recipe_id = r.id left join public.raw_materials rm on rm.id = ri.raw_material_id
      where r.id = (select r2.id from public.recipes r2 where r2.product_id = p.id and r2.is_active order by r2.version desc limit 1))
      + p.packaging_cost + p.labour_cost,
    coalesce(p.cost_price, 0) + p.packaging_cost + p.labour_cost)
  from public.products p where p.id = p_product
$$;
revoke all on function private.myra_unit_cost(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Retours et remboursements
-- ---------------------------------------------------------------------------
create table if not exists public.sale_returns (
  id uuid primary key default gen_random_uuid(),
  return_number text not null unique,
  sale_id uuid not null references public.sales(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  reason text not null,
  restock boolean not null default true,
  items_total numeric(14,2) not null default 0,
  refund_amount numeric(14,2) not null default 0 check (refund_amount >= 0),
  refund_method text check (refund_method is null or refund_method in ('cash','mtn_momo','airtel_money','bank_transfer','card','other','voucher')),
  cash_account_id uuid references public.cash_accounts(id) on delete set null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.sale_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.sale_returns(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  unit_cost numeric(14,2) not null default 0
);
create index if not exists sale_returns_sale_idx on public.sale_returns (sale_id);
create index if not exists sale_returns_customer_idx on public.sale_returns (customer_id);
create index if not exists sale_returns_account_idx on public.sale_returns (cash_account_id);
create index if not exists sale_returns_user_idx on public.sale_returns (created_by);
create index if not exists sale_returns_date_idx on public.sale_returns (created_at desc);
create index if not exists sale_return_items_return_idx on public.sale_return_items (return_id);
create index if not exists sale_return_items_product_idx on public.sale_return_items (product_id);
do $$ begin
  perform private.myra_v29_policies('sale_returns', array['owner','admin','manager','sales','accountant'], array['owner','admin']);
  perform private.myra_v29_policies('sale_return_items', array['owner','admin','manager','sales','accountant'], array['owner','admin']);
end $$;
revoke insert, update, delete on public.sale_returns, public.sale_return_items from authenticated;

create or replace function public.get_sale_for_return(p_number text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.sales%rowtype;
begin
  if private.current_staff_role() not in ('owner','admin','manager','sales','accountant') then raise exception 'Accès refusé.'; end if;
  select * into s from public.sales where upper(sale_number) = upper(trim(p_number));
  if not found then raise exception 'Vente introuvable : vérifiez le numéro (ex. VTE-20261127-AB12CD).'; end if;
  if s.status not in ('confirmed','partially_paid','paid') then raise exception 'Seule une vente confirmée peut faire l’objet d’un retour.'; end if;
  return jsonb_build_object('id', s.id, 'sale_number', s.sale_number, 'sale_date', s.sale_date, 'total', s.total, 'amount_paid', s.amount_paid, 'discount', s.discount, 'subtotal', s.subtotal,
    'customer', (select full_name from public.customers where id = s.customer_id),
    'refunded', coalesce((select sum(refund_amount) from public.sale_returns where sale_id = s.id), 0),
    'items', coalesce((select jsonb_agg(jsonb_build_object('product_id', si.product_id, 'name', p.name, 'quantity', si.quantity,
        'unit_price', round(si.line_total / nullif(si.quantity, 0), 2),
        'returned', coalesce((select sum(ri.quantity) from public.sale_return_items ri join public.sale_returns r on r.id = ri.return_id where r.sale_id = s.id and ri.product_id = si.product_id), 0)) order by p.name)
      from public.sale_items si join public.products p on p.id = si.product_id where si.sale_id = s.id), '[]'::jsonb));
end $$;
revoke all on function public.get_sale_for_return(text) from public, anon;
grant execute on function public.get_sale_for_return(text) to authenticated;

create or replace function public.create_sale_return(p_sale uuid, p_items jsonb, p_reason text, p_refund numeric default 0, p_method text default 'cash', p_restock boolean default true, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.sales%rowtype; v_id uuid := gen_random_uuid(); v_num text; v_item jsonb; v_qty numeric; v_sold numeric; v_ret numeric; v_price numeric; v_name text; v_total numeric := 0; v_lines int := 0; v_refunded numeric; v_acc uuid; v_cost numeric;
begin
  if private.current_staff_role() not in ('owner','admin','manager','sales') then raise exception 'Accès refusé.'; end if;
  select * into s from public.sales where id = p_sale for update;
  if not found or s.status not in ('confirmed','partially_paid','paid') then raise exception 'Vente introuvable ou non confirmée.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Indiquez le motif du retour.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Choisissez au moins un produit retourné.'; end if;
  v_num := 'RET-' || to_char(now() at time zone 'Africa/Brazzaville', 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));
  insert into public.sale_returns (id, return_number, sale_id, customer_id, reason, restock, notes, created_by)
  values (v_id, v_num, s.id, s.customer_id, left(trim(p_reason), 300), coalesce(p_restock, true), nullif(left(trim(coalesce(p_notes, '')), 500), ''), auth.uid());
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'quantity')::numeric, 0); if v_qty <= 0 then continue; end if;
    select sum(si.quantity), round(sum(si.line_total) / nullif(sum(si.quantity), 0), 2), max(p.name) into v_sold, v_price, v_name
      from public.sale_items si join public.products p on p.id = si.product_id where si.sale_id = s.id and si.product_id = (v_item->>'product_id')::uuid;
    if v_sold is null then raise exception 'Ce produit ne fait pas partie de la vente.'; end if;
    select coalesce(sum(ri.quantity), 0) into v_ret from public.sale_return_items ri join public.sale_returns r on r.id = ri.return_id where r.sale_id = s.id and ri.product_id = (v_item->>'product_id')::uuid and r.id <> v_id;
    if v_qty > v_sold - v_ret then raise exception 'Quantité retournée trop élevée pour % (vendu : %, déjà retourné : %).', v_name, v_sold, v_ret; end if;
    v_cost := coalesce(private.myra_unit_cost((v_item->>'product_id')::uuid), 0);
    insert into public.sale_return_items (return_id, product_id, product_name, quantity, unit_price, line_total, unit_cost)
    values (v_id, (v_item->>'product_id')::uuid, v_name, v_qty, v_price, round(v_price * v_qty, 2), v_cost);
    v_total := v_total + round(v_price * v_qty, 2); v_lines := v_lines + 1;
    if coalesce(p_restock, true) then
      update public.products set stock_quantity = stock_quantity + v_qty, updated_at = now() where id = (v_item->>'product_id')::uuid;
      insert into public.product_movements (product_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes, created_by)
      values ((v_item->>'product_id')::uuid, 'return', v_qty, v_cost, 'return', v_id, 'Retour client ' || v_num || ' (vente ' || s.sale_number || ')', auth.uid());
    end if;
  end loop;
  if v_lines = 0 then raise exception 'Choisissez au moins un produit retourné.'; end if;
  -- Remboursement : au plus la valeur retournée et au plus ce qui a été encaissé et pas encore remboursé
  select coalesce(sum(refund_amount), 0) into v_refunded from public.sale_returns where sale_id = s.id and id <> v_id;
  if coalesce(p_refund, 0) < 0 or coalesce(p_refund, 0) > least(v_total, s.amount_paid - v_refunded) + 0.01 then
    raise exception 'Remboursement maximum : % FCFA (valeur retournée et montant encaissé).', greatest(0, least(v_total, s.amount_paid - v_refunded));
  end if;
  if coalesce(p_refund, 0) > 0 and coalesce(p_method, 'cash') <> 'voucher' then
    v_acc := private.myra_cash_account_for(null, p_method);
    perform private.myra_cash_post_out('refund', v_id, v_acc, p_refund, now(), 'Remboursement ' || v_num || ' (vente ' || s.sale_number || ')', auth.uid());
  end if;
  update public.sale_returns set items_total = v_total, refund_amount = coalesce(p_refund, 0), refund_method = case when coalesce(p_refund, 0) > 0 then coalesce(p_method, 'cash') end, cash_account_id = v_acc where id = v_id;
  perform private.myra_push('sales', '↩️ Retour client ' || v_num, s.sale_number || ' · ' || left(trim(p_reason), 80) || case when coalesce(p_refund, 0) > 0 then ' · remboursé ' || private.myra_fcfa(p_refund) else '' end, './#/returns', 'ret-' || v_id, auth.uid());
  return jsonb_build_object('id', v_id, 'return_number', v_num, 'items_total', v_total, 'refund', coalesce(p_refund, 0), 'lines', v_lines);
end $$;
revoke all on function public.create_sale_return(uuid, jsonb, text, numeric, text, boolean, text) from public, anon;
grant execute on function public.create_sale_return(uuid, jsonb, text, numeric, text, boolean, text) to authenticated;

-- Rapport de bénéfice (12 derniers mois)
create or replace function public.get_profit_report(p_months integer default 12)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text := private.current_staff_role(); v_start date; v_has_cost boolean;
begin
  if v_role is null or (v_role not in ('owner','admin') and not coalesce((select see_costs from public.role_permissions where role = v_role), false)) then
    raise exception 'Le bénéfice est réservé à la direction.';
  end if;
  v_start := (date_trunc('month', now() at time zone 'Africa/Brazzaville') - make_interval(months => greatest(1, least(coalesce(p_months, 12), 36)) - 1))::date;
  v_has_cost := exists (select 1 from public.products p where p.is_active and (coalesce(p.cost_price, 0) > 0 or p.packaging_cost > 0 or p.labour_cost > 0 or exists (select 1 from public.recipes r where r.product_id = p.id and r.is_active)));
  return jsonb_build_object('start', v_start, 'cost_method', case when v_has_cost then 'cogs' else 'cash' end,
    'months', coalesce((select jsonb_agg(m order by m->>'month') from (
      select jsonb_build_object('month', to_char(mo, 'YYYY-MM'),
        'revenue', coalesce((select sum(s.total) from public.sales s where s.status in ('confirmed','partially_paid','paid') and date_trunc('month', s.sale_date at time zone 'Africa/Brazzaville') = mo), 0),
        'sales_count', (select count(*) from public.sales s where s.status in ('confirmed','partially_paid','paid') and date_trunc('month', s.sale_date at time zone 'Africa/Brazzaville') = mo),
        'returns', coalesce((select sum(r.items_total) from public.sale_returns r where date_trunc('month', r.created_at at time zone 'Africa/Brazzaville') = mo), 0),
        'cogs', case when v_has_cost then coalesce((select sum(si.quantity * private.myra_unit_cost(si.product_id)) from public.sale_items si join public.sales s on s.id = si.sale_id
                   where s.status in ('confirmed','partially_paid','paid') and date_trunc('month', s.sale_date at time zone 'Africa/Brazzaville') = mo), 0)
                 - coalesce((select sum(ri.quantity * ri.unit_cost) from public.sale_return_items ri join public.sale_returns r on r.id = ri.return_id where r.restock and date_trunc('month', r.created_at at time zone 'Africa/Brazzaville') = mo), 0) else 0 end,
        'expenses', coalesce((select jsonb_object_agg(cat, amt) from (select coalesce(c.name, 'Non classées') cat, sum(e.amount) amt from public.expenses e left join public.expense_categories c on c.id = e.category_id
                   where date_trunc('month', e.expense_date) = mo and not (v_has_cost and coalesce(c.is_stock_purchase, false)) group by 1) x), '{}'),
        'stock_purchases', coalesce((select sum(e.amount) from public.expenses e join public.expense_categories c on c.id = e.category_id where c.is_stock_purchase and date_trunc('month', e.expense_date) = mo), 0)) m
      from generate_series(v_start::timestamp, date_trunc('month', now() at time zone 'Africa/Brazzaville'), interval '1 month') mo) t), '[]'::jsonb),
    'top_products', coalesce((select jsonb_agg(x order by (x->>'profit')::numeric desc) from (
      select jsonb_build_object('name', p.name, 'quantity', sum(si.quantity), 'revenue', sum(si.line_total), 'profit', sum(si.line_total) - sum(si.quantity) * private.myra_unit_cost(p.id)) x
        from public.sale_items si join public.sales s on s.id = si.sale_id join public.products p on p.id = si.product_id
       where s.status in ('confirmed','partially_paid','paid') and s.sale_date >= date_trunc('month', now() at time zone 'Africa/Brazzaville') - interval '2 months'
       group by p.id, p.name order by sum(si.line_total) desc limit 10) y), '[]'::jsonb));
end $$;
revoke all on function public.get_profit_report(integer) from public, anon;
grant execute on function public.get_profit_report(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Caisse rapide : vente confirmée + encaissement en une seule opération
-- ---------------------------------------------------------------------------
alter table public.sales add column if not exists receipt_token text;
update public.sales set receipt_token = replace(gen_random_uuid()::text, '-', '') where receipt_token is null;
alter table public.sales alter column receipt_token set default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists sales_receipt_token_key on public.sales (receipt_token);

create or replace function public.pos_checkout(p_items jsonb, p_customer uuid default null, p_discount numeric default 0, p_method text default 'cash', p_received numeric default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := gen_random_uuid(); v_num text; v_item jsonb; v_prod record; v_qty numeric; v_price numeric; v_sub numeric := 0; v_total numeric; v_paid numeric; v_pay jsonb; v_token text;
begin
  if private.current_staff_role() not in ('owner','admin','manager','sales') then raise exception 'Accès refusé : la caisse est réservée à la vente et à la direction.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Le panier est vide.'; end if;
  if p_method not in ('cash','mtn_momo','airtel_money','bank_transfer','card','other','credit') then raise exception 'Mode de paiement invalide.'; end if;
  if p_method = 'credit' and p_customer is null then raise exception 'Choisissez le client pour une vente à crédit.'; end if;
  v_num := 'VTE-' || to_char(now() at time zone 'Africa/Brazzaville', 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  insert into public.sales (id, sale_number, customer_id, sale_date, status, subtotal, discount, total, amount_paid, notes, created_by)
  values (v_id, v_num, p_customer, now(), 'draft', 0, 0, 0, 0, concat_ws(E'\n', 'Caisse rapide', nullif(left(trim(coalesce(p_note, '')), 300), '')), auth.uid());
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'quantity')::numeric, 0); if v_qty <= 0 then continue; end if;
    select id, name, sale_price into v_prod from public.products where id = (v_item->>'product_id')::uuid and is_active;
    if not found then raise exception 'Produit indisponible.'; end if;
    v_price := coalesce(public.resolve_price(v_prod.id, p_customer, v_qty), v_prod.sale_price);
    insert into public.sale_items (sale_id, product_id, quantity, unit_price, discount, line_total) values (v_id, v_prod.id, v_qty, v_price, 0, round(v_price * v_qty, 2));
    v_sub := v_sub + round(v_price * v_qty, 2);
  end loop;
  if v_sub <= 0 then raise exception 'Le panier est vide.'; end if;
  if coalesce(p_discount, 0) < 0 or coalesce(p_discount, 0) >= v_sub then raise exception 'Remise invalide.'; end if;
  v_total := v_sub - coalesce(p_discount, 0);
  update public.sales set subtotal = v_sub, discount = coalesce(p_discount, 0), total = v_total where id = v_id;
  perform public.confirm_sale(v_id);
  v_paid := case when p_method = 'credit' then 0 else least(v_total, coalesce(p_received, v_total)) end;
  if v_paid > 0 then
    v_pay := public.register_sale_payment(v_id, private.myra_cash_account_for(null, p_method), v_paid, p_method, gen_random_uuid(), null, 'Caisse rapide');
  end if;
  select receipt_token into v_token from public.sales where id = v_id;
  return jsonb_build_object('id', v_id, 'sale_number', v_num, 'subtotal', v_sub, 'discount', coalesce(p_discount, 0), 'total', v_total, 'paid', v_paid,
    'change', greatest(0, coalesce(p_received, 0) - v_total), 'remaining', v_total - v_paid, 'receipt_token', v_token);
end $$;
revoke all on function public.pos_checkout(jsonb, uuid, numeric, text, numeric, text) from public, anon;
grant execute on function public.pos_checkout(jsonb, uuid, numeric, text, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Reçu en ligne (lien envoyé sur WhatsApp)
-- ---------------------------------------------------------------------------
create or replace function public.get_public_receipt(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.sales%rowtype;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then raise exception 'Reçu introuvable.'; end if;
  select * into s from public.sales where receipt_token = p_token and status in ('confirmed','partially_paid','paid');
  if not found then raise exception 'Reçu introuvable.'; end if;
  return jsonb_build_object('number', s.sale_number, 'date', s.sale_date, 'status', s.status, 'subtotal', s.subtotal, 'discount', s.discount, 'total', s.total, 'paid', s.amount_paid,
    'remaining', s.total - s.amount_paid, 'customer', (select split_part(full_name, ' ', 1) from public.customers where id = s.customer_id),
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'unit', p.unit, 'quantity', si.quantity, 'price', si.unit_price, 'total', si.line_total) order by p.name)
      from public.sale_items si join public.products p on p.id = si.product_id where si.sale_id = s.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('date', payment_date, 'amount', amount, 'method', payment_method) order by payment_date) from public.payments where sale_id = s.id and direction = 'incoming'), '[]'::jsonb),
    'returns', coalesce((select jsonb_agg(jsonb_build_object('number', return_number, 'amount', refund_amount, 'date', created_at)) from public.sale_returns where sale_id = s.id), '[]'::jsonb),
    'company', (select jsonb_build_object('name', company_name, 'phone', phone, 'address', address, 'currency', coalesce(currency_label, 'FCFA')) from public.company_settings order by created_at limit 1));
end $$;
revoke all on function public.get_public_receipt(text) from public;
grant execute on function public.get_public_receipt(text) to anon, authenticated;

alter table public.company_settings add column if not exists receipt_whatsapp text not null default 'prompt';
alter table public.company_settings drop constraint if exists company_settings_receipt_whatsapp_check;
alter table public.company_settings add constraint company_settings_receipt_whatsapp_check check (receipt_whatsapp in ('off','prompt','auto'));

-- Envoi automatique par l'API WhatsApp Business (si le mode « auto » est choisi et la fonction configurée)
create or replace function private.myra_whatsapp_receipt() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.push_config%rowtype;
begin
  if new.direction <> 'incoming' or new.sale_id is null then return null; end if;
  if coalesce((select receipt_whatsapp from public.company_settings order by created_at limit 1), 'prompt') <> 'auto' then return null; end if;
  select * into c from public.push_config limit 1;
  if not found or c.function_url is null then return null; end if;
  perform net.http_post(url := replace(c.function_url, 'myra-push', 'myra-whatsapp'), body := jsonb_build_object('action', 'receipt', 'sale_id', new.sale_id, 'payment_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-myra-hook', c.hook_secret), timeout_milliseconds := 8000);
  return null;
exception when others then raise warning 'Reçu WhatsApp non envoyé : %', sqlerrm; return null;
end $$;
drop trigger if exists trg_myra_whatsapp_receipt on public.payments;
create trigger trg_myra_whatsapp_receipt after insert on public.payments for each row execute function private.myra_whatsapp_receipt();

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references public.sales(id) on delete set null,
  phone text, status text not null default 'sent', error text, message_id text,
  created_at timestamptz not null default now()
);
create index if not exists whatsapp_messages_sale_idx on public.whatsapp_messages (sale_id);
do $$ begin perform private.myra_v29_policies('whatsapp_messages', array['owner','admin','manager','sales'], array['owner','admin']); end $$;
revoke insert, update, delete on public.whatsapp_messages from authenticated;

-- ---------------------------------------------------------------------------
-- 4. Planning de production
-- ---------------------------------------------------------------------------
create or replace function public.get_production_plan(p_days integer default 7)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_days int := greatest(1, least(coalesce(p_days, 7), 60)); v_products jsonb;
begin
  if private.current_staff_role() not in ('owner','admin','manager','stock_manager') then raise exception 'Réservé à la direction et à la gestion de stock.'; end if;
  select coalesce(jsonb_agg(x order by (x->>'to_produce')::numeric desc, x->>'name'), '[]'::jsonb) into v_products from (
    select jsonb_build_object('id', p.id, 'name', p.name, 'unit', p.unit, 'stock', p.stock_quantity, 'min_stock', p.min_stock,
      'orders', o.q, 'avg_daily', round(coalesce(s.q, 0) / 30.0, 2), 'forecast', ceil(coalesce(s.q, 0) / 30.0 * v_days), 'planned', b.q,
      'has_recipe', r.id is not null, 'recipe_id', r.id, 'yield', r.yield_quantity,
      'to_produce', greatest(0, ceil(o.q + coalesce(s.q, 0) / 30.0 * v_days + coalesce(p.min_stock, 0) - p.stock_quantity - b.q))) x
    from public.products p
    left join lateral (select coalesce(sum(i.quantity), 0) q from public.customer_order_items i join public.customer_orders co on co.id = i.order_id
       where i.product_id = p.id and co.status in ('draft','confirmed','processing','ready') and (co.requested_delivery_at is null or co.requested_delivery_at <= now() + make_interval(days => v_days))) o on true
    left join lateral (select sum(si.quantity) q from public.sale_items si join public.sales sa on sa.id = si.sale_id
       where si.product_id = p.id and sa.status in ('confirmed','partially_paid','paid') and sa.sale_date > now() - interval '30 days') s on true
    left join lateral (select coalesce(sum(greatest(0, planned_quantity - produced_quantity)), 0) q from public.production_batches where product_id = p.id and status in ('planned','in_progress')) b on true
    left join lateral (select id, yield_quantity from public.recipes where product_id = p.id and is_active order by version desc limit 1) r on true
    where p.is_active and not p.is_bundle) t;
  return jsonb_build_object('days', v_days, 'products', v_products,
    'materials', coalesce((select jsonb_agg(m order by (m->>'to_buy')::numeric desc, m->>'name') from (
      select jsonb_build_object('id', rm.id, 'name', rm.name, 'unit', rm.unit, 'stock', rm.stock_quantity, 'min_stock', rm.min_stock, 'unit_cost', rm.average_cost,
        'supplier_id', rm.supplier_id, 'supplier', (select name from public.suppliers where id = rm.supplier_id),
        'required', round(sum(ri.quantity * (pp->>'to_produce')::numeric / nullif((pp->>'yield')::numeric, 0)), 3),
        'to_buy', greatest(0, ceil(sum(ri.quantity * (pp->>'to_produce')::numeric / nullif((pp->>'yield')::numeric, 0)) + coalesce(rm.min_stock, 0) - rm.stock_quantity))) m
      from jsonb_array_elements(v_products) pp
      join public.recipe_items ri on ri.recipe_id = (pp->>'recipe_id')::uuid
      join public.raw_materials rm on rm.id = ri.raw_material_id
      where (pp->>'to_produce')::numeric > 0
      group by rm.id) z), '[]'::jsonb));
end $$;
revoke all on function public.get_production_plan(integer) from public, anon;
grant execute on function public.get_production_plan(integer) to authenticated;

create or replace function public.create_production_batches(p_items jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_item jsonb; v_n int := 0; v_qty numeric;
begin
  if private.current_staff_role() not in ('owner','admin','manager','stock_manager') then raise exception 'Accès refusé.'; end if;
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]')) loop
    v_qty := coalesce((v_item->>'quantity')::numeric, 0); if v_qty <= 0 then continue; end if;
    insert into public.production_batches (batch_number, product_id, recipe_id, planned_quantity, status, production_date, notes, created_by)
    select 'LOT-' || to_char(now() at time zone 'Africa/Brazzaville', 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5)), p.id,
           (select id from public.recipes where product_id = p.id and is_active order by version desc limit 1), v_qty, 'planned',
           coalesce((v_item->>'date')::date, (now() at time zone 'Africa/Brazzaville')::date), 'Créé depuis le planning de production', auth.uid()
      from public.products p where p.id = (v_item->>'product_id')::uuid and p.is_active;
    if found then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;
revoke all on function public.create_production_batches(jsonb) from public, anon;
grant execute on function public.create_production_batches(jsonb) to authenticated;

create or replace function public.create_purchase_orders_from_plan(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sup uuid; v_po uuid; v_nums text[] := '{}'; v_num text; v_tot numeric;
begin
  if private.current_staff_role() not in ('owner','admin','manager','stock_manager') then raise exception 'Accès refusé.'; end if;
  for v_sup in select distinct rm.supplier_id from jsonb_array_elements(coalesce(p_items, '[]')) i join public.raw_materials rm on rm.id = (i->>'raw_material_id')::uuid where coalesce((i->>'quantity')::numeric, 0) > 0 loop
    v_num := 'ACH-' || to_char(now() at time zone 'Africa/Brazzaville', 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));
    insert into public.purchase_orders (order_number, supplier_id, order_date, status, notes, created_by)
    values (v_num, v_sup, (now() at time zone 'Africa/Brazzaville')::date, 'draft', 'Préparé depuis le planning de production', auth.uid()) returning id into v_po;
    insert into public.purchase_order_items (purchase_order_id, raw_material_id, quantity, unit_cost, line_total)
    select v_po, rm.id, (i->>'quantity')::numeric, coalesce(rm.average_cost, 0), round((i->>'quantity')::numeric * coalesce(rm.average_cost, 0), 2)
      from jsonb_array_elements(p_items) i join public.raw_materials rm on rm.id = (i->>'raw_material_id')::uuid
     where rm.supplier_id is not distinct from v_sup and coalesce((i->>'quantity')::numeric, 0) > 0;
    select coalesce(sum(line_total), 0) into v_tot from public.purchase_order_items where purchase_order_id = v_po;
    update public.purchase_orders set subtotal = v_tot, total = v_tot where id = v_po;
    v_nums := v_nums || v_num;
  end loop;
  return to_jsonb(v_nums);
end $$;
revoke all on function public.create_purchase_orders_from_plan(jsonb) from public, anon;
grant execute on function public.create_purchase_orders_from_plan(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Sauvegarde automatique chaque nuit (30 jours)
-- ---------------------------------------------------------------------------
create table if not exists public.backups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null default 'auto' check (kind in ('auto','manual')),
  size_bytes bigint not null default 0,
  counts jsonb not null default '{}',
  data jsonb not null,
  created_by uuid references public.profiles(id) on delete set null
);
create index if not exists backups_created_idx on public.backups (created_at desc);
create index if not exists backups_user_idx on public.backups (created_by);
alter table public.backups enable row level security;
revoke all on public.backups from anon, authenticated;

create or replace function private.myra_backup_tables() returns text[] language sql immutable as $$
  select array['company_settings','shop_settings','customers','product_categories','products','product_bundle_items','suppliers','raw_material_categories','raw_materials','recipes','recipe_items',
    'sales','sale_items','payments','sale_returns','sale_return_items','customer_orders','customer_order_items','recurring_orders','expense_categories','expenses','cash_accounts','cash_transactions',
    'cash_closings','purchase_orders','purchase_order_items','production_batches','product_movements','raw_material_movements','promo_campaigns','loyalty_accounts','loyalty_transactions','gift_cards',
    'gift_card_transactions','employees','delivery_zones','quotes','quote_items','product_lots','complaints','order_reviews','product_reviews']
$$;

create or replace function private.myra_backup(p_kind text default 'auto') returns uuid
language plpgsql security definer set search_path = '' as $$
declare t text; v_data jsonb := '{}'; v_counts jsonb := '{}'; v_rows jsonb; v_id uuid;
begin
  foreach t in array private.myra_backup_tables() loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t) into v_rows;
    v_data := v_data || jsonb_build_object(t, v_rows); v_counts := v_counts || jsonb_build_object(t, jsonb_array_length(v_rows));
  end loop;
  insert into public.backups (kind, size_bytes, counts, data, created_by)
  values (p_kind, octet_length(v_data::text), v_counts, v_data, case when exists (select 1 from public.profiles where id = auth.uid()) then auth.uid() end)
  returning id into v_id;
  delete from public.backups where created_at < now() - interval '30 days';
  return v_id;
end $$;
revoke all on function private.myra_backup(text) from public, anon, authenticated;

create or replace function public.list_backups()
returns table (id uuid, created_at timestamptz, kind text, size_bytes bigint, counts jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.current_staff_role() not in ('owner','admin') then raise exception 'Réservé au propriétaire et aux administrateurs.'; end if;
  return query select b.id, b.created_at, b.kind, b.size_bytes, b.counts from public.backups b order by b.created_at desc;
end $$;
revoke all on function public.list_backups() from public, anon;
grant execute on function public.list_backups() to authenticated;

create or replace function public.get_backup(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.current_staff_role() not in ('owner','admin') then raise exception 'Réservé au propriétaire et aux administrateurs.'; end if;
  return (select jsonb_build_object('created_at', created_at, 'kind', kind, 'tables', data) from public.backups where id = p_id);
end $$;
revoke all on function public.get_backup(uuid) from public, anon;
grant execute on function public.get_backup(uuid) to authenticated;

create or replace function public.run_backup_now() returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if private.current_staff_role() not in ('owner','admin') then raise exception 'Réservé au propriétaire et aux administrateurs.'; end if;
  if (select count(*) from public.backups where kind = 'manual' and created_at > now() - interval '1 hour') >= 5 then raise exception 'Trop de sauvegardes manuelles : réessayez dans une heure.'; end if;
  return private.myra_backup('manual');
end $$;
revoke all on function public.run_backup_now() from public, anon;
grant execute on function public.run_backup_now() to authenticated;

-- Restauration d'une table : remet les lignes de la sauvegarde (supprimées ou modifiées depuis), sans rien effacer
create or replace function public.restore_backup_table(p_id uuid, p_table text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_rows jsonb; v_cols text; v_set text; v_n int; v_pk text;
begin
  if private.current_staff_role() <> 'owner' then raise exception 'Seul le propriétaire peut restaurer une sauvegarde.'; end if;
  if not (p_table = any(private.myra_backup_tables())) then raise exception 'Table non restaurable.'; end if;
  select data->p_table into v_rows from public.backups where id = p_id;
  if v_rows is null then raise exception 'Sauvegarde ou table introuvable.'; end if;
  perform private.myra_backup('manual');   -- filet de sécurité : état actuel sauvegardé avant restauration
  select string_agg(format('%I', a.attname), ', ' order by array_position(i.indkey::int2[], a.attnum)) into v_pk
    from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
   where i.indrelid = ('public.' || quote_ident(p_table))::regclass and i.indisprimary;
  if v_pk is null then raise exception 'Table sans clé primaire : restauration impossible.'; end if;
  select string_agg(format('%I', column_name), ', ' order by ordinal_position),
         string_agg(format('%I = excluded.%I', column_name, column_name), ', ' order by ordinal_position) filter (where format('%I', column_name) <> all(string_to_array(replace(v_pk, ' ', ''), ',')))
    into v_cols, v_set from information_schema.columns where table_schema = 'public' and table_name = p_table and is_generated = 'NEVER';
  execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) on conflict (%s) do %s',
    p_table, v_cols, v_cols, p_table, v_pk, case when v_set is null then 'nothing' else 'update set ' || v_set end) using v_rows;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.restore_backup_table(uuid, text) from public, anon;
grant execute on function public.restore_backup_table(uuid, text) to authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'myra-sauvegarde-nuit';
    perform cron.schedule('myra-sauvegarde-nuit', '15 1 * * *', 'select private.myra_backup(''auto'')');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 10. MTN MoMo : validation automatique (API « Collection », si configurée)
-- ---------------------------------------------------------------------------
alter table public.shop_settings add column if not exists momo_api_enabled boolean not null default false;
create table if not exists public.momo_requests (
  id uuid primary key,                         -- X-Reference-Id envoyé à MTN
  order_id uuid not null references public.customer_orders(id) on delete cascade,
  amount numeric(14,2) not null,
  currency text not null default 'XAF',
  payer text not null,
  status text not null default 'PENDING',
  reason text,
  financial_transaction_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists momo_requests_order_idx on public.momo_requests (order_id);
do $$ begin perform private.myra_v29_policies('momo_requests', array['owner','admin','manager','accountant','sales'], array['owner','admin']); end $$;
revoke insert, update, delete on public.momo_requests from authenticated;

-- Catalogue public : indique si le paiement MoMo automatique est disponible
create or replace function public.get_public_momo_api() returns boolean
language sql stable security definer set search_path = '' as $$ select coalesce((select momo_api_enabled from public.shop_settings limit 1), false) $$;
revoke all on function public.get_public_momo_api() from public;
grant execute on function public.get_public_momo_api() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Partage de documents (reçu, facture, bon de commande, devis, ticket…) par lien : WhatsApp, SMS, e-mail…
-- Le document est affiché tel quel, sans aucun script, dans une page publique (lien secret, valable 90 jours).
-- ---------------------------------------------------------------------------
create table if not exists public.shared_documents (
  token text primary key default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  title text not null,
  kind text,
  html text not null check (octet_length(html) <= 800000),
  views integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days'
);
create index if not exists shared_documents_user_idx on public.shared_documents (created_by);
create index if not exists shared_documents_expires_idx on public.shared_documents (expires_at);
alter table public.shared_documents enable row level security;
revoke all on public.shared_documents from anon, authenticated;

create or replace function public.share_document(p_title text, p_html text, p_kind text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if private.current_staff_role() is null then raise exception 'Connexion requise.'; end if;
  if length(trim(coalesce(p_html, ''))) < 20 then raise exception 'Document vide.'; end if;
  if octet_length(p_html) > 800000 then raise exception 'Document trop volumineux pour être partagé.'; end if;
  if (select count(*) from public.shared_documents where created_by = auth.uid() and created_at > now() - interval '1 day') >= 300 then raise exception 'Trop de partages aujourd’hui.'; end if;
  insert into public.shared_documents (title, kind, html, created_by)
  values (left(coalesce(nullif(trim(p_title), ''), 'Document'), 160), left(p_kind, 40),
          regexp_replace(p_html, '<script[^>]*>.*?</script>', '', 'gis'), auth.uid())
  returning token into v_token;
  if random() < 0.05 then delete from public.shared_documents where expires_at < now(); end if;
  return v_token;
end $$;
revoke all on function public.share_document(text, text, text) from public, anon;
grant execute on function public.share_document(text, text, text) to authenticated;

create or replace function public.get_shared_document(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.shared_documents%rowtype;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Document introuvable.'; end if;
  update public.shared_documents set views = views + 1 where token = p_token and expires_at > now() returning * into d;
  if not found then raise exception 'Ce lien a expiré ou n’existe pas. Demandez un nouveau lien.'; end if;
  return jsonb_build_object('title', d.title, 'kind', d.kind, 'html', d.html, 'created_at', d.created_at, 'expires_at', d.expires_at);
end $$;
revoke all on function public.get_shared_document(text) from public;
grant execute on function public.get_shared_document(text) to anon, authenticated;

notify pgrst, 'reload schema';
