\set ON_ERROR_STOP 0
\pset format unaligned
\pset tuples_only on
begin;
update public.cash_accounts set is_active = true, current_balance = 15000 where name = 'Caisse principale';
insert into public.cash_accounts (name, account_type, current_balance, is_active) select 'Caisse principale', 'cash', 15000, true where not exists (select 1 from public.cash_accounts where name = 'Caisse principale');
insert into public.products (id, name, unit, sale_price, cost_price, stock_quantity, is_active, min_stock) values
  ('bbbbbbbb-4100-0000-0000-000000000001', 'Marinade 250 g', 'pot', 2500, 900, 20, true, 5),
  ('bbbbbbbb-4100-0000-0000-000000000002', 'Épices', 'sachet', 1000, 300, 2, true, 3);
insert into public.raw_materials (id, name, unit, average_cost, stock_quantity, min_stock) values ('cccccccc-4100-0000-0000-000000000001', 'Gingembre', 'kg', 2000, 1, 0);
insert into public.recipes (id, product_id, yield_quantity) values ('dddddddd-4100-0000-0000-000000000001', 'bbbbbbbb-4100-0000-0000-000000000002', 10);
insert into public.recipe_items (recipe_id, raw_material_id, quantity) values ('dddddddd-4100-0000-0000-000000000001', 'cccccccc-4100-0000-0000-000000000001', 2);
insert into public.customers (id, full_name, phone) values ('aaaaaaaa-4100-0000-0000-000000000001', 'Awa Nkounkou', '061112233');
set local role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

select 'comptes', string_agg(name || ':' || is_active, ', ' order by name) from public.cash_accounts;
-- Trésorerie
select 'apport', public.cash_movement('contribution', (select id from public.cash_accounts where name = 'Caisse principale'), 20000, 'Fonds de départ') is not null, (select current_balance from public.cash_accounts where name = 'Caisse principale');
select 'transfert', public.cash_movement('transfer', (select id from public.cash_accounts where name = 'Caisse principale'), 5000, 'Dépôt MoMo', (select id from public.cash_accounts where name = 'MTN MoMo')) is not null,
  (select string_agg(name || '=' || current_balance, ' ' order by name) from public.cash_accounts where is_active);
savepoint a; select public.cash_movement('transfer', (select id from public.cash_accounts where name = 'MTN MoMo'), 5, null, (select id from public.cash_accounts where name = 'MTN MoMo')); rollback to a;
select 'annuler le transfert', public.cancel_cash_movement((select source_id from public.cash_transactions where source_type = 'transfer' limit 1)), (select string_agg(name || '=' || current_balance, ' ' order by name) from public.cash_accounts where is_active);
select 'rapprochement', public.reconcile_cash_account((select id from public.cash_accounts where name = 'Caisse principale'), 34000, 'Comptage')->>'difference', (select current_balance from public.cash_accounts where name = 'Caisse principale');
-- Caisse rapide (MoMo → compte MTN MoMo)
select 'caisse rapide', public.pos_checkout('[{"product_id":"bbbbbbbb-4100-0000-0000-000000000001","quantity":3}]', null, 500, 'mtn_momo', null, null) - 'id' - 'receipt_token';
select 'stock après vente', stock_quantity from public.products where id = 'bbbbbbbb-4100-0000-0000-000000000001';
select 'MoMo encaissé sur le compte MTN', current_balance from public.cash_accounts where name = 'MTN MoMo';
select 'espèces + rendu monnaie', public.pos_checkout('[{"product_id":"bbbbbbbb-4100-0000-0000-000000000001","quantity":1}]', null, 0, 'cash', 5000, null)->>'change';
savepoint a; select public.pos_checkout('[{"product_id":"bbbbbbbb-4100-0000-0000-000000000002","quantity":9}]', null, 0, 'cash', null, null); rollback to a;
savepoint a; select public.pos_checkout('[{"product_id":"bbbbbbbb-4100-0000-0000-000000000001","quantity":1}]', null, 0, 'credit', null, null); rollback to a;
select 'à crédit', public.pos_checkout('[{"product_id":"bbbbbbbb-4100-0000-0000-000000000001","quantity":1}]', 'aaaaaaaa-4100-0000-0000-000000000001', 0, 'credit', null, null)->>'remaining';
-- Reçu public
reset role; select set_config('t.tok', (select receipt_token from public.sales where notes like 'Caisse rapide%' order by created_at limit 1), true); set local role anon;
select 'reçu public', (public.get_public_receipt(current_setting('t.tok')) - 'company' - 'items' - 'payments' - 'date' - 'returns');
savepoint a; select public.get_public_receipt('nimportequoi'); rollback to a;
reset role; set local role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
-- Retour
select 'vente pour retour', jsonb_array_length(public.get_sale_for_return((select sale_number from public.sales where total = 7000 limit 1))->'items');
savepoint a; select public.create_sale_return((select id from public.sales where total = 7000 limit 1), '[{"product_id":"bbbbbbbb-4100-0000-0000-000000000001","quantity":5}]', 'Pot abîmé', 0, 'cash', true); rollback to a;
savepoint a; select public.create_sale_return((select id from public.sales where total = 7000 limit 1), '[{"product_id":"bbbbbbbb-4100-0000-0000-000000000001","quantity":1}]', 'Pot abîmé', 9000, 'cash', true); rollback to a;
select 'retour + remboursement', public.create_sale_return((select id from public.sales where total = 7000 limit 1), '[{"product_id":"bbbbbbbb-4100-0000-0000-000000000001","quantity":1}]', 'Pot fissuré', 2333.33, 'mtn_momo', true) - 'id' - 'return_number';
select 'stock remis', stock_quantity, (select current_balance from public.cash_accounts where name = 'MTN MoMo') from public.products where id = 'bbbbbbbb-4100-0000-0000-000000000001';
-- Bénéfice
reset role; select 'debug', (select string_agg(s.status||':'||si.quantity||':'||coalesce(private.myra_unit_cost(si.product_id),-1)||':'||to_char(s.sale_date,'YYYY-MM'), ' ') from public.sale_items si join public.sales s on s.id=si.sale_id where si.product_id='bbbbbbbb-4100-0000-0000-000000000001');
set local role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select 'bénéfice', jsonb_array_length(public.get_profit_report(3)->'months'), public.get_profit_report(3)->>'cost_method', (public.get_profit_report(3)->'months'->-1) - 'expenses' - 'month';
-- Planning
select 'planning', (select x->>'to_produce' from jsonb_array_elements(public.get_production_plan(7)->'products') x where x->>'name' = 'Épices'), public.get_production_plan(7)->'materials'->0->>'to_buy';
select 'lots créés', public.create_production_batches('[{"product_id":"bbbbbbbb-4100-0000-0000-000000000002","quantity":20}]');
select 'bon de commande', jsonb_array_length(public.create_purchase_orders_from_plan('[{"raw_material_id":"cccccccc-4100-0000-0000-000000000001","quantity":4}]')), (select total from public.purchase_orders order by created_at desc limit 1);
-- Sauvegardes
select 'sauvegarde', public.run_backup_now() is not null, (select count(*) from public.list_backups());
reset role; delete from public.customers where id = 'aaaaaaaa-4100-0000-0000-000000000001' and not exists (select 1 from public.sales where customer_id = 'aaaaaaaa-4100-0000-0000-000000000001');
update public.customers set phone = '000' where id = 'aaaaaaaa-4100-0000-0000-000000000001';
set local role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select 'restauration clients', public.restore_backup_table((select id from public.list_backups() limit 1), 'customers') > 0, (select phone from public.customers where id = 'aaaaaaaa-4100-0000-0000-000000000001');
select 'restauration loyalty_accounts (clé)', public.restore_backup_table((select id from public.list_backups() limit 1), 'loyalty_accounts') >= 0;
savepoint a; select public.restore_backup_table((select id from public.list_backups() limit 1), 'profiles'); rollback to a;
-- Vendeur
reset role; insert into auth.users (id, email) values ('55555555-4100-5555-5555-555555555555', 'v@example.com'); update public.profiles set role = 'sales', is_active = true where id = '55555555-4100-5555-5555-555555555555';
set local role authenticated; select set_config('request.jwt.claim.sub', '55555555-4100-5555-5555-555555555555', true);
savepoint a; select public.cash_movement('withdrawal', (select id from public.cash_accounts where name = 'Caisse principale'), 100, null); rollback to a;
savepoint a; select public.list_backups(); rollback to a;
savepoint a; select public.get_profit_report(3); rollback to a;
select 'vendeur : caisse rapide autorisée', (public.pos_checkout('[{"product_id":"bbbbbbbb-4100-0000-0000-000000000001","quantity":1}]', null, 0, 'cash', null, null)->>'paid')::numeric;
reset role;
rollback;
