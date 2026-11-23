-- Myra Business Manager V24
-- Suppression transactionnelle des ventes et commandes avec régularisation
-- du stock, de la caisse et des points de fidélité.
-- À exécuter une seule fois dans Supabase SQL Editor sur le projet LSM Manager.

create or replace function public.prevent_edit_confirmed_sale_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale_id uuid;
  v_status text;
begin
  v_sale_id := coalesce(new.sale_id, old.sale_id);
  select status into v_status from public.sales where id = v_sale_id for update;

  if tg_op = 'DELETE'
     and current_setting('myra.allow_confirmed_sale_item_delete', true) = 'on'
     and private.current_staff_role() = 'owner' then
    return old;
  end if;

  if v_status is distinct from 'draft' then
    raise exception 'Les articles d’une vente confirmée ne peuvent plus être modifiés.';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.delete_sale_with_reconciliation(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_sale public.sales%rowtype;
  v_stock_rows integer := 0;
  v_payment_rows integer := 0;
  v_cash_rows integer := 0;
  v_loyalty_points bigint := 0;
  v_customer_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentification requise';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_user_id and p.is_active = true;

  if v_role is distinct from 'owner' then
    raise exception 'Seul le Super Administrateur peut supprimer une vente avec régularisation';
  end if;

  select * into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'Vente introuvable';
  end if;

  v_customer_id := v_sale.customer_id;

  -- Bloquer la suppression si les points issus de cette vente ont déjà été dépensés.
  if v_customer_id is not null then
    select coalesce(sum(lt.points), 0)::bigint
      into v_loyalty_points
    from public.loyalty_transactions lt
    where lt.sale_id = p_sale_id and lt.transaction_type = 'earn';

    if v_loyalty_points > 0 then
      perform 1 from public.loyalty_accounts la
      where la.customer_id = v_customer_id
      for update;

      if coalesce((select la.points_balance from public.loyalty_accounts la where la.customer_id=v_customer_id),0) < v_loyalty_points then
        raise exception 'Suppression impossible : des points fidélité gagnés sur cette vente ont déjà été utilisés. Régularisez d’abord le compte fidélité.';
      end if;
    end if;
  end if;

  -- Réintégrer les quantités tracées dans les mouvements de sortie de cette vente.
  with sold as (
    select pm.product_id, sum(pm.quantity) as quantity
    from public.product_movements pm
    where pm.reference_type = 'sale'
      and pm.reference_id = p_sale_id
      and pm.movement_type = 'sale'
    group by pm.product_id
  )
  update public.products p
  set stock_quantity = p.stock_quantity + sold.quantity,
      updated_at = now()
  from sold
  where p.id = sold.product_id;

  get diagnostics v_stock_rows = row_count;

  -- Corriger les soldes des caisses avant de supprimer les écritures concernées.
  with linked_payments as (
    select p.id from public.payments p where p.sale_id = p_sale_id
  ),
  affected_cash as (
    select ct.cash_account_id,
           sum(case when ct.direction = 'in' then ct.amount
                    when ct.direction = 'out' then -ct.amount
                    else 0 end) as net_amount
    from public.cash_transactions ct
    where (ct.source_type = 'payment' and ct.source_id in (select id from linked_payments))
       or (ct.source_type = 'sale' and ct.source_id = p_sale_id)
    group by ct.cash_account_id
  )
  update public.cash_accounts ca
  set current_balance = ca.current_balance - affected_cash.net_amount
  from affected_cash
  where ca.id = affected_cash.cash_account_id;

  delete from public.cash_transactions ct
  where (ct.source_type = 'payment'
         and ct.source_id in (select p.id from public.payments p where p.sale_id = p_sale_id))
     or (ct.source_type = 'sale' and ct.source_id = p_sale_id);
  get diagnostics v_cash_rows = row_count;

  -- Régulariser les points fidélité gagnés sur les paiements de cette vente.
  if v_customer_id is not null and v_loyalty_points > 0 then
    update public.loyalty_accounts la
    set points_balance = la.points_balance - v_loyalty_points,
        lifetime_points_earned = greatest(0, la.lifetime_points_earned - v_loyalty_points),
        amount_carry = coalesce((
          select mod(coalesce(sum(p.amount),0),1000)
          from public.payments p
          join public.sales s on s.id = p.sale_id
          where s.customer_id = v_customer_id
            and p.direction = 'incoming'
            and p.sale_id <> p_sale_id
        ),0),
        updated_at = now()
    where la.customer_id = v_customer_id;
  end if;

  delete from public.loyalty_transactions
  where sale_id = p_sale_id
     or payment_id in (select p.id from public.payments p where p.sale_id = p_sale_id);

  delete from public.product_movements
  where reference_type = 'sale' and reference_id = p_sale_id;

  delete from public.payments where sale_id = p_sale_id;
  get diagnostics v_payment_rows = row_count;

  -- Autorisation temporaire et limitée à cette transaction pour la cascade.
  perform set_config('myra.allow_confirmed_sale_item_delete', 'on', true);
  delete from public.sales where id = p_sale_id;

  return jsonb_build_object(
    'success', true,
    'sale_id', p_sale_id,
    'sale_number', v_sale.sale_number,
    'stock_products_restored', v_stock_rows,
    'payments_deleted', v_payment_rows,
    'cash_transactions_deleted', v_cash_rows,
    'loyalty_points_reversed', v_loyalty_points
  );
end;
$$;

create or replace function public.delete_customer_order_with_reconciliation(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_order public.customer_orders%rowtype;
  v_sale_id uuid;
  v_sale_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentification requise';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_user_id and p.is_active = true;

  if v_role is distinct from 'owner' then
    raise exception 'Seul le Super Administrateur peut supprimer une commande';
  end if;

  select * into v_order
  from public.customer_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Commande introuvable';
  end if;

  select s.id into v_sale_id
  from public.sales s
  where s.order_id = p_order_id
     or s.id = v_order.converted_sale_id
  order by s.created_at desc
  limit 1
  for update;

  if v_sale_id is not null then
    v_sale_result := public.delete_sale_with_reconciliation(v_sale_id);
  end if;

  delete from public.customer_orders where id = p_order_id;

  return jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'order_number', v_order.order_number,
    'linked_sale_deleted', v_sale_id is not null,
    'sale_result', v_sale_result
  );
end;
$$;

revoke all on function public.delete_sale_with_reconciliation(uuid) from public, anon;
revoke all on function public.delete_customer_order_with_reconciliation(uuid) from public, anon;
grant execute on function public.delete_sale_with_reconciliation(uuid) to authenticated;
grant execute on function public.delete_customer_order_with_reconciliation(uuid) to authenticated;
