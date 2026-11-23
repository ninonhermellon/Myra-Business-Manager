-- Portefeuille fidélité Myra : 1 point par tranche cumulée de 1 000 FCFA encaissés.
create table if not exists public.loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references public.customers(id) on delete cascade,
  points_balance bigint not null default 0 check (points_balance >= 0),
  lifetime_points_earned bigint not null default 0 check (lifetime_points_earned >= 0),
  amount_carry numeric(14,2) not null default 0 check (amount_carry >= 0 and amount_carry < 1000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  payment_id uuid unique references public.payments(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  transaction_type text not null check (transaction_type in ('earn','redeem','adjustment')),
  points bigint not null, amount_basis numeric(14,2), description text,
  created_at timestamptz not null default now()
);
create index if not exists loyalty_transactions_customer_created_idx on public.loyalty_transactions(customer_id, created_at desc);
alter table public.loyalty_accounts enable row level security;
alter table public.loyalty_transactions enable row level security;
revoke all on public.loyalty_accounts, public.loyalty_transactions from anon, authenticated;
grant select on public.loyalty_accounts, public.loyalty_transactions to authenticated;
create policy loyalty_accounts_staff_read on public.loyalty_accounts for select to authenticated using ((select private.current_staff_role()) in ('owner','admin','manager','sales','stock_manager','accountant'));
create policy loyalty_transactions_staff_read on public.loyalty_transactions for select to authenticated using ((select private.current_staff_role()) in ('owner','admin','manager','sales','accountant'));
create or replace function public.award_loyalty_points_from_payment() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_customer_id uuid; v_sale_status text; v_old_carry numeric(14,2); v_new_carry numeric(14,2); v_points bigint;
begin
 if new.direction <> 'incoming' or new.sale_id is null or new.amount <= 0 then return new; end if;
 select s.customer_id,s.status into v_customer_id,v_sale_status from public.sales s where s.id=new.sale_id;
 if v_customer_id is null or v_sale_status in ('draft','cancelled') then return new; end if;
 insert into public.loyalty_accounts(customer_id) values(v_customer_id) on conflict(customer_id) do nothing;
 select amount_carry into v_old_carry from public.loyalty_accounts where customer_id=v_customer_id for update;
 v_points:=floor((coalesce(v_old_carry,0)+new.amount)/1000);
 v_new_carry:=mod(coalesce(v_old_carry,0)+new.amount,1000);
 update public.loyalty_accounts set points_balance=points_balance+v_points,lifetime_points_earned=lifetime_points_earned+v_points,amount_carry=v_new_carry,updated_at=now() where customer_id=v_customer_id;
 if v_points>0 then insert into public.loyalty_transactions(customer_id,payment_id,sale_id,transaction_type,points,amount_basis,description) values(v_customer_id,new.id,new.sale_id,'earn',v_points,new.amount,'1 point par tranche cumulée de 1 000 FCFA encaissés'); end if;
 return new;
end; $$;
revoke all on function public.award_loyalty_points_from_payment() from public,anon,authenticated;
drop trigger if exists trg_award_loyalty_points_from_payment on public.payments;
create trigger trg_award_loyalty_points_from_payment after insert on public.payments for each row execute function public.award_loyalty_points_from_payment();
