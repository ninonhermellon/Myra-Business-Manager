-- ============================================================================
-- Myra Business Manager V38 — Équipe et accès
-- • Tout nouveau compte reçoit automatiquement une fiche (rôle « employé », EN ATTENTE d'activation).
-- • Le propriétaire / un administrateur active, désactive et change les rôles depuis l'application.
-- Garde-fous : un administrateur ne touche pas au propriétaire, personne ne modifie ses propres droits,
-- il reste toujours au moins un propriétaire actif. Ajouts uniquement, rejouable.
-- ============================================================================

-- 1. Fiche automatique à la création d'un compte (inactif tant que la direction ne l'a pas activé)
create or replace function private.myra_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_name text := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), initcap(replace(split_part(coalesce(new.email, ''), '@', 1), '.', ' ')));
begin
  insert into public.profiles (id, full_name, email, role, is_active)
  values (new.id, left(coalesce(nullif(v_name, ''), 'Nouveau membre'), 120), new.email,
          case when (new.raw_app_meta_data->>'myra_role') in ('admin','manager','sales','stock_manager','accountant','employee') then new.raw_app_meta_data->>'myra_role' else 'employee' end,
          coalesce((new.raw_app_meta_data->>'myra_active')::boolean, false))
  on conflict (id) do nothing;
  if not coalesce((new.raw_app_meta_data->>'myra_active')::boolean, false) then
    perform private.myra_push('team', '👤 Nouveau compte à activer', coalesce(v_name, '') || ' · ' || coalesce(new.email, '') || E'\nParamètres › Équipe et accès', './#/settings', 'team-' || new.id, null);
  end if;
  return new;
exception when others then
  raise warning 'Fiche d''équipe non créée : %', sqlerrm; return new;
end $$;
drop trigger if exists trg_myra_new_auth_user on auth.users;
create trigger trg_myra_new_auth_user after insert on auth.users for each row execute function private.myra_new_auth_user();

-- Comptes déjà créés sans fiche : rattachés en attente d'activation
insert into public.profiles (id, full_name, email, role, is_active)
select u.id, initcap(replace(split_part(coalesce(u.email, ''), '@', 1), '.', ' ')), u.email, 'employee', false
  from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- 2. Liste de l'équipe (direction uniquement)
create or replace function public.get_team_accounts()
returns table(id uuid, full_name text, email text, phone text, role text, is_active boolean, created_at timestamptz, last_sign_in_at timestamptz, avatar_url text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.current_staff_role() not in ('owner', 'admin') then raise exception 'Réservé au propriétaire et aux administrateurs.'; end if;
  return query select p.id, p.full_name, coalesce(u.email, p.email), p.phone, p.role, p.is_active, coalesce(u.created_at, p.created_at), u.last_sign_in_at, p.avatar_url
    from public.profiles p left join auth.users u on u.id = p.id
   order by p.is_active, case p.role when 'owner' then 0 when 'admin' then 1 when 'manager' then 2 else 3 end, p.full_name;
end $$;
revoke all on function public.get_team_accounts() from public, anon;
grant execute on function public.get_team_accounts() to authenticated;

-- 3. Modifier un membre (rôle, activation, nom)
create or replace function public.set_team_member(p_user uuid, p_role text, p_active boolean, p_name text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_me text := private.current_staff_role(); t public.profiles%rowtype;
begin
  if v_me not in ('owner', 'admin') then raise exception 'Réservé au propriétaire et aux administrateurs.'; end if;
  if p_user = auth.uid() then raise exception 'Vous ne pouvez pas modifier vos propres droits.'; end if;
  if p_role not in ('owner','admin','manager','sales','stock_manager','accountant','employee') then raise exception 'Rôle inconnu.'; end if;
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
revoke all on function public.set_team_member(uuid, text, boolean, text) from public, anon;
grant execute on function public.set_team_member(uuid, text, boolean, text) to authenticated;

notify pgrst, 'reload schema';
