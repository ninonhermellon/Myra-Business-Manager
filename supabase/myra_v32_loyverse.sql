-- Myra Business Manager V32 — socle d'intégration Loyverse bidirectionnelle
-- Non destructif : ajoute uniquement les tables/index/policies dédiés.
-- Myra est maître des données commerciales : les événements externes sont mis en quarantaine
-- dans une inbox et ne modifient jamais directement les ventes, finances ou stocks.

create extension if not exists pgcrypto;

create table if not exists public.loyverse_sync_settings (
  id uuid primary key default gen_random_uuid(),
  enabled boolean not null default false,
  conflict_policy text not null default 'myra_wins' check (conflict_policy = 'myra_wins'),
  sync_items boolean not null default true,
  sync_customers boolean not null default true,
  sync_receipts boolean not null default true,
  sync_inventory boolean not null default true,
  last_pull_at timestamptz,
  last_push_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loyverse_id_map (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('item','customer','receipt','category','inventory')),
  myra_id text not null,
  loyverse_id text not null,
  store_id text,
  source text not null default 'myra' check (source in ('myra','loyverse','manual')),
  myra_updated_at timestamptz,
  loyverse_updated_at timestamptz,
  sync_state text not null default 'linked' check (sync_state in ('linked','pending','conflict','error','ignored')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(entity_type,myra_id),
  unique(entity_type,loyverse_id,store_id)
);

create table if not exists public.loyverse_event_inbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text not null,
  merchant_id text,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received','processing','processed','ignored','error')),
  attempts integer not null default 0,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.loyverse_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('myra_to_loyverse','loyverse_to_myra')),
  entity_type text not null check (entity_type in ('item','customer','receipt','inventory','category')),
  local_id text,
  external_id text,
  idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','done','conflict','error','ignored')),
  attempts integer not null default 0,
  next_retry_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists loyverse_inbox_status_idx on public.loyverse_event_inbox(status,received_at);
create index if not exists loyverse_jobs_status_idx on public.loyverse_sync_jobs(status,next_retry_at);
create index if not exists loyverse_jobs_entity_idx on public.loyverse_sync_jobs(entity_type,direction,created_at);

alter table public.loyverse_sync_settings enable row level security;
alter table public.loyverse_id_map enable row level security;
alter table public.loyverse_event_inbox enable row level security;
alter table public.loyverse_sync_jobs enable row level security;

-- Les tables de synchronisation sont volontairement inaccessibles directement au navigateur.
-- Seules les Edge Functions utilisant la clé service_role peuvent les manipuler.
drop policy if exists "loyverse settings admin read" on public.loyverse_sync_settings;
drop policy if exists "loyverse settings admin write" on public.loyverse_sync_settings;
drop policy if exists "loyverse mapping admin read" on public.loyverse_id_map;
drop policy if exists "loyverse inbox admin read" on public.loyverse_event_inbox;
drop policy if exists "loyverse jobs admin read" on public.loyverse_sync_jobs;

comment on table public.loyverse_sync_settings is 'Configuration du connecteur Loyverse. Politique Myra prioritaire.';
comment on table public.loyverse_id_map is 'Correspondance stable des identifiants Myra et Loyverse.';
comment on table public.loyverse_event_inbox is 'Boîte de réception idempotente des webhooks Loyverse. Aucune mutation métier automatique.';
comment on table public.loyverse_sync_jobs is 'File de synchronisation traçable et rejouable.';
