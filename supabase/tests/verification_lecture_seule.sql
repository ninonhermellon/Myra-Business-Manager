-- Vérification de santé de la base Myra (lecture seule : ne modifie rien).
-- À lancer dans Supabase › SQL Editor après chaque migration. Chaque ligne doit afficher ok = true.
with checks(nom, ok, detail) as (
  select 'Tables V29 présentes (21)', count(*) = 21, count(*)::text from pg_tables where schemaname = 'public' and tablename in
    ('product_lots','complaints','customer_prices','volume_prices','recurring_orders','payment_schedules','catering_events','gift_cards','gift_card_transactions','sales_targets','employees','attendance','salary_advances','stock_locations','location_stock','stock_transfers','inventory_sessions','inventory_lines','recurring_expenses','expense_budgets','message_campaigns')
  union all select 'Tables V30 présentes (4)', count(*) = 4, count(*)::text from pg_tables where schemaname = 'public' and tablename in ('referral_rewards','business_goals','customer_portal_links','order_reviews')
  union all select 'Boutique en ligne : réglages et colonnes (V31)', count(*) = 3, count(*)::text from (select 1 from pg_tables where schemaname = 'public' and tablename = 'shop_settings' union all select 1 from information_schema.columns where table_schema = 'public' and table_name = 'customer_orders' and column_name in ('source','customer_whatsapp')) x
  union all select 'Notifications : tables, déclencheurs, clés (V33)', count(*) = 8, count(*)::text from (
      select 1 from pg_tables where schemaname = 'public' and tablename in ('push_subscriptions','push_config')
      union all select 1 from pg_trigger where not tgisinternal and tgname in ('trg_myra_push_order','trg_myra_push_sale','trg_myra_push_payment','trg_myra_push_review','trg_myra_push_stock')
      union all select 1 from public.push_config where vapid_public is not null) x
  union all select 'Notifications : configuration illisible par les visiteurs et l''équipe', not has_table_privilege('anon', 'public.push_config', 'select') and not has_table_privilege('authenticated', 'public.push_config', 'select'), ''
  union all select 'Centre de notifications, boutique enrichie, suivi (V36)', count(*) = 5, count(*)::text from (
      select 1 from pg_tables where schemaname = 'public' and tablename in ('app_notifications','app_notification_reads')
      union all select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'app_notifications'
      union all select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('get_public_order','check_public_promo') and has_function_privilege('anon', p.oid, 'execute')) x
  union all select 'Avis détaillés : table boutique, critères, fonctions publiques (V37)', count(*) = 4, count(*)::text from (
      select 1 from pg_tables where schemaname = 'public' and tablename = 'product_reviews'
      union all select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_reviews' and column_name = 'rating_after_sales'
      union all select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('submit_product_review','get_product_reviews') and has_function_privilege('anon', p.oid, 'execute')) x
  union all select 'Règles d''accès actives sur toutes les tables', count(*) = 0, coalesce(string_agg(tablename, ', '), '') from pg_tables where schemaname = 'public' and not rowsecurity
  union all select 'Clés étrangères toutes indexées', count(*) = 0, count(*)::text from pg_constraint c join pg_namespace n on n.oid = c.connamespace and n.nspname = 'public'
    where c.contype = 'f' and array_length(c.conkey, 1) = 1 and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
  union all select 'Pas de règle de lecture en double (V29/V30)', count(*) = 0, count(*)::text from (select polrelid from pg_policy where polname like '%\_v29\_%' and polcmd in ('r','*') group by polrelid having count(*) > 1) x
  union all select 'Aucune règle ouverte aux visiteurs sur les tables V29/V30', count(*) = 0, coalesce(string_agg(polrelid::regclass::text, ', '), '') from pg_policy
    where polname like '%\_v29\_%' and not (polroles <@ array[(select oid from pg_roles where rolname = 'authenticated')])
  union all select 'Fonctions publiques (espace client, avis, boutique) appelables par les visiteurs', bool_and(has_function_privilege('anon', p.oid, 'execute')), string_agg(p.proname, ', ')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('get_customer_portal','get_review_request','submit_review','get_public_catalog','place_public_order')
  union all select 'Fonctions internes NON appelables par les visiteurs', not bool_or(has_function_privilege('anon', p.oid, 'execute')), string_agg(p.proname, ', ') filter (where has_function_privilege('anon', p.oid, 'execute'))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('redeem_gift_card','apply_inventory','transfer_stock','generate_due_recurring_orders','get_team_members','save_push_subscription')
  union all select 'Fonctions sensibles avec contrôle du rôle', bool_and(p.prosrc ~* 'current_staff_role|profiles'), string_agg(p.proname, ', ') filter (where p.prosrc !~* 'current_staff_role|profiles')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and p.proname in ('redeem_gift_card','apply_inventory','get_team_members','confirm_sale','register_sale_payment','delete_sale_with_reconciliation')
  union all select 'Temps réel : ventes, commandes, paiements', count(*) = 3, string_agg(tablename, ', ') from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('sales','customer_orders','payments')
  union all select 'Stocks jamais négatifs', count(*) = 0, count(*)::text from public.products where stock_quantity < 0
  union all select 'Ventes : payé ≤ total', count(*) = 0, count(*)::text from public.sales where amount_paid > total + 0.01
  union all select 'Bons cadeaux : solde entre 0 et le montant initial', count(*) = 0, count(*)::text from public.gift_cards where balance < 0 or balance > initial_amount
)
select ok, nom, detail from checks order by ok, nom;
