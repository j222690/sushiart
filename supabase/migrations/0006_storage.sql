-- =============================================================================
-- Storage: bucket das fotos do cardápio.
--
-- Público para leitura (a foto do prato precisa abrir no app sem login) e
-- gravável apenas pela equipe. Sem a policy de escrita, qualquer cliente
-- logado poderia subir arquivo no bucket do restaurante.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu', 'menu', true,
  5242880,  -- 5 MB, o mesmo limite validado no front (api.js → uploadImage)
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists menu_public_read on storage.objects;
create policy menu_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'menu');

drop policy if exists menu_staff_insert on storage.objects;
create policy menu_staff_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'menu' and is_staff());

drop policy if exists menu_staff_update on storage.objects;
create policy menu_staff_update on storage.objects
  for update to authenticated
  using (bucket_id = 'menu' and is_staff())
  with check (bucket_id = 'menu' and is_staff());

drop policy if exists menu_staff_delete on storage.objects;
create policy menu_staff_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'menu' and is_staff());
