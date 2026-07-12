-- Seed inicial (documental).
-- No hay entorno local con Docker en este proyecto todavia, asi que este
-- archivo describe el seed que se aplico manualmente contra el proyecto
-- cloud (btiejgeljpwsqwckuocs) via Management API. Sirve como referencia
-- para futuros entornos locales (`supabase db reset` lo ejecuta solo).
--
-- Requisito previo: el usuario auth debe existir (creado via Admin API,
-- ver README / task-7-report.md), porque el INSERT de abajo hace SELECT
-- sobre auth.users por email.

insert into public.sedes (id, nombre, direccion, telefono)
values ('00000000-0000-4000-8000-000000000001', 'Criollitas Armenia', 'Armenia, Quindío', '3212127100')
on conflict (id) do nothing;

insert into public.usuarios (id, sede_id, nombre, rol, pin_hash, activo)
select u.id, '00000000-0000-4000-8000-000000000001', 'Jonathan (Admin)', 'admin',
       null, true
from auth.users u where u.email = 'jonathantabares@gmail.com'
on conflict (id) do nothing;

-- Copiar rol/sede al JWT metadata. Van a app_metadata (no user_metadata):
-- solo el service role puede escribirlo, el propio usuario no puede
-- autopromoverse (ver migración 20260712120000_auth_app_metadata.sql).
-- `nombre` sí queda en user_metadata: es solo display, no autorización.
update auth.users u
set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('rol', 'admin', 'sede_id', '00000000-0000-4000-8000-000000000001'),
    raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object('nombre', 'Jonathan (Admin)')
where u.email = 'jonathantabares@gmail.com';

-- El pin_hash se setea en Task 9 Step 5 (bcrypt del PIN de prueba 2468),
-- cuando exista el helper de hashing.
