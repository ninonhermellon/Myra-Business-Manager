-- Myra Business Manager v24: commandes clients autonomes.
-- Migration déjà appliquée au projet Supabase connecté.
create table if not exists public.customer_orders (
 id uuid primary key default gen_random_uuid(), order_number text not null unique,
 customer_id uuid references public.customers(id) on delete set null,
 order_date timestamptz not null default now(), requested_delivery_at timestamptz,
 delivery_address text, delivery_zone text, delivery_fee numeric(14,2) not null default 0 check (delivery_fee >= 0),
 subtotal numeric(14,2) not null default 0 check (subtotal >= 0), discount numeric(14,2) not null default 0 check (discount >= 0),
 total numeric(14,2) not null default 0 check (total >= 0),
 status text not null default 'draft' check (status in ('draft','confirmed','processing','ready','out_for_delivery','delivered','cancelled','converted')),
 notes text, created_by uuid references auth.users(id) on delete set null,
 converted_sale_id uuid references public.sales(id) on delete set null, device_id text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.customer_order_items (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.customer_orders(id) on delete cascade,
 product_id uuid not null references public.products(id) on delete restrict, product_name text not null, unit text,
 quantity numeric(14,3) not null check (quantity > 0), unit_price numeric(14,2) not null check (unit_price >= 0),
 line_total numeric(14,2) not null check (line_total >= 0), created_at timestamptz not null default now()
);
alter table public.sales add column if not exists order_id uuid references public.customer_orders(id) on delete set null;
alter table public.sales add column if not exists shipping_fee numeric(14,2) not null default 0 check (shipping_fee >= 0);
create unique index if not exists sales_order_id_unique on public.sales(order_id) where order_id is not null;
create index if not exists customer_orders_created_at_idx on public.customer_orders(created_at desc);
create index if not exists customer_orders_status_idx on public.customer_orders(status);
create index if not exists customer_order_items_order_id_idx on public.customer_order_items(order_id);
alter table public.customer_orders enable row level security;
alter table public.customer_order_items enable row level security;
drop policy if exists customer_orders_staff_access on public.customer_orders;
create policy customer_orders_staff_access on public.customer_orders for all to authenticated using (private.current_staff_role() = any(array['owner','admin','manager','sales'])) with check (private.current_staff_role() = any(array['owner','admin','manager','sales']));
drop policy if exists customer_order_items_staff_access on public.customer_order_items;
create policy customer_order_items_staff_access on public.customer_order_items for all to authenticated using (private.current_staff_role() = any(array['owner','admin','manager','sales'])) with check (private.current_staff_role() = any(array['owner','admin','manager','sales']));
grant select,insert,update,delete on public.customer_orders,public.customer_order_items to authenticated;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.customer_orders'::regclass and conname='customer_orders_total_consistency') then
  alter table public.customer_orders add constraint customer_orders_total_consistency check (abs(total-(subtotal-discount+delivery_fee)) <= 0.01);
 end if;
end $$;
create or replace function public.validate_sale_before_confirmation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_items_subtotal numeric(14,2); v_item_count integer;
begin
 if old.status='draft' and new.status in ('confirmed','partially_paid','paid') then
  select coalesce(sum(line_total),0),count(*) into v_items_subtotal,v_item_count from public.sale_items where sale_id=new.id;
  if v_item_count=0 then raise exception 'Une vente doit contenir au moins un article.'; end if;
  if new.subtotal<=0 or new.discount<0 or new.discount>new.subtotal or new.shipping_fee<0 then raise exception 'Montants de vente invalides.'; end if;
  if abs(v_items_subtotal-new.subtotal)>0.01 then raise exception 'Le sous-total ne correspond pas aux lignes de vente.'; end if;
  if abs((new.subtotal-new.discount+new.shipping_fee)-new.total)>0.01 or new.total<=0 then raise exception 'Le total ne correspond pas au sous-total, à la remise et à la livraison.'; end if;
  if new.amount_paid<0 or new.amount_paid>new.total then raise exception 'Montant déjà encaissé invalide.'; end if;
 end if;
 return new;
end; $$;
revoke all on function public.validate_sale_before_confirmation() from public,anon,authenticated;
create or replace function public.convert_customer_order_to_sale(p_order_id uuid)
returns uuid language plpgsql security invoker set search_path=public,private as $$
declare o public.customer_orders%rowtype; v_sale_id uuid; v_role text;
begin
 v_role:=private.current_staff_role(); if v_role not in ('owner','admin','manager','sales') then raise exception 'Accès refusé'; end if;
 select * into o from public.customer_orders where id=p_order_id for update;
 if not found then raise exception 'Commande introuvable'; end if;
 if o.converted_sale_id is not null then return o.converted_sale_id; end if;
 if o.status in ('cancelled','draft') then raise exception 'Confirmez la commande avant de la convertir en vente'; end if;
 if not exists(select 1 from public.customer_order_items where order_id=o.id) then raise exception 'La commande ne contient aucun article'; end if;
 insert into public.sales(sale_number,customer_id,sale_date,status,subtotal,discount,total,amount_paid,notes,created_by,order_id,shipping_fee)
 values ('VTE-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),o.customer_id,now(),'draft',o.subtotal,o.discount,o.total,0,concat_ws(E'\n',o.notes,'Commande source : '||o.order_number,'Livraison : '||coalesce(o.delivery_address,'')),auth.uid(),o.id,o.delivery_fee)
 returning id into v_sale_id;
 insert into public.sale_items(sale_id,product_id,quantity,unit_price,discount,line_total) select v_sale_id,product_id,quantity,unit_price,0,line_total from public.customer_order_items where order_id=o.id;
 update public.customer_orders set status='converted',converted_sale_id=v_sale_id,updated_at=now() where id=o.id;
 return v_sale_id;
end $$;
revoke all on function public.convert_customer_order_to_sale(uuid) from public,anon;
grant execute on function public.convert_customer_order_to_sale(uuid) to authenticated;
