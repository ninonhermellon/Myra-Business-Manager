-- Migration already applied to Supabase project fvpvfmlmszcoyhjlgago
alter table public.profiles add column if not exists avatar_url text;

drop policy if exists profile_select_self on public.profiles;
create policy profile_select_self on public.profiles for select to authenticated using (id = (select auth.uid()));
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('myra-avatars', 'myra-avatars', true, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/png','image/jpeg','image/webp'];

drop policy if exists myra_avatar_public_read on storage.objects;
create policy myra_avatar_public_read on storage.objects for select to public using (bucket_id = 'myra-avatars');
drop policy if exists myra_avatar_user_upload on storage.objects;
create policy myra_avatar_user_upload on storage.objects for insert to authenticated with check (bucket_id = 'myra-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists myra_avatar_user_update on storage.objects;
create policy myra_avatar_user_update on storage.objects for update to authenticated using (bucket_id = 'myra-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'myra-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists myra_avatar_user_delete on storage.objects;
create policy myra_avatar_user_delete on storage.objects for delete to authenticated using (bucket_id = 'myra-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Column-level protection: profile users can edit personal fields only.
revoke update on table public.profiles from authenticated;
grant update (full_name, phone, avatar_url, updated_at) on table public.profiles to authenticated;
