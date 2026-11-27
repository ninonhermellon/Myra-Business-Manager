\set ON_ERROR_STOP 0
\pset format unaligned
\pset tuples_only on
begin;
-- Données de test
insert into auth.users (id, email) values ('55555555-5555-5555-5555-555555555555', 'vendeur@example.com'), ('66666666-6666-6666-6666-666666666666', 'livreur@example.com');
update public.profiles set role = 'sales', is_active = true, full_name = 'Vendeur Test' where id = '55555555-5555-5555-5555-555555555555';
update public.profiles set role = 'driver', is_active = true, full_name = 'Livreur Test' where id = '66666666-6666-6666-6666-666666666666';
insert into public.products (id, name, unit, sale_price, cost_price, stock_quantity, is_active) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Marinade 250 g', 'pot', 2500, 900, 20, true),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Épices', 'sachet', 1000, 300, 3, true),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'Coffret découverte', 'coffret', 3200, 0, 0, true);
update public.products set is_bundle = true where id = 'bbbbbbbb-0000-0000-0000-000000000003';
insert into public.product_bundle_items (bundle_id, component_id, quantity) values ('bbbbbbbb-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000001', 1), ('bbbbbbbb-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002', 1);
insert into public.raw_materials (id, name, unit, average_cost) values ('cccccccc-0000-0000-0000-000000000001', 'Gingembre', 'kg', 2000), ('cccccccc-0000-0000-0000-000000000002', 'Ail', 'kg', 0);
insert into public.recipes (id, product_id, yield_quantity) values ('dddddddd-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 10);
insert into public.recipe_items (recipe_id, raw_material_id, quantity) values ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 2), ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002', 1);
update public.products set packaging_cost = 150, labour_cost = 100 where id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- ===== Boutique (visiteur)
set local role anon; select set_config('request.jwt.claim.sub', '', true);
select 'catalogue : zones, momo, coffret', jsonb_array_length(public.get_public_catalog()->'zones'), public.get_public_catalog()->'shop'->>'momo_code',
  (select p->'bundle' is not null and (p->>'value')::numeric = 3500 from jsonb_array_elements(public.get_public_catalog()->'products') p where p->>'name' = 'Coffret découverte');
select public.save_shop_cart('eeeeeeee-0000-0000-0000-000000000001', 'Awa', '06 111 22 33', '[{"product_id":"bbbbbbbb-0000-0000-0000-000000000001","quantity":2}]');
select public.save_shop_cart('eeeeeeee-0000-0000-0000-000000000002', 'Ben', '06 999 88 77', '[{"product_id":"bbbbbbbb-0000-0000-0000-000000000002","quantity":1}]');
savepoint a; select 'zone obligatoire', public.place_public_order('Awa', '061112233', null, 'Rue 12', 'Paris', null, null, '[{"product_id":"bbbbbbbb-0000-0000-0000-000000000001","quantity":2}]'); rollback to a;
savepoint a; select 'référence momo obligatoire', public.place_public_order('Awa', '061112233', null, 'Rue 12', 'poto-poto', null, null, '[{"product_id":"bbbbbbbb-0000-0000-0000-000000000001","quantity":2}]', null, 'mtn_momo'); rollback to a;
select 'commande momo + zone + abonnement', public.place_public_order('Awa', '061112233', null, 'Rue 12', 'poto-poto', null, null, '[{"product_id":"bbbbbbbb-0000-0000-0000-000000000001","quantity":2}]', null, 'mtn_momo', 'MP2611.1234', '061112233', 'monthly', 'eeeeeeee-0000-0000-0000-000000000001') - 'order_number';
savepoint a; select 'référence réutilisée', public.place_public_order('Zoé', '062223344', null, 'Rue 1', 'Bacongo', null, null, '[{"product_id":"bbbbbbbb-0000-0000-0000-000000000002","quantity":1}]', null, 'mtn_momo', 'MP2611.1234'); rollback to a;
savepoint a; select 'airtel non configuré', public.place_public_order('Zoé', '062223344', null, 'Rue 1', 'Bacongo', null, null, '[{"product_id":"bbbbbbbb-0000-0000-0000-000000000002","quantity":1}]', null, 'airtel_money', 'AB1234'); rollback to a;
select 'paiement à la livraison', public.place_public_order('Zoé', '062223344', null, 'Rue 1', 'Bacongo', null, null, '[{"product_id":"bbbbbbbb-0000-0000-0000-000000000002","quantity":1}]')->>'total';
savepoint a; select count(*) from public.shop_carts; rollback to a;
savepoint a; select public.close_cash(current_date, '{"cash": 1}'); rollback to a;
reset role;
select 'commande enregistrée', payment_method, payment_status, delivery_zone, delivery_fee, total from public.customer_orders where payment_reference = 'MP2611.1234';
select 'abonnement en attente', frequency, is_active, items from public.recurring_orders where label like 'Abonnement boutique%';
select 'paniers', string_agg(status, ',' order by token) from public.shop_carts;
select 'notif momo', count(*) from public.app_notifications where title like '📱%';

-- ===== Vendeur
set local role authenticated; select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
select 'droits vendeur', public.get_my_permissions()->>'can_delete', public.get_my_permissions()->>'max_discount_pct', jsonb_array_length(public.get_my_permissions()->'pages') > 5;
savepoint a; delete from public.customers where id = (select id from public.customers limit 1); rollback to a;
savepoint a; select 'vendeur : journal invisible', count(*) from public.audit_logs; rollback to a;
savepoint a; select public.get_product_costing(); rollback to a;
select 'paniers visibles par le vendeur', count(*) from public.shop_carts;
select public.verify_order_payment((select id from public.customer_orders where payment_reference = 'MP2611.1234'), true);
-- vente avec remise
savepoint a; insert into public.sales (sale_number, subtotal, discount, total, status, created_by) values ('T-1', 10000, 2000, 8000, 'draft', '55555555-5555-5555-5555-555555555555'); rollback to a;
insert into public.sales (sale_number, subtotal, discount, total, status, created_by) values ('T-2', 10000, 1000, 9000, 'draft', '55555555-5555-5555-5555-555555555555');
select 'remise 10 % acceptée', count(*) from public.sales where sale_number = 'T-2';
-- assigner un livreur
select public.assign_driver((select id from public.customer_orders where payment_reference = 'MP2611.1234'), '66666666-6666-6666-6666-666666666666');
reset role;
update public.customer_orders set status = 'ready' where payment_reference = 'MP2611.1234';
insert into public.payments (sale_id, amount, direction, payment_method, received_by, payment_date) values ((select id from public.sales where sale_number = 'T-2'), 9000, 'incoming', 'cash', '55555555-5555-5555-5555-555555555555', now());
set local role authenticated; select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
select 'caisse attendue', public.get_cash_expected()->'methods';
select 'clôture', (public.close_cash((now() at time zone 'Africa/Brazzaville')::date, '{"cash": 8500}', 'Pièce manquante'))->>'difference';
savepoint a; select public.validate_cash_closing((select id from public.cash_closings limit 1)); rollback to a;

-- ===== Livreur
reset role; set local role authenticated; select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
select 'livreur : ses livraisons', jsonb_array_length(public.get_deliveries('all')), public.get_deliveries('mine')->0->>'to_collect';
savepoint a; select count(*) from public.customer_orders; rollback to a;
select 'départ', public.update_delivery((select (public.get_deliveries()->0->>'id')::uuid), 'start')->>'status';
savepoint a; select public.update_delivery((select (public.get_deliveries()->0->>'id')::uuid), 'delivered', 0, '../hack.png'); rollback to a;
select 'livrée', public.update_delivery((select (public.get_deliveries()->0->>'id')::uuid), 'delivered', 0, 'deliveries/0b9c3d3e-1111-4222-8333-444455556666/photo.jpg', 'Remis au gardien')->>'status';
savepoint a; select public.get_daily_summary(); rollback to a;

-- ===== Propriétaire
reset role; set local role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select 'journal', count(*) > 0, string_agg(distinct table_name, ',' order by table_name) from public.audit_logs;
select 'journal : modification détaillée', bool_or(details ? 'status') from public.audit_logs where table_name = 'customer_orders' and action = 'update';
select 'valider la caisse', public.validate_cash_closing((select id from public.cash_closings limit 1));
select 'coûts marinade', x->>'material_cost', x->>'missing_costs' from jsonb_array_elements(public.get_product_costing()) x where x->>'name' = 'Marinade 250 g';
savepoint a; select public.assemble_bundle('bbbbbbbb-0000-0000-0000-000000000003', 5); rollback to a;
select 'assemblage', public.assemble_bundle('bbbbbbbb-0000-0000-0000-000000000003', 2)->>'stock', (select stock_quantity from public.products where id = 'bbbbbbbb-0000-0000-0000-000000000002');
select 'résumé', (public.get_daily_summary()->>'sales_count'), public.get_daily_summary()->'out_of_stock', public.get_daily_summary()->>'payments_to_verify';
select 'droits : modifier', public.set_role_permissions('sales', array['sales','customers'], true, false, 15);
savepoint a; select public.set_role_permissions('owner', array['sales'], true, true, 100); rollback to a;
select 'fiche membre', public.update_team_profile('66666666-6666-6666-6666-666666666666', 'Junior Livreur', '06 555 44 33');
select 'rôle livreur via set_team_member', public.set_team_member('55555555-5555-5555-5555-555555555555', 'driver', true)->>'role';
reset role; select private.myra_daily_summary_push(); select 'notif résumé', count(*) from public.app_notifications where kind = 'summary';

-- ===== Validation en deux étapes
insert into auth.mfa_factors (user_id, status) values ('11111111-1111-1111-1111-111111111111', 'verified');
set local role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"aal":"aal1"}', true);
select '2FA sans code : aucun accès', private.current_staff_role() is null, (select count(*) from public.audit_logs);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);
select '2FA avec code : accès', private.current_staff_role();
reset role;
rollback;
