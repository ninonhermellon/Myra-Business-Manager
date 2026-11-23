-- Myra Business Manager V27 — photos des produits
-- À exécuter une seule fois dans Supabase > SQL Editor.
alter table public.products add column if not exists image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('myra-products', 'myra-products', true, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152,
  allowed_mime_types = array['image/png','image/jpeg','image/webp'];

-- Lecture publique des photos (affichage dans l'application et sur les factures)
drop policy if exists "myra_products_public_read" on storage.objects;
create policy "myra_products_public_read" on storage.objects
  for select using (bucket_id = 'myra-products');

-- Envoi / remplacement / suppression : utilisateurs connectés, dans leur propre dossier
drop policy if exists "myra_products_staff_insert" on storage.objects;
create policy "myra_products_staff_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'myra-products' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "myra_products_staff_update" on storage.objects;
create policy "myra_products_staff_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'myra-products' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "myra_products_staff_delete" on storage.objects;
create policy "myra_products_staff_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'myra-products' and (storage.foldername(name))[1] = auth.uid()::text);
