-- Myra Business Manager v8 : liaison des promotions aux ventes
alter table public.sales add column if not exists promotion_code text;

create or replace function public.consume_sale_promotion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare p public.promo_campaigns%rowtype;
begin
  if new.status = 'confirmed'
     and old.status is distinct from 'confirmed'
     and nullif(trim(new.promotion_code), '') is not null then
    select * into p
    from public.promo_campaigns
    where code = upper(trim(new.promotion_code))
    for update;

    if not found then raise exception 'Code promotionnel introuvable.'; end if;
    if not p.is_active
       or (p.starts_at is not null and p.starts_at > now())
       or (p.ends_at is not null and p.ends_at < now()) then
      raise exception 'Cette promotion n’est plus active.';
    end if;
    if p.max_uses is not null and p.uses_count >= p.max_uses then
      raise exception 'Le nombre maximal d’utilisations de cette promotion est atteint.';
    end if;
    if new.subtotal < p.min_order_amount then
      raise exception 'Le montant minimum requis pour cette promotion n’est pas atteint.';
    end if;

    update public.promo_campaigns
    set uses_count = uses_count + 1, updated_at = now()
    where id = p.id;
  end if;
  return new;
end;
$$;

revoke all on function public.consume_sale_promotion() from public, anon, authenticated;
drop trigger if exists trg_consume_sale_promotion on public.sales;
create trigger trg_consume_sale_promotion
before update of status on public.sales
for each row execute function public.consume_sale_promotion();

-- Autorise les commerciaux à lire les codes, sans leur donner le droit de les administrer.
drop policy if exists promo_campaigns_staff_read on public.promo_campaigns;
create policy promo_campaigns_staff_read
on public.promo_campaigns for select to authenticated
using (private.current_staff_role() in ('owner','admin','manager','sales'));
