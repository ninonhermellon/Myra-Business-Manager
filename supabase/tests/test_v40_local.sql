\set ON_ERROR_STOP 0
\pset format unaligned
\pset tuples_only on
create table if not exists public.cash_transactions (id uuid primary key default gen_random_uuid(), cash_account_id uuid references public.cash_accounts(id), transaction_date timestamptz default now(), direction text, amount numeric, source_type text, source_id uuid, description text, created_by uuid, created_at timestamptz default now());
alter table public.cash_accounts add column if not exists created_at timestamptz default now();
alter table public.payments add column if not exists reference text;
\i /var/tmp/myra-sql/v40.sql
begin;
insert into public.cash_accounts (id, name, account_type, current_balance, is_active) values ('aaaaaaaa-1111-4111-8111-000000000001', 'Caisse principale', 'cash', 15000, true);
insert into public.expenses (id, expense_number, expense_date, description, amount, payment_method) values ('eeeeeeee-1111-4111-8111-000000000000', 'ANCIENNE', current_date, 'Avant V40', 999, 'cash');
delete from public.cash_transactions where source_id = 'eeeeeeee-1111-4111-8111-000000000000';
update public.cash_accounts set current_balance = 15000;
set local role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
insert into public.expenses (id, expense_number, expense_date, description, amount, payment_method, created_by) values ('eeeeeeee-1111-4111-8111-000000000001', 'D1', current_date, 'Branding', 4000, 'cash', '11111111-1111-1111-1111-111111111111');
reset role;
select 'après dépense 4000', current_balance from public.cash_accounts;
select 'mouvement', direction, amount, source_type, description from public.cash_transactions where source_type = 'expense';
update public.expenses set amount = 5000 where id = 'eeeeeeee-1111-4111-8111-000000000001';
select 'après modif 5000', current_balance, (select count(*) from public.cash_transactions where source_type='expense') from public.cash_accounts;
update public.expenses set notes = 'x' where id = 'eeeeeeee-1111-4111-8111-000000000001';
select 'modif notes : inchangé', current_balance from public.cash_accounts;
update public.expenses set description = 'Ancienne modifiée' where id = 'eeeeeeee-1111-4111-8111-000000000000';
select 'ancienne dépense non reprise', current_balance from public.cash_accounts;
delete from public.expenses where id = 'eeeeeeee-1111-4111-8111-000000000001';
select 'après suppression', current_balance, (select count(*) from public.cash_transactions where source_type='expense') from public.cash_accounts;
insert into public.payments (id, amount, direction, payment_method, payment_date) values ('99999999-1111-4111-8111-000000000001', 2500, 'outgoing', 'cash', now());
select 'paiement fournisseur', current_balance from public.cash_accounts;
insert into public.payments (id, amount, direction, payment_method, payment_date) values ('99999999-1111-4111-8111-000000000002', 700, 'incoming', 'cash', now());
select 'encaissement direct ignoré (géré par la fonction de vente)', current_balance from public.cash_accounts;
delete from public.payments where id = '99999999-1111-4111-8111-000000000001';
select 'paiement fournisseur annulé', current_balance from public.cash_accounts;
insert into public.expenses (expense_number, expense_date, description, amount, payment_method, created_by) values ('D2', (now() at time zone 'Africa/Brazzaville')::date, 'Taxi', 1500, 'cash', '11111111-1111-1111-1111-111111111111');
set local role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select 'caisse attendue', public.get_cash_expected()->'methods', public.get_cash_expected()->'expenses';
reset role;
rollback;
