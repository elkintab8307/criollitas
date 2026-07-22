-- Bug real reportado por el usuario: subir/editar la imagen de un producto
-- desde el admin fallaba con "new row violates row-level security policy"
-- en storage.objects, pese a que el JWT del admin trae app_metadata.rol =
-- 'admin' correctamente (verificado con una subida directa a la API de
-- Storage, fuera de Next.js) y las políticas RLS normales de Postgres
-- (vía PostgREST, con public.current_rol()) sí evalúan ese mismo JWT bien.
-- Storage es un servicio aparte de PostgREST y no garantiza el mismo
-- contexto para funciones propias del esquema public -- se reescribe la
-- condición usando auth.jwt(), el helper oficial de Supabase que Storage sí
-- soporta de forma consistente (mismo patrón que sus propios ejemplos de
-- políticas de Storage).
drop policy if exists menu_admin_insert on storage.objects;
drop policy if exists menu_admin_update on storage.objects;
drop policy if exists menu_admin_delete on storage.objects;

create policy menu_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'menu' and (auth.jwt() -> 'app_metadata' ->> 'rol') = 'admin');
create policy menu_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'menu' and (auth.jwt() -> 'app_metadata' ->> 'rol') = 'admin')
  with check (bucket_id = 'menu' and (auth.jwt() -> 'app_metadata' ->> 'rol') = 'admin');
create policy menu_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'menu' and (auth.jwt() -> 'app_metadata' ->> 'rol') = 'admin');
