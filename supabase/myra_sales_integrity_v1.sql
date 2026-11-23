-- Vérifie les montants et lignes avant confirmation d'une vente.
create or replace function public.validate_sale_before_confirmation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_items_subtotal numeric(14,2); v_item_count integer;
begin
  if old.status = 'draft' and new.status in ('confirmed','partially_paid','paid') then
    select coalesce(sum(line_total),0), count(*) into v_items_subtotal,v_item_count
    from public.sale_items where sale_id=new.id;
    if v_item_count=0 then raise exception 'Une vente doit contenir au moins un article.'; end if;
    if new.subtotal<=0 or new.discount<0 or new.discount>new.subtotal then raise exception 'Montants de vente invalides.'; end if;
    if abs(v_items_subtotal-new.subtotal)>0.01 then raise exception 'Le sous-total ne correspond pas aux lignes de vente.'; end if;
    if abs((new.subtotal-new.discount)-new.total)>0.01 or new.total<=0 then raise exception 'Le total ne correspond pas au sous-total moins les remises.'; end if;
    if new.amount_paid<0 or new.amount_paid>new.total then raise exception 'Montant déjà encaissé invalide.'; end if;
  end if;
  return new;
end; $$;
revoke all on function public.validate_sale_before_confirmation() from public,anon,authenticated;
drop trigger if exists trg_validate_sale_before_confirmation on public.sales;
create trigger trg_validate_sale_before_confirmation before update of status on public.sales
for each row execute function public.validate_sale_before_confirmation();

-- Verrouille les lignes d'une vente dès qu'elle quitte le statut brouillon.
create or replace function public.prevent_edit_confirmed_sale_items()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_sale_id uuid; v_status text;
begin
  if tg_op='DELETE' then v_sale_id:=old.sale_id; else v_sale_id:=new.sale_id; end if;
  select status into v_status from public.sales where id=v_sale_id for update;
  if v_status is distinct from 'draft' then raise exception 'Les articles d’une vente confirmée ne peuvent plus être modifiés.'; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;
revoke all on function public.prevent_edit_confirmed_sale_items() from public,anon,authenticated;
drop trigger if exists trg_prevent_edit_confirmed_sale_items on public.sale_items;
create trigger trg_prevent_edit_confirmed_sale_items before insert or update or delete on public.sale_items
for each row execute function public.prevent_edit_confirmed_sale_items();
