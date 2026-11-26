-- ============================================================================
-- Myra Business Manager V33 — Notifications push en temps réel (PWA ordinateur + téléphone)
-- La base prévient la fonction serveur « myra-push » à chaque événement important ;
-- elle envoie une notification aux appareils abonnés, même application fermée.
-- Ajouts uniquement, rejouable. Une erreur de notification ne bloque JAMAIS une vente.
-- ============================================================================
create extension if not exists pg_net with schema extensions;

-- Appareils abonnés (un par navigateur / téléphone)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device text,
  prefs jsonb not null default '{"orders":true,"sales":true,"payments":true,"reviews":true,"stock":true}'::jsonb,
  failures int not null default 0,
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_own_select on public.push_subscriptions;
create policy push_subscriptions_own_select on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists push_subscriptions_own_update on public.push_subscriptions;
create policy push_subscriptions_own_update on public.push_subscriptions for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists push_subscriptions_own_delete on public.push_subscriptions;
create policy push_subscriptions_own_delete on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));

-- Configuration interne : clés VAPID (créées par la fonction serveur) et secret d'appel.
-- Aucune règle d'accès : seule la fonction serveur (clé service) peut la lire.
create table if not exists public.push_config (
  id boolean primary key default true check (id),
  function_url text not null,
  hook_secret text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  vapid_public text,
  vapid_private text,
  updated_at timestamptz not null default now()
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;
insert into public.push_config (id, function_url) values (true, 'https://fvpvfmlmszcoyhjlgago.supabase.co/functions/v1/myra-push') on conflict (id) do nothing;

-- Abonnement d'un appareil (réservé à l'équipe connectée). Si le navigateur était lié à un
-- autre compte, il passe au compte actuel.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_device text, p_prefs jsonb default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null or private.current_staff_role() is null then raise exception 'Réservé à l''équipe connectée.'; end if;
  if coalesce(p_endpoint, '') !~ '^https://' or length(p_endpoint) > 1000 or length(coalesce(p_p256dh, '')) < 20 or length(coalesce(p_auth, '')) < 8 then raise exception 'Abonnement invalide.'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, device, prefs)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_device, 120), coalesce(p_prefs, '{"orders":true,"sales":true,"payments":true,"reviews":true,"stock":true}'::jsonb))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device,
    prefs = coalesce(p_prefs, public.push_subscriptions.prefs), failures = 0, updated_at = now()
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.save_push_subscription(text,text,text,text,jsonb) from public, anon;
grant execute on function public.save_push_subscription(text,text,text,text,jsonb) to authenticated;

-- Envoi : la base appelle la fonction serveur (asynchrone, ne ralentit pas les ventes)
create or replace function private.myra_push(p_kind text, p_title text, p_body text, p_url text, p_tag text, p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.push_config%rowtype;
begin
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

create or replace function private.myra_fcfa(n numeric) returns text language sql immutable as $$
  select replace(to_char(round(coalesce(n, 0)), 'FM999G999G999G990'), ',', ' ') || ' FCFA'
$$;

-- 1. Commandes (boutique en ligne et équipe). Déclencheur différé : lu à la fin de la
--    transaction, quand le total et les articles sont enregistrés.
create or replace function private.myra_push_order() returns trigger language plpgsql security definer set search_path = '' as $$
declare o record; v_items text;
begin
  select co.order_number, co.total, co.delivery_zone, co.delivery_address, co.source, co.created_by, c.full_name
    into o from public.customer_orders co left join public.customers c on c.id = co.customer_id where co.id = new.id;
  if not found then return null; end if;
  select string_agg(trim(to_char(i.quantity, 'FM999990.##')) || ' × ' || i.product_name, ', ') into v_items
    from (select * from public.customer_order_items where order_id = new.id limit 4) i;
  perform private.myra_push('orders',
    case when o.source = 'web' then '🛒 Nouvelle commande en ligne' else '📦 Nouvelle commande' end,
    concat_ws(' · ', coalesce(o.full_name, 'Client'), private.myra_fcfa(o.total), nullif(coalesce(o.delivery_zone, o.delivery_address), ''))
      || case when v_items is not null then E'\n' || v_items else '' end,
    './#/commandes', 'order-' || new.id, coalesce(o.created_by, auth.uid()));
  return null;
end $$;
drop trigger if exists trg_myra_push_order on public.customer_orders;
create constraint trigger trg_myra_push_order after insert on public.customer_orders
  deferrable initially deferred for each row execute function private.myra_push_order();

-- 2. Ventes confirmées
create or replace function private.myra_push_sale() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if new.status not in ('confirmed', 'partially_paid', 'paid') then return null; end if;
  if tg_op = 'UPDATE' and old.status <> 'draft' then return null; end if;
  select full_name into v_name from public.customers where id = new.customer_id;
  perform private.myra_push('sales', '✅ Nouvelle vente',
    concat_ws(' · ', new.sale_number, coalesce(v_name, 'Client comptant'), private.myra_fcfa(new.total)),
    './#/sales', 'sale-' || new.id, coalesce(new.created_by, auth.uid()));
  return null;
end $$;
drop trigger if exists trg_myra_push_sale on public.sales;
create trigger trg_myra_push_sale after insert or update of status on public.sales
  for each row execute function private.myra_push_sale();

-- 3. Paiements reçus après coup (le paiement fait au moment de la vente est déjà dans « Nouvelle vente »)
create or replace function private.myra_push_payment() returns trigger language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  if new.direction <> 'incoming' or new.sale_id is null then return null; end if;
  select sale_number, created_at, (select full_name from public.customers c where c.id = sales.customer_id) as name into s from public.sales where id = new.sale_id;
  if not found or s.created_at > now() - interval '5 minutes' then return null; end if;
  perform private.myra_push('payments', '💰 Paiement reçu',
    concat_ws(' · ', private.myra_fcfa(new.amount), coalesce(s.name, 'Client'), s.sale_number,
      case new.payment_method when 'cash' then 'Espèces' when 'mtn_momo' then 'MTN MoMo' when 'airtel_money' then 'Airtel Money' when 'bank_transfer' then 'Virement' when 'card' then 'Carte' else null end),
    './#/sales', 'payment-' || new.id, coalesce(new.received_by, auth.uid()));
  return null;
end $$;
drop trigger if exists trg_myra_push_payment on public.payments;
create trigger trg_myra_push_payment after insert on public.payments
  for each row execute function private.myra_push_payment();

-- 4. Avis clients reçus
create or replace function private.myra_push_review() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if new.rating is null or old.submitted_at is not null or new.submitted_at is null then return null; end if;
  select full_name into v_name from public.customers where id = new.customer_id;
  perform private.myra_push('reviews', '⭐ Nouvel avis : ' || new.rating || '/5',
    coalesce(v_name, 'Un client') || coalesce(' : « ' || left(nullif(trim(new.comment), ''), 140) || ' »', ''),
    './#/reviews', 'review-' || new.id, null);
  return null;
end $$;
drop trigger if exists trg_myra_push_review on public.order_reviews;
create trigger trg_myra_push_review after update of submitted_at on public.order_reviews
  for each row execute function private.myra_push_review();

-- 5. Stock qui passe sous le seuil d'alerte (une seule fois, au franchissement)
create or replace function private.myra_push_stock() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not new.is_active or coalesce(new.min_stock, 0) <= 0 then return null; end if;
  if not (old.stock_quantity > new.min_stock and new.stock_quantity <= new.min_stock) then return null; end if;
  perform private.myra_push('stock', case when new.stock_quantity <= 0 then '⛔ Rupture de stock' else '⚠️ Stock bas' end,
    new.name || ' : ' || trim(to_char(greatest(new.stock_quantity, 0), 'FM999990.##')) || coalesce(' ' || new.unit, '') || ' restant(s) (seuil ' || trim(to_char(new.min_stock, 'FM999990.##')) || ')',
    './#/products', 'stock-' || new.id, null);
  return null;
end $$;
drop trigger if exists trg_myra_push_stock on public.products;
create trigger trg_myra_push_stock after update of stock_quantity on public.products
  for each row execute function private.myra_push_stock();

notify pgrst, 'reload schema';
