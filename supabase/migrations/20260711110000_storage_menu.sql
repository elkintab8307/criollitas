insert into storage.buckets (id, name, public)
values ('menu', 'menu', true)
on conflict (id) do nothing;

-- Lectura pública implícita por bucket public=true. Escritura solo admin:
create policy menu_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'menu' and public.current_rol() = 'admin');
create policy menu_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'menu' and public.current_rol() = 'admin')
  with check (bucket_id = 'menu' and public.current_rol() = 'admin');
create policy menu_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'menu' and public.current_rol() = 'admin');
