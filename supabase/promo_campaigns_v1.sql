-- Myra Business Manager : campagnes promotionnelles
create table if not exists public.promo_campaigns (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 code text not null unique,
 description text,
 discount_type text not null check (discount_type in ('fixed','percent')),
 discount_value numeric(12,2) not null check (discount_value > 0),
 min_order_amount numeric(12,2) not null default 0 check (min_order_amount >= 0),
 max_uses integer check (max_uses is null or max_uses > 0),
 uses_count integer not null default 0 check (uses_count >= 0),
 starts_at timestamptz,
 ends_at timestamptz,
 is_active boolean not null default true,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint promo_dates_valid check (ends_at is null or starts_at is null or ends_at > starts_at)
);
alter table public.promo_campaigns enable row level security;
grant select, insert, update, delete on public.promo_campaigns to authenticated;
drop policy if exists promo_campaigns_staff_access on public.promo_campaigns;
create policy promo_campaigns_staff_access on public.promo_campaigns
for all to authenticated
using (private.current_staff_role() in ('owner','admin','manager'))
with check (private.current_staff_role() in ('owner','admin','manager'));
create index if not exists promo_campaigns_active_dates_idx on public.promo_campaigns(is_active, starts_at, ends_at);
