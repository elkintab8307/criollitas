-- Causa raíz real del bug reportado ("no pudimos subir la imagen" al
-- editar un producto): storage.objects nunca tuvo una política de SELECT.
-- El comentario original de 20260711110000 asumía que "bucket público"
-- alcanzaba para todo, pero eso solo habilita la ruta pública de DESCARGA
-- de archivos (/storage/v1/object/public/...) -- no una política de SELECT
-- sobre la tabla storage.objects. La subida de imagen usa upsert (`{
-- upsert: true }` en subirImagenProducto, para reemplazar la imagen de un
-- producto ya existente): el upsert necesita comprobar internamente si el
-- objeto ya existe, y esa comprobación es un SELECT sujeto a RLS -- sin
-- política, esa comprobación no ve ninguna fila y Storage responde "new
-- row violates row-level security policy" (mensaje engañoso: el problema
-- real era el SELECT faltante, no el INSERT/UPDATE, que sí funcionaban
-- para un archivo nuevo sin upsert -- verificado subiendo directo a la API
-- de Storage con y sin el header x-upsert).
--
-- Se vuelve a public.current_rol() (en vez de auth.jwt(), probado como
-- intermedio durante el diagnóstico) para mantener el mismo patrón que el
-- resto de políticas del proyecto.
drop policy if exists menu_admin_insert on storage.objects;
drop policy if exists menu_admin_update on storage.objects;
drop policy if exists menu_admin_delete on storage.objects;
drop policy if exists menu_public_select on storage.objects;

create policy menu_public_select on storage.objects
  for select to public
  using (bucket_id = 'menu');

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
