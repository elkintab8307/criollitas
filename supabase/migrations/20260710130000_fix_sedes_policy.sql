-- Corrige sedes_admin_all: FOR ALL con WITH CHECK sobre id era circular para
-- INSERT (un id recién generado nunca coincide con la sede del JWT), lo que
-- bloqueaba cualquier creación vía RLS. La creación de sedes queda fuera de
-- RLS a propósito (la hará el super admin con service role en un bloque
-- posterior); el admin de la sede solo edita su propia sede (incluida la
-- desactivación con activa = false; nunca DELETE, ver CLAUDE.md §13.8).
drop policy if exists sedes_admin_all on public.sedes;

create policy sedes_admin_update on public.sedes
  for update to authenticated
  using (public.current_rol() = 'admin' and id = public.current_sede_id())
  with check (public.current_rol() = 'admin' and id = public.current_sede_id());

-- Advertencia estructural: por el REVOKE de columna sobre pin_hash, cualquier
-- SELECT * (o .select() sin columnas) sobre public.usuarios falla con
-- "permission denied for column pin_hash" para anon/authenticated.
comment on column public.usuarios.pin_hash is
  'Hash bcrypt del PIN. Columna con REVOKE SELECT para anon/authenticated: todo SELECT sobre usuarios debe listar columnas explícitas (nunca select *).';
