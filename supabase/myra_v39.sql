-- ============================================================================
-- Myra Business Manager V39
--  1. Droits détaillés par rôle (+ rôle « Livreur »)      7. Paniers abandonnés
--  2. Journal d'activité                                     8. Frais de livraison par quartier
--  3. Clôture de caisse                                      9. Suivi des livraisons (livreur)
--  4. Résumé du jour (notification à 18 h)                  10. Rentabilité par produit
--  5. Paiement Mobile Money dans la boutique                11. Validation en deux étapes (serveur)
--  6. Coffrets et abonnements
-- Ajouts uniquement, rejouable. Fuseau : Africa/Brazzaville.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Rôle « Livreur »
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('owner','admin','manager','sales','stock_manager','accountant','employee','driver'));

create or replace function private.myra_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_name text := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), initcap(replace(split_part(coalesce(new.email, ''), '@', 1), '.', ' ')));
begin
  insert into public.profiles (id, full_name, email, role, is_active)
  values (new.id, left(coalesce(nullif(v_name, ''), 'Nouveau membre'), 120), new.email,
          case when (new.raw_app_meta_data->>'myra_role') in ('admin','manager','sales','stock_manager','accountant','employee','driver') then new.raw_app_meta_data->>'myra_role' else 'employee' end,
          coalesce((new.raw_app_meta_data->>'myra_active')::boolean, false))
  on conflict (id) do nothing;
  if not coalesce((new.raw_app_meta_data->>'myra_active')::boolean, false) then
    perform private.myra_push('team', '👤 Nouveau compte à activer', coalesce(v_name, '') || ' · ' || coalesce(new.email, '') || E'\nUtilisateurs', './#/users', 'team-' || new.id, null);
  end if;
  return new;
exception when others then
  raise warning 'Fiche d''équipe non créée : %', sqlerrm; return new;
end $$;

create or replace function public.set_team_member(p_user uuid, p_role text, p_active boolean, p_name text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_me text := private.current_staff_role(); t public.profiles%rowtype;
begin
  if v_me not in ('owner', 'admin') then raise exception 'Réservé au propriétaire et aux administrateurs.'; end if;
  if p_user = auth.uid() then raise exception 'Vous ne pouvez pas modifier vos propres droits.'; end if;
  if p_role not in ('owner','admin','manager','sales','stock_manager','accountant','employee','driver') then raise exception 'Rôle inconnu.'; end if;
  select * into t from public.profiles where id = p_user;
  if not found then raise exception 'Membre introuvable.'; end if;
  if v_me = 'admin' and (t.role = 'owner' or p_role in ('owner', 'admin')) then raise exception 'Seul le propriétaire peut nommer un administrateur ou modifier le propriétaire.'; end if;
  if t.role = 'owner' and (p_role <> 'owner' or not p_active)
     and (select count(*) from public.profiles where role = 'owner' and is_active and id <> p_user) = 0 then
    raise exception 'Il doit rester au moins un propriétaire actif.';
  end if;
  update public.profiles set role = p_role, is_active = coalesce(p_active, is_active),
         full_name = coalesce(nullif(left(trim(p_name), 120), ''), full_name), updated_at = now()
   where id = p_user returning * into t;
  return jsonb_build_object('id', t.id, 'role', t.role, 'is_active', t.is_active, 'full_name', t.full_name);
end $$;

-- Fiche d'un membre (nom, téléphone) par la direction
create or replace function public.update_team_profile(p_user uuid, p_name text, p_phone text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me text := private.current_staff_role(); v_role text;
begin
  if v_me not in ('owner', 'admin') then raise exception 'Réservé au propriétaire et aux administrateurs.'; end if;
  select role into v_role from public.profiles where id = p_user;
  if not found then raise exception 'Membre introuvable.'; end if;
  if v_me = 'admin' and v_role = 'owner' and p_user <> auth.uid() then raise exception 'Seul le propriétaire peut modifier sa fiche.'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Le nom est obligatoire.'; end if;
  update public.profiles set full_name = left(trim(p_name), 120), phone = nullif(left(trim(coalesce(p_phone, '')), 30), ''), updated_at = now() where id = p_user;
end $$;
revoke all on function public.update_team_profile(uuid, text, text) from public, anon;
grant execute on function public.update_team_profile(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Validation en deux étapes : un compte qui l'a activée n'a AUCUN accès aux données
--     tant que le code n'a pas été saisi (niveau aal2 dans le jeton de connexion).
-- ---------------------------------------------------------------------------
create or replace function private.current_staff_role()
returns text language sql stable security definer set search_path = '' as $$
  select p.role
    from public.profiles p
   where p.id = (select auth.uid())
     and p.is_active = true
     and (coalesce((select auth.jwt()->>'aal'), 'aal1') = 'aal2'
          or not exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'))
   limit 1
$$;

-- ---------------------------------------------------------------------------
-- 1. Droits détaillés par rôle
-- ---------------------------------------------------------------------------
create table if not exists public.role_permissions (
  role text primary key check (role in ('manager','sales','stock_manager','accountant','employee','driver')),
  pages text[] not null default '{}',
  can_delete boolean not null default false,
  see_costs boolean not null default false,
  max_discount_pct numeric(5,2) not null default 0 check (max_discount_pct between 0 and 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
create index if not exists role_permissions_updated_by_idx on public.role_permissions (updated_by);
alter table public.role_permissions enable row level security;
drop policy if exists role_permissions_read on public.role_permissions;
create policy role_permissions_read on public.role_permissions for select to authenticated using ((select private.current_staff_role()) is not null);
revoke insert, update, delete on public.role_permissions from authenticated, anon;
grant select on public.role_permissions to authenticated;

insert into public.role_permissions (role, pages, can_delete, see_costs, max_discount_pct) values
 ('manager', array['dashboard','sync_center','sales','commandes','customers','marketing','deliveries','products','product_categories','bundles','costing','by_location','inventory','stock_locations','stock_transfers','finances','cash_closing','daily_summary','customer_prices','volume_prices','recurring','credit','payment_schedules','shop','delivery_zones','carts','portal_links','reviews','referrals','catering','gift_cards','lots','labels','complaints','team','payroll','employees','salary_advances','attendance','assistant','forecast','budget','messages','report','goals','sales_by_location','notifications','profile','settings','display'], true, true, 30),
 ('sales', array['dashboard','sync_center','sales','commandes','customers','marketing','deliveries','products','cash_closing','customer_prices','volume_prices','recurring','credit','payment_schedules','shop','carts','portal_links','reviews','referrals','catering','gift_cards','messages','notifications','profile','settings','display'], false, false, 10),
 ('stock_manager', array['dashboard','sync_center','products','product_categories','bundles','costing','by_location','inventory','stock_locations','stock_transfers','lots','labels','complaints','forecast','notifications','profile','settings','display'], false, true, 0),
 ('accountant', array['dashboard','sync_center','sales','finances','cash_closing','daily_summary','costing','credit','payment_schedules','budget','report','goals','sales_by_location','payroll','salary_advances','notifications','profile','settings','display'], false, true, 0),
 ('employee', array['dashboard','sync_center','sales','commandes','customers','products','deliveries','cash_closing','notifications','profile','settings','display'], false, false, 5),
 ('driver', array['deliveries','notifications','profile','display'], false, false, 0)
on conflict (role) do nothing;

create or replace function public.get_my_permissions() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_role text := private.current_staff_role(); r public.role_permissions%rowtype;
begin
  if v_role is null then return jsonb_build_object('role', null, 'all', false, 'pages', '[]'::jsonb); end if;
  if v_role in ('owner', 'admin') then return jsonb_build_object('role', v_role, 'all', true, 'can_delete', true, 'see_costs', true, 'max_discount_pct', 100); end if;
  select * into r from public.role_permissions where role = v_role;
  return jsonb_build_object('role', v_role, 'all', false, 'pages', to_jsonb(coalesce(r.pages, array['profile','notifications'])),
    'can_delete', coalesce(r.can_delete, false), 'see_costs', coalesce(r.see_costs, false), 'max_discount_pct', coalesce(r.max_discount_pct, 0));
end $$;
revoke all on function public.get_my_permissions() from public, anon;
grant execute on function public.get_my_permissions() to authenticated;

create or replace function public.set_role_permissions(p_role text, p_pages text[], p_can_delete boolean, p_see_costs boolean, p_max_discount numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if private.current_staff_role() not in ('owner', 'admin') then raise exception 'Réservé au propriétaire et aux administrateurs.'; end if;
  if p_role not in ('manager','sales','stock_manager','accountant','employee','driver') then raise exception 'Rôle non modifiable.'; end if;
  if coalesce(p_max_discount, 0) < 0 or coalesce(p_max_discount, 0) > 100 then raise exception 'Remise maximale entre 0 et 100 %%.'; end if;
  insert into public.role_permissions (role, pages, can_delete, see_costs, max_discount_pct, updated_at, updated_by)
  values (p_role, coalesce(p_pages, '{}'), coalesce(p_can_delete, false), coalesce(p_see_costs, false), coalesce(p_max_discount, 0), now(), auth.uid())
  on conflict (role) do update set pages = excluded.pages, can_delete = excluded.can_delete, see_costs = excluded.see_costs,
    max_discount_pct = excluded.max_discount_pct, updated_at = now(), updated_by = auth.uid();
end $$;
revoke all on function public.set_role_permissions(text, text[], boolean, boolean, numeric) from public, anon;
grant execute on function public.set_role_permissions(text, text[], boolean, boolean, numeric) to authenticated;

-- Garde-fou serveur : suppression
create or replace function private.myra_guard_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
  if auth.uid() is null then return old; end if;               -- tâches internes
  v_role := private.current_staff_role();
  if v_role in ('owner', 'admin') then return old; end if;
  if not coalesce((select can_delete from public.role_permissions where role = v_role), false) then
    raise exception 'Suppression non autorisée pour votre rôle. Demandez au propriétaire.' using errcode = '42501';
  end if;
  return old;
end $$;
do $$ declare t text; begin
  foreach t in array array['customers','products','product_categories','customer_orders','expenses','suppliers','raw_materials','promo_campaigns','payments','sales','quotes','purchase_orders'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_myra_guard_delete on public.%I', t);
      execute format('create trigger trg_myra_guard_delete before delete on public.%I for each row execute function private.myra_guard_delete()', t);
    end if;
  end loop;
end $$;

-- Garde-fou serveur : remise manuelle maximale sur une vente (hors code promo)
create or replace function private.myra_guard_discount() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_role text; v_max numeric;
begin
  if auth.uid() is null or coalesce(new.discount, 0) <= 0 or new.promotion_code is not null or coalesce(new.subtotal, 0) <= 0 then return new; end if;
  if tg_op = 'UPDATE' and new.discount is not distinct from old.discount and new.subtotal is not distinct from old.subtotal then return new; end if;
  v_role := private.current_staff_role();
  if v_role in ('owner', 'admin') then return new; end if;
  v_max := coalesce((select max_discount_pct from public.role_permissions where role = v_role), 0);
  if new.discount > round(new.subtotal * v_max / 100, 0) + 1 then
    raise exception 'Remise trop élevée : % %% maximum pour votre rôle.', v_max using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_myra_guard_discount on public.sales;
create trigger trg_myra_guard_discount before insert or update of discount, subtotal on public.sales for each row execute function private.myra_guard_discount();

-- ---------------------------------------------------------------------------
-- 2. Journal d'activité
-- ---------------------------------------------------------------------------
alter table public.audit_logs add column if not exists user_name text, add column if not exists summary text;
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_user_idx on public.audit_logs (user_id);
create index if not exists audit_logs_record_idx on public.audit_logs (table_name, record_id);
alter table public.audit_logs enable row level security;
drop policy if exists owner_admin_full_access on public.audit_logs;
drop policy if exists audit_logs_read on public.audit_logs;
create policy audit_logs_read on public.audit_logs for select to authenticated using ((select private.current_staff_role()) in ('owner', 'admin'));
revoke insert, update, delete on public.audit_logs from authenticated, anon;
grant select on public.audit_logs to authenticated;

create or replace function private.myra_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old); v_changes jsonb := '{}'; k text; v_label text; v_name text;
  v_skip text[] := array['updated_at','created_at','stock_quantity','current_balance','uses_count','last_success_at','failures'];
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      if not (k = any(v_skip)) and v_new->k is distinct from v_old->k then
        v_changes := v_changes || jsonb_build_object(k, jsonb_build_object('avant', v_old->k, 'après', v_new->k));
      end if;
    end loop;
    if v_changes = '{}' then return null; end if;
  end if;
  v_label := coalesce(v_row->>'sale_number', v_row->>'order_number', v_row->>'expense_number', v_row->>'quote_number', v_row->>'reference', v_row->>'code', v_row->>'full_name', v_row->>'name',
                      case when v_row ? 'amount' then private.myra_fcfa((v_row->>'amount')::numeric) end, '');
  select coalesce(p.full_name, p.email) into v_name from public.profiles p where p.id = auth.uid();
  insert into public.audit_logs (user_id, user_name, action, table_name, record_id, summary, details)
  values (auth.uid(), coalesce(v_name, case when auth.uid() is null then 'Système / boutique en ligne' else 'Utilisateur' end),
          lower(tg_op), tg_table_name, nullif(v_row->>'id', '')::uuid, left(v_label, 160),
          case tg_op when 'UPDATE' then v_changes when 'DELETE' then v_old
            else (select jsonb_object_agg(e.key, e.value) from jsonb_each(v_new) e where e.key = any(array['total','amount','status','discount','sale_price','role','is_active','payment_method','direction'])) end);
  if random() < 0.01 then delete from public.audit_logs where created_at < now() - interval '400 days'; end if;
  return null;
exception when others then
  raise warning 'Journal non enregistré : %', sqlerrm; return null;
end $$;
do $$ declare t text; begin
  foreach t in array array['sales','payments','customer_orders','products','customers','expenses','profiles','promo_campaigns','role_permissions','cash_accounts','gift_cards','purchase_orders','suppliers'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_myra_audit on public.%I', t);
      execute format('create trigger trg_myra_audit after insert or update or delete on public.%I for each row execute function private.myra_audit()', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Clôture de caisse
-- ---------------------------------------------------------------------------
create table if not exists public.cash_closings (
  id uuid primary key default gen_random_uuid(),
  closing_date date not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  expected jsonb not null default '{}',
  counted jsonb not null default '{}',
  expected_total numeric(14,2) not null default 0,
  counted_total numeric(14,2) not null default 0,
  difference numeric(14,2) not null default 0,
  sales_count integer not null default 0,
  notes text,
  status text not null default 'submitted' check (status in ('submitted','validated')),
  validated_by uuid references public.profiles(id) on delete set null,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (closing_date, user_id)
);
create index if not exists cash_closings_date_idx on public.cash_closings (closing_date desc);
create index if not exists cash_closings_user_idx on public.cash_closings (user_id);
create index if not exists cash_closings_validated_by_idx on public.cash_closings (validated_by);
alter table public.cash_closings enable row level security;
drop policy if exists cash_closings_read on public.cash_closings;
create policy cash_closings_read on public.cash_closings for select to authenticated
  using (user_id = (select auth.uid()) or (select private.current_staff_role()) in ('owner','admin','manager','accountant'));
revoke insert, update, delete on public.cash_closings from authenticated, anon;
grant select on public.cash_closings to authenticated;

create or replace function public.get_cash_expected(p_date date default null, p_user uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text := private.current_staff_role(); v_user uuid := coalesce(p_user, auth.uid());
        v_date date := coalesce(p_date, (now() at time zone 'Africa/Brazzaville')::date); v_methods jsonb; v_count int; v_delivery numeric;
begin
  if v_role is null then raise exception 'Accès refusé.'; end if;
  if v_user <> auth.uid() and v_role not in ('owner','admin','manager','accountant') then raise exception 'Accès refusé.'; end if;
  select coalesce(jsonb_object_agg(m, total), '{}') into v_methods from (
    select coalesce(payment_method, 'other') m, sum(amount) total from public.payments
     where direction = 'incoming' and received_by = v_user and (payment_date at time zone 'Africa/Brazzaville')::date = v_date group by 1) x;
  select count(*) into v_count from public.sales where created_by = v_user and (sale_date at time zone 'Africa/Brazzaville')::date = v_date and status in ('confirmed','partially_paid','paid');
  select coalesce(sum(cash_collected), 0) into v_delivery from public.customer_orders where driver_id = v_user and (delivered_at at time zone 'Africa/Brazzaville')::date = v_date;
  return jsonb_build_object('date', v_date, 'user_id', v_user, 'methods', v_methods, 'sales_count', v_count, 'delivery_cash', v_delivery,
    'closing', (select to_jsonb(c) from public.cash_closings c where c.closing_date = v_date and c.user_id = v_user));
end $$;
revoke all on function public.get_cash_expected(date, uuid) from public, anon;
grant execute on function public.get_cash_expected(date, uuid) to authenticated;

create or replace function public.close_cash(p_date date, p_counted jsonb, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_exp jsonb; v_methods jsonb; v_et numeric := 0; v_ct numeric := 0; k text; v_row public.cash_closings%rowtype; v_name text;
begin
  if private.current_staff_role() is null then raise exception 'Accès refusé.'; end if;
  if p_date is null or p_date > (now() at time zone 'Africa/Brazzaville')::date or p_date < (now() at time zone 'Africa/Brazzaville')::date - 7 then raise exception 'Date de clôture invalide (7 derniers jours).'; end if;
  if exists (select 1 from public.cash_closings where closing_date = p_date and user_id = auth.uid() and status = 'validated') then raise exception 'Cette caisse a déjà été validée par la direction.'; end if;
  if p_counted is null or jsonb_typeof(p_counted) <> 'object' then raise exception 'Montants comptés invalides.'; end if;
  for k in select jsonb_object_keys(p_counted) loop
    if k not in ('cash','mtn_momo','airtel_money','bank_transfer','card','other') or jsonb_typeof(p_counted->k) <> 'number' or (p_counted->>k)::numeric < 0 then raise exception 'Montant compté invalide (%).', k; end if;
    v_ct := v_ct + (p_counted->>k)::numeric;
  end loop;
  v_exp := public.get_cash_expected(p_date, auth.uid()); v_methods := v_exp->'methods';
  select coalesce(sum(value::numeric), 0) into v_et from jsonb_each_text(v_methods);
  v_et := v_et + coalesce((v_exp->>'delivery_cash')::numeric, 0);
  insert into public.cash_closings (closing_date, user_id, expected, counted, expected_total, counted_total, difference, sales_count, notes)
  values (p_date, auth.uid(), v_methods || jsonb_build_object('delivery_cash', coalesce((v_exp->>'delivery_cash')::numeric, 0)), p_counted, v_et, v_ct, v_ct - v_et, (v_exp->>'sales_count')::int, nullif(left(trim(coalesce(p_notes, '')), 500), ''))
  on conflict (closing_date, user_id) do update set expected = excluded.expected, counted = excluded.counted, expected_total = excluded.expected_total,
     counted_total = excluded.counted_total, difference = excluded.difference, sales_count = excluded.sales_count, notes = excluded.notes, created_at = now()
  returning * into v_row;
  select full_name into v_name from public.profiles where id = auth.uid();
  perform private.myra_push('payments', case when abs(v_row.difference) < 1 then '🧾 Caisse clôturée' else '⚠️ Écart de caisse' end,
     coalesce(v_name, '') || ' · ' || to_char(p_date, 'DD/MM') || ' · compté ' || private.myra_fcfa(v_ct) ||
     case when abs(v_row.difference) < 1 then ' (juste)' else ' · écart ' || case when v_row.difference > 0 then '+' else '−' end || private.myra_fcfa(abs(v_row.difference)) end,
     './#/cash_closing', 'cash-' || v_row.id, auth.uid());
  return to_jsonb(v_row);
end $$;
revoke all on function public.close_cash(date, jsonb, text) from public, anon;
grant execute on function public.close_cash(date, jsonb, text) to authenticated;

create or replace function public.validate_cash_closing(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if private.current_staff_role() not in ('owner','admin','manager','accountant') then raise exception 'Réservé à la direction et à la comptabilité.'; end if;
  update public.cash_closings set status = 'validated', validated_by = auth.uid(), validated_at = now() where id = p_id and user_id <> auth.uid();
  if not found then raise exception 'Clôture introuvable (vous ne pouvez pas valider votre propre caisse).'; end if;
end $$;
revoke all on function public.validate_cash_closing(uuid) from public, anon;
grant execute on function public.validate_cash_closing(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Mobile Money · 8. Zones de livraison · 6. Coffrets — colonnes
-- ---------------------------------------------------------------------------
alter table public.shop_settings
  add column if not exists momo_code text,
  add column if not exists momo_name text,
  add column if not exists momo_instructions text,
  add column if not exists airtel_code text,
  add column if not exists accept_cash_on_delivery boolean not null default true,
  add column if not exists free_delivery_from numeric(14,2),
  add column if not exists momo_number text;
-- Identité officielle (V39)
update public.shop_settings set momo_code = '245950', momo_number = '068172503', momo_name = 'Hermellon Glacial',
  whatsapp = '+242069007022', facebook_url = 'https://www.facebook.com/lessaveursdemyra', instagram_url = 'https://www.instagram.com/lessaveursdemyra',
  tiktok_url = 'https://www.tiktok.com/@lessaveursdemyra', updated_at = now();
update public.company_settings set company_name = 'Les saveurs de Myra', phone = '+242069007022', updated_at = now();

alter table public.customer_orders
  add column if not exists payment_method text,
  add column if not exists payment_reference text,
  add column if not exists payer_phone text,
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists payment_verified_by uuid references public.profiles(id) on delete set null,
  add column if not exists payment_verified_at timestamptz,
  add column if not exists driver_id uuid references public.profiles(id) on delete set null,
  add column if not exists out_for_delivery_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists delivery_proof_url text,
  add column if not exists cash_collected numeric(14,2),
  add column if not exists delivery_note text;
alter table public.customer_orders drop constraint if exists customer_orders_payment_method_check;
alter table public.customer_orders add constraint customer_orders_payment_method_check check (payment_method is null or payment_method in ('cash_on_delivery','mtn_momo','airtel_money'));
alter table public.customer_orders drop constraint if exists customer_orders_payment_status_check;
alter table public.customer_orders add constraint customer_orders_payment_status_check check (payment_status in ('unpaid','to_verify','paid','refused'));
create index if not exists customer_orders_driver_idx on public.customer_orders (driver_id);
create index if not exists customer_orders_verified_by_idx on public.customer_orders (payment_verified_by);
create index if not exists customer_orders_payment_status_idx on public.customer_orders (payment_status) where payment_status = 'to_verify';

create table if not exists public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  fee numeric(14,2) not null default 0 check (fee >= 0),
  delay text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
insert into public.delivery_zones (name, fee, delay, sort_order) values
  ('Centre-ville', 1000, 'Le jour même', 1), ('Poto-Poto', 1000, 'Le jour même', 2), ('Moungali', 1000, 'Le jour même', 3),
  ('Bacongo', 1500, 'Le jour même', 4), ('Ouenzé', 1500, 'Le jour même', 5), ('Makélékélé', 1500, '24 h', 6),
  ('Talangaï', 2000, '24 h', 7), ('Mfilou', 2000, '24 h', 8), ('Madibou', 2500, '24 à 48 h', 9), ('Djiri', 2500, '24 à 48 h', 10)
on conflict (name) do nothing;

alter table public.products
  add column if not exists is_bundle boolean not null default false,
  add column if not exists packaging_cost numeric(14,2) not null default 0,
  add column if not exists labour_cost numeric(14,2) not null default 0,
  add column if not exists target_margin_pct numeric(5,2) not null default 40;
create table if not exists public.product_bundle_items (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.products(id) on delete cascade,
  component_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(14,3) not null default 1 check (quantity > 0),
  unique (bundle_id, component_id),
  check (bundle_id <> component_id)
);
create index if not exists product_bundle_items_component_idx on public.product_bundle_items (component_id);

create table if not exists public.shop_carts (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique,
  customer_name text,
  phone text not null,
  items jsonb not null default '[]',
  total numeric(14,2) not null default 0,
  status text not null default 'open' check (status in ('open','converted','dismissed')),
  converted_order_id uuid references public.customer_orders(id) on delete set null,
  reminded_count integer not null default 0,
  last_reminded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shop_carts_updated_idx on public.shop_carts (updated_at desc);
create index if not exists shop_carts_order_idx on public.shop_carts (converted_order_id);

do $$ begin
  perform private.myra_v29_policies('delivery_zones', array['owner','admin','manager','sales','stock_manager','accountant','employee','driver'], array['owner','admin','manager']);
  perform private.myra_v29_policies('product_bundle_items', array['owner','admin','manager','sales','stock_manager','accountant','employee'], array['owner','admin','manager','stock_manager']);
  perform private.myra_v29_policies('shop_carts', array['owner','admin','manager','sales'], array['owner','admin','manager','sales']);
end $$;
revoke all on public.delivery_zones, public.product_bundle_items, public.shop_carts, public.cash_closings, public.role_permissions from anon;

-- ---------------------------------------------------------------------------
-- Catalogue public enrichi (paiement, zones, coffrets)
-- ---------------------------------------------------------------------------
create or replace function public.get_public_catalog()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'shop', (select jsonb_build_object('open', s.is_open, 'headline', s.headline, 'intro', s.intro, 'delivery', s.delivery_info, 'min_order', s.min_order, 'whatsapp', s.whatsapp,
              'hero_image', s.hero_image_url, 'announcement', s.announcement, 'hours', s.hours, 'facebook', s.facebook_url, 'instagram', s.instagram_url, 'tiktok', s.tiktok_url,
              'momo_code', s.momo_code, 'momo_number', s.momo_number, 'momo_name', s.momo_name, 'momo_instructions', s.momo_instructions, 'airtel_code', s.airtel_code,
              'cash_on_delivery', s.accept_cash_on_delivery, 'free_delivery_from', s.free_delivery_from) from public.shop_settings s limit 1),
    'company', (select jsonb_build_object('name', cs.company_name, 'phone', cs.phone, 'email', cs.email, 'address', cs.address, 'currency', coalesce(cs.currency_label, 'FCFA')) from public.company_settings cs order by cs.created_at limit 1),
    'zones', coalesce((select jsonb_agg(jsonb_build_object('name', z.name, 'fee', z.fee, 'delay', z.delay) order by z.sort_order, z.name) from public.delivery_zones z where z.is_active), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'description', c.description,
                              'image', (select p.image_url from public.products p where p.category_id = c.id and p.is_active and p.image_url is not null order by p.stock_quantity desc limit 1),
                              'count', (select count(*) from public.products p where p.category_id = c.id and p.is_active and p.sale_price > 0)) order by c.name)
                            from public.product_categories c where exists (select 1 from public.products p where p.category_id = c.id and p.is_active and p.sale_price > 0)), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'description', p.description, 'unit', p.unit, 'price', p.sale_price, 'image', p.image_url,
        'category_id', p.category_id, 'available', p.stock_quantity > 0, 'is_new', p.created_at > now() - interval '45 days',
        'rating', (private.myra_product_rating(p.id)->>'rating')::numeric, 'reviews', (private.myra_product_rating(p.id)->>'reviews')::int,
        'bundle', case when p.is_bundle then (select jsonb_agg(jsonb_build_object('name', c.name, 'quantity', bi.quantity, 'unit', c.unit) order by c.name)
                                                from public.product_bundle_items bi join public.products c on c.id = bi.component_id where bi.bundle_id = p.id) end,
        'value', case when p.is_bundle then (select sum(c.sale_price * bi.quantity) from public.product_bundle_items bi join public.products c on c.id = bi.component_id where bi.bundle_id = p.id) end
      ) order by p.is_bundle desc, (p.stock_quantity > 0) desc, p.name) from public.products p where p.is_active and p.sale_price > 0), '[]'::jsonb),
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

-- 7. Panier en cours (enregistré dès que le client a saisi son téléphone)
create or replace function public.save_shop_cart(p_token uuid, p_name text, p_phone text, p_items jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'); v_items jsonb := '[]'; v_total numeric := 0; v_item jsonb; v_prod record; v_qty numeric;
begin
  if p_token is null or length(v_phone) < 8 or length(v_phone) > 15 then return; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 30 then return; end if;
  if (select count(*) from public.shop_carts where updated_at > now() - interval '1 hour') > 300 then return; end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce(v_item->>'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or jsonb_typeof(v_item->'quantity') is distinct from 'number' then continue; end if;
    v_qty := least(500, greatest(1, round((v_item->>'quantity')::numeric)));
    select p.id, p.name, p.sale_price into v_prod from public.products p where p.id = (v_item->>'product_id')::uuid and p.is_active and p.sale_price > 0;
    if not found then continue; end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object('product_id', v_prod.id, 'name', v_prod.name, 'quantity', v_qty, 'price', v_prod.sale_price));
    v_total := v_total + v_prod.sale_price * v_qty;
  end loop;
  if jsonb_array_length(v_items) = 0 then return; end if;
  insert into public.shop_carts (token, customer_name, phone, items, total)
  values (p_token, nullif(left(trim(coalesce(p_name, '')), 120), ''), v_phone, v_items, v_total)
  on conflict (token) do update set customer_name = coalesce(excluded.customer_name, public.shop_carts.customer_name), phone = excluded.phone,
    items = excluded.items, total = excluded.total, updated_at = now()
  where public.shop_carts.status = 'open';
end $$;
revoke all on function public.save_shop_cart(uuid, text, text, jsonb) from public;
grant execute on function public.save_shop_cart(uuid, text, text, jsonb) to anon, authenticated;

create or replace function public.mark_cart_reminded(p_id uuid, p_dismiss boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if private.current_staff_role() not in ('owner','admin','manager','sales') then raise exception 'Accès refusé.'; end if;
  update public.shop_carts set reminded_count = reminded_count + case when p_dismiss then 0 else 1 end,
     last_reminded_at = case when p_dismiss then last_reminded_at else now() end,
     status = case when p_dismiss then 'dismissed' else status end, updated_at = now()
   where id = p_id and status = 'open';
end $$;
revoke all on function public.mark_cart_reminded(uuid, boolean) from public, anon;
grant execute on function public.mark_cart_reminded(uuid, boolean) to authenticated;

-- Commande en ligne : zone et frais, paiement (Mobile Money / à la livraison), abonnement, panier
drop function if exists public.place_public_order(text, text, text, text, text, date, text, jsonb, text);
create or replace function public.place_public_order(p_name text, p_phone text, p_whatsapp text, p_address text, p_zone text, p_delivery_date date, p_notes text, p_items jsonb,
  p_promo_code text default null, p_payment_method text default null, p_payment_reference text default null, p_payer_phone text default null,
  p_subscription text default null, p_cart_token uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_wa text := nullif(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'), '');
  v_name text := left(trim(coalesce(p_name, '')), 120);
  v_customer uuid; v_order uuid; v_number text; v_sub numeric(14,2) := 0; v_item jsonb; v_prod record; v_qty numeric; v_lines int := 0;
  v_shop public.shop_settings%rowtype; v_promo record; v_disc numeric(14,2) := 0;
  v_zone public.delivery_zones%rowtype; v_fee numeric(14,2) := 0; v_zone_name text := nullif(left(trim(coalesce(p_zone, '')), 80), '');
  v_pay text := coalesce(nullif(p_payment_method, ''), 'cash_on_delivery'); v_ref text := nullif(left(regexp_replace(coalesce(p_payment_reference, ''), '[^A-Za-z0-9._-]', '', 'g'), 40), '');
  v_payer text := nullif(regexp_replace(coalesce(p_payer_phone, ''), '\D', '', 'g'), ''); v_status text := 'unpaid'; v_items_json jsonb := '[]'; v_sub_id uuid;
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
  if p_subscription is not null and p_subscription not in ('weekly','biweekly','monthly') then raise exception 'Fréquence d''abonnement invalide.'; end if;
  -- Paiement
  if v_pay not in ('cash_on_delivery','mtn_momo','airtel_money') then raise exception 'Mode de paiement invalide.'; end if;
  if v_pay = 'cash_on_delivery' and not coalesce(v_shop.accept_cash_on_delivery, true) then raise exception 'Le paiement à la livraison n''est pas disponible : payez par Mobile Money.'; end if;
  if v_pay = 'mtn_momo' and coalesce(v_shop.momo_code, '') = '' then raise exception 'Le paiement MTN MoMo n''est pas disponible.'; end if;
  if v_pay = 'airtel_money' and coalesce(v_shop.airtel_code, '') = '' then raise exception 'Le paiement Airtel Money n''est pas disponible.'; end if;
  if v_pay <> 'cash_on_delivery' then
    if v_ref is null or length(v_ref) < 4 then raise exception 'Indiquez la référence (ID de transaction) reçue par SMS après le paiement.'; end if;
    if v_payer is not null and (length(v_payer) < 8 or length(v_payer) > 15) then raise exception 'Numéro Mobile Money invalide.'; end if;
    if exists (select 1 from public.customer_orders o where o.payment_reference = v_ref and o.payment_method = v_pay and o.payment_status <> 'refused') then raise exception 'Cette référence de paiement a déjà été utilisée.'; end if;
    v_status := 'to_verify';
  end if;
  -- Zone de livraison
  if exists (select 1 from public.delivery_zones where is_active) then
    select * into v_zone from public.delivery_zones where is_active and lower(name) = lower(coalesce(v_zone_name, ''));
    if not found then raise exception 'Choisissez votre quartier de livraison.'; end if;
    v_zone_name := v_zone.name; v_fee := v_zone.fee;
  end if;
  -- Anti-abus
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
  insert into public.customer_orders (order_number, customer_id, order_date, requested_delivery_at, delivery_address, delivery_zone, delivery_fee, subtotal, discount, total, status, notes, source, customer_whatsapp,
                                      payment_method, payment_reference, payer_phone, payment_status)
  values (v_number, v_customer, now(), p_delivery_date::timestamptz, left(trim(p_address), 300), v_zone_name, 0, 0, 0, 0, 'draft',
          concat_ws(E'\n', 'Commande passée sur la boutique en ligne par ' || v_name, nullif(left(trim(coalesce(p_notes, '')), 500), '')), 'web', coalesce(v_wa, v_phone),
          v_pay, v_ref, v_payer, v_status)
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
    v_items_json := v_items_json || jsonb_build_array(jsonb_build_object('product_id', v_prod.id, 'quantity', v_qty));
  end loop;
  if v_shop.min_order > 0 and v_sub < v_shop.min_order then raise exception 'Le minimum de commande est de % FCFA.', v_shop.min_order; end if;
  if v_shop.free_delivery_from is not null and v_sub >= v_shop.free_delivery_from then v_fee := 0; end if;

  if nullif(trim(coalesce(p_promo_code, '')), '') is not null then
    select * into v_promo from private.myra_promo_discount(p_promo_code, v_sub);
    v_disc := v_promo.discount;
    update public.promo_campaigns set uses_count = uses_count + 1, updated_at = now() where id = v_promo.promo_id;
    update public.customer_orders set notes = concat_ws(E'\n', notes, 'Code promo ' || upper(trim(p_promo_code)) || ' (' || v_promo.promo_name || ') : − ' || private.myra_fcfa(v_disc)) where id = v_order;
  end if;
  update public.customer_orders set subtotal = v_sub, discount = v_disc, delivery_fee = v_fee, total = v_sub - v_disc + v_fee,
    notes = concat_ws(E'\n', notes,
      case v_pay when 'mtn_momo' then 'Paiement MTN MoMo à vérifier · réf. ' || v_ref || coalesce(' · payé depuis le ' || v_payer, '')
                 when 'airtel_money' then 'Paiement Airtel Money à vérifier · réf. ' || v_ref || coalesce(' · payé depuis le ' || v_payer, '')
                 else 'Paiement à la livraison' end,
      case when p_subscription is not null then 'Demande d''abonnement : ' || case p_subscription when 'weekly' then 'chaque semaine' when 'biweekly' then 'toutes les 2 semaines' else 'chaque mois' end end)
   where id = v_order;

  if p_subscription is not null then
    insert into public.recurring_orders (customer_id, label, frequency, next_date, items, delivery_zone, delivery_address, delivery_fee, is_active, notes)
    values (v_customer, 'Abonnement boutique · ' || v_name, p_subscription,
            coalesce(p_delivery_date, current_date) + case p_subscription when 'weekly' then 7 when 'biweekly' then 14 else 30 end,
            v_items_json, v_zone_name, left(trim(p_address), 300), v_fee, false, 'Demande depuis la boutique en ligne (' || v_number || ') : à valider.')
    returning id into v_sub_id;
  end if;
  if p_cart_token is not null then
    update public.shop_carts set status = 'converted', converted_order_id = v_order, updated_at = now() where token = p_cart_token and status = 'open';
  end if;
  if v_status = 'to_verify' then
    perform private.myra_push('payments', '📱 Paiement ' || case v_pay when 'mtn_momo' then 'MTN MoMo' else 'Airtel Money' end || ' à vérifier',
      v_number || ' · ' || private.myra_fcfa(v_sub - v_disc + v_fee) || ' · réf. ' || v_ref, './#/commandes', 'pay-' || v_order, null);
  end if;
  return jsonb_build_object('order_number', v_number, 'subtotal', v_sub, 'discount', v_disc, 'delivery_fee', v_fee, 'total', v_sub - v_disc + v_fee, 'lines', v_lines,
                            'payment_method', v_pay, 'payment_status', v_status, 'subscription', v_sub_id is not null);
end $$;
revoke all on function public.place_public_order(text, text, text, text, text, date, text, jsonb, text, text, text, text, text, uuid) from public;
grant execute on function public.place_public_order(text, text, text, text, text, date, text, jsonb, text, text, text, text, text, uuid) to anon, authenticated;

-- Vérification d'un paiement Mobile Money par l'équipe
create or replace function public.verify_order_payment(p_order uuid, p_ok boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if private.current_staff_role() not in ('owner','admin','manager','accountant','sales') then raise exception 'Accès refusé.'; end if;
  update public.customer_orders set payment_status = case when p_ok then 'paid' else 'refused' end, payment_verified_by = auth.uid(), payment_verified_at = now(), updated_at = now(),
     notes = concat_ws(E'\n', notes, case when p_ok then 'Paiement vérifié ✔' else 'Paiement introuvable ✖ (à régler à la livraison)' end)
   where id = p_order and payment_method in ('mtn_momo','airtel_money');
  if not found then raise exception 'Commande introuvable ou sans paiement Mobile Money.'; end if;
end $$;
revoke all on function public.verify_order_payment(uuid, boolean) from public, anon;
grant execute on function public.verify_order_payment(uuid, boolean) to authenticated;

-- Suivi public : état du paiement et frais de livraison
create or replace function public.get_public_order_payment(p_number text, p_phone text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('method', o.payment_method, 'status', o.payment_status, 'delivery_fee', o.delivery_fee, 'zone', o.delivery_zone)
    from public.customer_orders o join public.customers c on c.id = o.customer_id
   where o.order_number = upper(trim(p_number))
     and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 8) = right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 8)
     and length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 8
   limit 1
$$;
revoke all on function public.get_public_order_payment(text, text) from public;
grant execute on function public.get_public_order_payment(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Assemblage des coffrets (stock des composants → stock du coffret)
-- ---------------------------------------------------------------------------
create or replace function public.assemble_bundle(p_bundle uuid, p_qty numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b record; c record; v_missing text;
begin
  if private.current_staff_role() not in ('owner','admin','manager','stock_manager') then raise exception 'Accès refusé.'; end if;
  if p_qty is null or p_qty <= 0 or p_qty > 10000 or p_qty <> round(p_qty) then raise exception 'Quantité invalide.'; end if;
  select id, name, is_bundle into b from public.products where id = p_bundle for update;
  if not found or not b.is_bundle then raise exception 'Ce produit n''est pas un coffret.'; end if;
  if not exists (select 1 from public.product_bundle_items where bundle_id = p_bundle) then raise exception 'Ajoutez d''abord la composition du coffret.'; end if;
  select string_agg(p.name || ' (' || p.stock_quantity || ' / ' || bi.quantity * p_qty || ')', ', ') into v_missing
    from public.product_bundle_items bi join public.products p on p.id = bi.component_id
   where bi.bundle_id = p_bundle and p.stock_quantity < bi.quantity * p_qty;
  if v_missing is not null then raise exception 'Stock insuffisant : %', v_missing; end if;
  for c in select bi.component_id, bi.quantity * p_qty q, p.cost_price from public.product_bundle_items bi join public.products p on p.id = bi.component_id where bi.bundle_id = p_bundle loop
    update public.products set stock_quantity = stock_quantity - c.q, updated_at = now() where id = c.component_id;
    insert into public.product_movements (product_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes, created_by)
    values (c.component_id, 'adjustment_out', c.q, coalesce(c.cost_price, 0), 'bundle', p_bundle, 'Assemblage de ' || p_qty || ' coffret(s) « ' || b.name || ' »', auth.uid());
  end loop;
  update public.products set stock_quantity = stock_quantity + p_qty, updated_at = now() where id = p_bundle;
  insert into public.product_movements (product_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes, created_by)
  values (p_bundle, 'production', p_qty, 0, 'bundle', p_bundle, 'Coffrets assemblés', auth.uid());
  return jsonb_build_object('bundle', b.name, 'assembled', p_qty, 'stock', (select stock_quantity from public.products where id = p_bundle));
end $$;
revoke all on function public.assemble_bundle(uuid, numeric) from public, anon;
grant execute on function public.assemble_bundle(uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Livraisons
-- ---------------------------------------------------------------------------
create or replace function public.get_deliveries(p_scope text default 'mine')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text := private.current_staff_role(); v_all boolean;
begin
  if v_role is null then raise exception 'Accès refusé.'; end if;
  v_all := p_scope = 'all' and v_role in ('owner','admin','manager','sales','employee');
  return coalesce((select jsonb_agg(x order by x->>'sort') from (
    select jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', o.status, 'total', o.total, 'delivery_fee', o.delivery_fee,
      'address', o.delivery_address, 'zone', o.delivery_zone, 'requested', o.requested_delivery_at, 'notes', o.notes,
      'customer', c.full_name, 'phone', c.phone, 'whatsapp', o.customer_whatsapp,
      'payment_method', o.payment_method, 'payment_status', o.payment_status,
      'to_collect', case when o.payment_status = 'paid' then 0 else o.total end,
      'driver_id', o.driver_id, 'driver', (select full_name from public.profiles where id = o.driver_id),
      'delivered_at', o.delivered_at, 'cash_collected', o.cash_collected, 'proof', o.delivery_proof_url, 'delivery_note', o.delivery_note,
      'items', (select string_agg(i.quantity::int || ' × ' || i.product_name, ', ' order by i.product_name) from public.customer_order_items i where i.order_id = o.id),
      'sort', case o.status when 'out_for_delivery' then '1' when 'ready' then '2' when 'processing' then '3' when 'confirmed' then '4' else '9' end || coalesce(to_char(o.requested_delivery_at, 'YYYYMMDD'), '99999999')) x
      from public.customer_orders o left join public.customers c on c.id = o.customer_id
     where (o.status in ('confirmed','processing','ready','out_for_delivery')
            or (o.delivered_at is not null and o.delivered_at > now() - interval '1 day'))
       and (v_all or o.driver_id = auth.uid())
     limit 200) t), '[]'::jsonb);
end $$;
revoke all on function public.get_deliveries(text) from public, anon;
grant execute on function public.get_deliveries(text) to authenticated;

create or replace function public.assign_driver(p_order uuid, p_driver uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if private.current_staff_role() not in ('owner','admin','manager','sales') then raise exception 'Accès refusé.'; end if;
  if p_driver is not null and not exists (select 1 from public.profiles where id = p_driver and is_active) then raise exception 'Livreur introuvable.'; end if;
  update public.customer_orders set driver_id = p_driver, delivery_driver = (select full_name from public.profiles where id = p_driver), updated_at = now() where id = p_order;
  if not found then raise exception 'Commande introuvable.'; end if;
  if p_driver is not null and p_driver <> auth.uid() then
    perform private.myra_push('orders', '🛵 Nouvelle livraison', (select order_number || coalesce(' · ' || delivery_zone, '') from public.customer_orders where id = p_order), './#/deliveries', 'drv-' || p_order, auth.uid());
  end if;
end $$;
revoke all on function public.assign_driver(uuid, uuid) from public, anon;
grant execute on function public.assign_driver(uuid, uuid) to authenticated;

create or replace function public.update_delivery(p_order uuid, p_action text, p_cash numeric default null, p_proof text default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_role text := private.current_staff_role(); o public.customer_orders%rowtype;
begin
  if v_role is null then raise exception 'Accès refusé.'; end if;
  select * into o from public.customer_orders where id = p_order for update;
  if not found then raise exception 'Commande introuvable.'; end if;
  if o.driver_id is distinct from auth.uid() and v_role not in ('owner','admin','manager','sales') then raise exception 'Cette livraison ne vous est pas attribuée.'; end if;
  if p_proof is not null and p_proof !~ '^deliveries/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$' then raise exception 'Photo invalide.'; end if;
  if p_cash is not null and (p_cash < 0 or p_cash > o.total * 2 + 1) then raise exception 'Montant encaissé invalide.'; end if;
  if p_action = 'start' then
    if o.status not in ('confirmed','processing','ready') then raise exception 'Cette commande ne peut pas partir en livraison.'; end if;
    update public.customer_orders set status = 'out_for_delivery', out_for_delivery_at = now(), driver_id = coalesce(driver_id, auth.uid()), updated_at = now() where id = p_order;
  elsif p_action = 'delivered' then
    if o.status not in ('confirmed','processing','ready','out_for_delivery') then raise exception 'Commande déjà clôturée.'; end if;
    update public.customer_orders set status = 'delivered', delivered_at = now(), driver_id = coalesce(driver_id, auth.uid()), cash_collected = coalesce(p_cash, 0),
       delivery_proof_url = coalesce(p_proof, delivery_proof_url), delivery_note = nullif(left(trim(coalesce(p_note, '')), 500), ''), updated_at = now() where id = p_order;
    perform private.myra_push('orders', '✅ Commande livrée', o.order_number || case when coalesce(p_cash, 0) > 0 then ' · encaissé ' || private.myra_fcfa(p_cash) else '' end, './#/deliveries', 'dlv-' || p_order, auth.uid());
  elsif p_action = 'failed' then
    update public.customer_orders set status = 'ready', delivery_note = concat_ws(E'\n', delivery_note, 'Échec ' || to_char(now() at time zone 'Africa/Brazzaville', 'DD/MM HH24:MI') || ' : ' || coalesce(nullif(trim(p_note), ''), 'client absent')), updated_at = now() where id = p_order;
    perform private.myra_push('orders', '⚠️ Livraison non effectuée', o.order_number || ' · ' || coalesce(nullif(trim(p_note), ''), 'client absent'), './#/deliveries', 'dlv-' || p_order, auth.uid());
  else raise exception 'Action inconnue.'; end if;
  return (select jsonb_build_object('status', status, 'delivered_at', delivered_at) from public.customer_orders where id = p_order);
end $$;
revoke all on function public.update_delivery(uuid, text, numeric, text, text) from public, anon;
grant execute on function public.update_delivery(uuid, text, numeric, text, text) to authenticated;

-- Photos de preuve de livraison (privées)
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('myra-deliveries', 'myra-deliveries', false, 3145728, array['image/jpeg','image/png','image/webp'])
    on conflict (id) do nothing;
    drop policy if exists myra_deliveries_insert on storage.objects;
    create policy myra_deliveries_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'myra-deliveries' and (select private.current_staff_role()) is not null and (storage.foldername(name))[1] = 'deliveries');
    drop policy if exists myra_deliveries_read on storage.objects;
    create policy myra_deliveries_read on storage.objects for select to authenticated
      using (bucket_id = 'myra-deliveries' and (select private.current_staff_role()) in ('owner','admin','manager','sales','driver','employee'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Rentabilité par produit
-- ---------------------------------------------------------------------------
create or replace function public.get_product_costing()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text := private.current_staff_role();
begin
  if v_role is null or (v_role not in ('owner','admin') and not coalesce((select see_costs from public.role_permissions where role = v_role), false)) then
    raise exception 'Les coûts sont réservés à la direction.';
  end if;
  return coalesce((select jsonb_agg(x order by x->>'name') from (
    select jsonb_build_object('id', p.id, 'name', p.name, 'unit', p.unit, 'sale_price', p.sale_price, 'cost_price', p.cost_price, 'is_bundle', p.is_bundle,
      'material_cost', m.cost, 'recipe_lines', m.lines, 'missing_costs', m.missing,
      'bundle_cost', bc.cost,
      'packaging_cost', p.packaging_cost, 'labour_cost', p.labour_cost, 'target_margin_pct', p.target_margin_pct,
      'sold_30d', coalesce(s.q, 0), 'revenue_30d', coalesce(s.rev, 0)) x
    from public.products p
    left join lateral (
      select round(sum(ri.quantity * coalesce(rm.average_cost, 0)) / nullif(max(r.yield_quantity), 0), 2) cost, count(*) lines,
             count(*) filter (where coalesce(rm.average_cost, 0) = 0) missing
        from public.recipes r join public.recipe_items ri on ri.recipe_id = r.id left join public.raw_materials rm on rm.id = ri.raw_material_id
       where r.product_id = p.id and r.is_active and r.id = (select r2.id from public.recipes r2 where r2.product_id = p.id and r2.is_active order by r2.version desc limit 1)
    ) m on true
    left join lateral (
      select sum(bi.quantity * (coalesce(c.cost_price, 0) + coalesce(c.packaging_cost, 0) + coalesce(c.labour_cost, 0))) cost
        from public.product_bundle_items bi join public.products c on c.id = bi.component_id where bi.bundle_id = p.id and p.is_bundle
    ) bc on true
    left join lateral (
      select sum(si.quantity) q, sum(si.line_total) rev from public.sale_items si join public.sales sa on sa.id = si.sale_id
       where si.product_id = p.id and sa.status in ('confirmed','partially_paid','paid') and sa.sale_date > now() - interval '30 days'
    ) s on true
    where p.is_active) t), '[]'::jsonb);
end $$;
revoke all on function public.get_product_costing() from public, anon;
grant execute on function public.get_product_costing() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Résumé du jour
-- ---------------------------------------------------------------------------
create or replace function private.myra_daily_summary(p_date date) returns jsonb
language sql stable security definer set search_path = '' as $$
  with s as (select * from public.sales where status in ('confirmed','partially_paid','paid') and (sale_date at time zone 'Africa/Brazzaville')::date = p_date)
  select jsonb_build_object(
    'date', p_date,
    'revenue', coalesce((select sum(total) from s), 0),
    'sales_count', (select count(*) from s),
    'cash_in', coalesce((select sum(amount) from public.payments where direction = 'incoming' and (payment_date at time zone 'Africa/Brazzaville')::date = p_date), 0),
    'by_method', coalesce((select jsonb_object_agg(m, t) from (select coalesce(payment_method, 'other') m, sum(amount) t from public.payments where direction = 'incoming' and (payment_date at time zone 'Africa/Brazzaville')::date = p_date group by 1) x), '{}'),
    'by_seller', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(p.full_name, 'Sans vendeur'), 'count', x.n, 'total', x.t) order by x.t desc)
                  from (select created_by, count(*) n, sum(total) t from s group by created_by) x left join public.profiles p on p.id = x.created_by), '[]'),
    'top_products', coalesce((select jsonb_agg(jsonb_build_object('name', pr.name, 'quantity', x.q) order by x.q desc)
                  from (select si.product_id, sum(si.quantity) q from public.sale_items si join s on s.id = si.sale_id group by 1 order by 2 desc limit 3) x join public.products pr on pr.id = x.product_id), '[]'),
    'orders_new', (select count(*) from public.customer_orders where (created_at at time zone 'Africa/Brazzaville')::date = p_date),
    'orders_web', (select count(*) from public.customer_orders where source = 'web' and (created_at at time zone 'Africa/Brazzaville')::date = p_date),
    'to_deliver_tomorrow', (select count(*) from public.customer_orders where status in ('confirmed','processing','ready') and (requested_delivery_at at time zone 'Africa/Brazzaville')::date = p_date + 1),
    'to_deliver_late', (select count(*) from public.customer_orders where status in ('confirmed','processing','ready','out_for_delivery') and (requested_delivery_at at time zone 'Africa/Brazzaville')::date <= p_date),
    'payments_to_verify', (select count(*) from public.customer_orders where payment_status = 'to_verify'),
    'out_of_stock', coalesce((select jsonb_agg(name order by name) from public.products where is_active and stock_quantity <= 0), '[]'),
    'low_stock', coalesce((select jsonb_agg(name order by name) from public.products where is_active and stock_quantity > 0 and stock_quantity <= min_stock), '[]'),
    'unpaid_total', coalesce((select sum(total - amount_paid) from public.sales where status in ('confirmed','partially_paid') and total > amount_paid), 0),
    'unpaid_count', (select count(*) from public.sales where status in ('confirmed','partially_paid') and total > amount_paid),
    'expenses', coalesce((select sum(amount) from public.expenses where expense_date = p_date), 0),
    'cash_closings', coalesce((select jsonb_agg(jsonb_build_object('name', p.full_name, 'counted', c.counted_total, 'difference', c.difference, 'status', c.status))
                  from public.cash_closings c join public.profiles p on p.id = c.user_id where c.closing_date = p_date), '[]'),
    'carts_open', (select count(*) from public.shop_carts where status = 'open' and (updated_at at time zone 'Africa/Brazzaville')::date = p_date)
  )
$$;
revoke all on function private.myra_daily_summary(date) from public, anon, authenticated;

create or replace function public.get_daily_summary(p_date date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.current_staff_role() not in ('owner','admin','manager','accountant') then raise exception 'Réservé à la direction.'; end if;
  return private.myra_daily_summary(coalesce(p_date, (now() at time zone 'Africa/Brazzaville')::date));
end $$;
revoke all on function public.get_daily_summary(date) from public, anon;
grant execute on function public.get_daily_summary(date) to authenticated;

create or replace function private.myra_daily_summary_push() returns void
language plpgsql security definer set search_path = '' as $$
declare d jsonb := private.myra_daily_summary((now() at time zone 'Africa/Brazzaville')::date);
begin
  perform private.myra_push('summary', '📊 Résumé du jour · ' || private.myra_fcfa((d->>'revenue')::numeric),
    (d->>'sales_count') || ' vente(s) · encaissé ' || private.myra_fcfa((d->>'cash_in')::numeric)
    || E'\n' || (d->>'to_deliver_tomorrow') || ' commande(s) à livrer demain'
    || case when jsonb_array_length(d->'out_of_stock') > 0 then E'\nRuptures : ' || (select string_agg(value #>> '{}', ', ') from jsonb_array_elements(d->'out_of_stock')) else '' end
    || case when (d->>'unpaid_total')::numeric > 0 then E'\nImpayés : ' || private.myra_fcfa((d->>'unpaid_total')::numeric) else '' end,
    './#/daily_summary', 'summary-' || (d->>'date'), null);
end $$;
revoke all on function private.myra_daily_summary_push() from public, anon, authenticated;

-- Envoi automatique à 18 h (Brazzaville = UTC+1), du lundi au samedi
do $$ begin
  begin
    create extension if not exists pg_cron;
  exception when others then raise notice 'pg_cron indisponible : %', sqlerrm;
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'myra-resume-du-jour';
    perform cron.schedule('myra-resume-du-jour', '0 17 * * 1-6', 'select private.myra_daily_summary_push()');
  end if;
end $$;

-- Qui voit quoi dans la cloche
create or replace function private.myra_notif_allowed(p_kind text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_kind
    when 'orders'   then private.current_staff_role() is not null
    when 'sales'    then private.current_staff_role() in ('owner','super_admin','admin','manager','accountant','sales')
    when 'payments' then private.current_staff_role() in ('owner','super_admin','admin','manager','accountant')
    when 'reviews'  then private.current_staff_role() in ('owner','super_admin','admin','manager','sales')
    when 'stock'    then private.current_staff_role() in ('owner','super_admin','admin','manager','stock_manager')
    when 'summary'  then private.current_staff_role() in ('owner','super_admin','admin','manager','accountant')
    when 'team'     then private.current_staff_role() in ('owner','super_admin','admin')
    else private.current_staff_role() in ('owner','super_admin','admin','manager') end
$$;

notify pgrst, 'reload schema';
