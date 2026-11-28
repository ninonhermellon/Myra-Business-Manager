-- ============================================================================
-- LSM Business Manager V40 — Les sorties d'argent diminuent la trésorerie
--  • Une dépense enregistrée (application, hors connexion synchronisé, import…) sort automatiquement de la caisse :
--    mouvement « sortie » dans les mouvements de trésorerie + solde du compte diminué.
--  • Modifier le montant / le mode de paiement / le compte d'une dépense corrige la caisse ; la supprimer la rembourse.
--  • Idem pour les paiements aux fournisseurs (paiements « sortants »).
--  • Clôture de caisse : les dépenses payées par la personne ce jour-là sont déduites de l'attendu.
-- Rejouable. Les dépenses déjà enregistrées ne sont PAS reprises automatiquement (voir fin du fichier).
-- ============================================================================

alter table public.expenses add column if not exists cash_account_id uuid references public.cash_accounts(id) on delete set null;
create index if not exists expenses_cash_account_idx on public.expenses (cash_account_id);
create index if not exists cash_transactions_source_idx on public.cash_transactions (source_type, source_id);

-- Compte à débiter : celui choisi, sinon le compte actif du bon type (espèces / Mobile Money / banque), sinon la caisse principale
create or replace function private.myra_cash_account_for(p_account uuid, p_method text) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select id from public.cash_accounts where id = p_account and is_active),
    (select id from public.cash_accounts where is_active and account_type = case
        when p_method in ('mtn_momo','airtel_money') then 'mobile_money'
        when p_method in ('bank_transfer','card') then 'bank' else 'cash' end order by created_at limit 1),
    (select id from public.cash_accounts where is_active and name = 'Caisse principale' limit 1),
    (select id from public.cash_accounts where is_active order by created_at limit 1))
$$;
revoke all on function private.myra_cash_account_for(uuid, text) from public, anon, authenticated;

-- Annule le mouvement de caisse lié à une source (dépense ou paiement sortant)
create or replace function private.myra_cash_unpost(p_type text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare t record;
begin
  for t in delete from public.cash_transactions where source_type = p_type and source_id = p_id returning cash_account_id, direction, amount loop
    update public.cash_accounts set current_balance = current_balance + case when t.direction = 'out' then t.amount else -t.amount end where id = t.cash_account_id;
  end loop;
end $$;
revoke all on function private.myra_cash_unpost(text, uuid) from public, anon, authenticated;

create or replace function private.myra_cash_post_out(p_type text, p_id uuid, p_account uuid, p_amount numeric, p_date timestamptz, p_label text, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_account is null or coalesce(p_amount, 0) <= 0 then return; end if;
  insert into public.cash_transactions (cash_account_id, transaction_date, direction, amount, source_type, source_id, description, created_by)
  values (p_account, coalesce(p_date, now()), 'out', p_amount, p_type, p_id, left(p_label, 300),
          case when exists (select 1 from public.profiles where id = p_user) then p_user end);
  update public.cash_accounts set current_balance = current_balance - p_amount where id = p_account;
end $$;
revoke all on function private.myra_cash_post_out(text, uuid, uuid, numeric, timestamptz, text, uuid) from public, anon, authenticated;

-- Dépenses : compte choisi avant l'enregistrement, mouvement de caisse après
create or replace function private.myra_expense_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.payment_method is distinct from old.payment_method or new.cash_account_id is distinct from old.cash_account_id then
    new.cash_account_id := private.myra_cash_account_for(case when tg_op = 'UPDATE' and new.cash_account_id is not distinct from old.cash_account_id and new.payment_method is distinct from old.payment_method then null else new.cash_account_id end, new.payment_method);
  end if;
  return new;
end $$;
drop trigger if exists trg_myra_expense_account on public.expenses;
create trigger trg_myra_expense_account before insert or update of payment_method, cash_account_id on public.expenses for each row execute function private.myra_expense_account();

create or replace function private.myra_expense_cash() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    -- Dépense antérieure à la V40 jamais passée en caisse : on n'y touche pas
    if not exists (select 1 from public.cash_transactions where source_type = 'expense' and source_id = old.id) then return null; end if;
    if tg_op = 'UPDATE' and new.amount is not distinct from old.amount and new.cash_account_id is not distinct from old.cash_account_id
       and new.expense_date is not distinct from old.expense_date and new.description is not distinct from old.description then return null; end if;
    perform private.myra_cash_unpost('expense', old.id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.myra_cash_post_out('expense', new.id, new.cash_account_id, new.amount,
      coalesce(new.expense_date::timestamptz + interval '12 hours', now()),
      'Dépense' || coalesce(' ' || nullif(new.expense_number, ''), '') || coalesce(' : ' || nullif(trim(new.description), ''), ''), coalesce(new.created_by, auth.uid()));
  end if;
  return null;
end $$;
drop trigger if exists trg_myra_expense_cash on public.expenses;
create trigger trg_myra_expense_cash after insert or update or delete on public.expenses for each row execute function private.myra_expense_cash();

-- Paiements sortants (fournisseurs) : même logique. Les encaissements restent gérés par register_sale_payment.
create or replace function private.myra_payment_out_cash() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.direction = 'outgoing' then
    if tg_op = 'UPDATE' and new.amount is not distinct from old.amount and new.payment_method is not distinct from old.payment_method and new.direction = old.direction then return null; end if;
    perform private.myra_cash_unpost('payment_out', old.id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.direction = 'outgoing' then
    perform private.myra_cash_post_out('payment_out', new.id, private.myra_cash_account_for(null, new.payment_method), new.amount, new.payment_date,
      'Paiement fournisseur' || coalesce(' · réf. ' || nullif(new.reference, ''), ''), coalesce(new.received_by, auth.uid()));
  end if;
  return null;
end $$;
drop trigger if exists trg_myra_payment_out_cash on public.payments;
create trigger trg_myra_payment_out_cash after insert or update or delete on public.payments for each row execute function private.myra_payment_out_cash();

-- Clôture de caisse : attendu = encaissements − dépenses payées par la personne ce jour-là (par mode de paiement)
create or replace function public.get_cash_expected(p_date date default null, p_user uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text := private.current_staff_role(); v_user uuid := coalesce(p_user, auth.uid());
        v_date date := coalesce(p_date, (now() at time zone 'Africa/Brazzaville')::date); v_methods jsonb; v_count int; v_delivery numeric; v_exp jsonb;
begin
  if v_role is null then raise exception 'Accès refusé.'; end if;
  if v_user <> auth.uid() and v_role not in ('owner','admin','manager','accountant') then raise exception 'Accès refusé.'; end if;
  select coalesce(jsonb_object_agg(m, total), '{}') into v_exp from (
    select coalesce(payment_method, 'cash') m, sum(amount) total from public.expenses where created_by = v_user and expense_date = v_date group by 1) x;
  select coalesce(jsonb_object_agg(m, total), '{}') into v_methods from (
    select m, sum(t) total from (
      select coalesce(payment_method, 'other') m, amount t from public.payments
       where direction = 'incoming' and received_by = v_user and (payment_date at time zone 'Africa/Brazzaville')::date = v_date
      union all
      select coalesce(payment_method, 'cash'), -amount from public.expenses where created_by = v_user and expense_date = v_date) y group by m) x;
  select count(*) into v_count from public.sales where created_by = v_user and (sale_date at time zone 'Africa/Brazzaville')::date = v_date and status in ('confirmed','partially_paid','paid');
  select coalesce(sum(cash_collected), 0) into v_delivery from public.customer_orders where driver_id = v_user and (delivered_at at time zone 'Africa/Brazzaville')::date = v_date;
  return jsonb_build_object('date', v_date, 'user_id', v_user, 'methods', v_methods, 'expenses', v_exp, 'sales_count', v_count, 'delivery_cash', v_delivery,
    'closing', (select to_jsonb(c) from public.cash_closings c where c.closing_date = v_date and c.user_id = v_user));
end $$;
revoke all on function public.get_cash_expected(date, uuid) from public, anon;
grant execute on function public.get_cash_expected(date, uuid) to authenticated;

-- Reprise des dépenses déjà enregistrées (à lancer UNE fois, seulement si vous le décidez) :
--   select private.myra_cash_post_out('expense', e.id, private.myra_cash_account_for(e.cash_account_id, e.payment_method), e.amount,
--          e.expense_date::timestamptz, 'Dépense ' || coalesce(e.expense_number, '') || ' : ' || coalesce(e.description, ''), e.created_by)
--     from public.expenses e where not exists (select 1 from public.cash_transactions t where t.source_type = 'expense' and t.source_id = e.id);

notify pgrst, 'reload schema';
