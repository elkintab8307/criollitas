-- Bloque 8: auditoría automática sobre tablas financieras/sensibles +
-- flujo de anulación de pedidos ya cobrados. Alcance del trigger acotado
-- a pedidos/pagos/turnos_caja/movimientos_caja/anulaciones/usuarios
-- (decisión confirmada con el usuario) — el resto de tablas operativas
-- (mesas, productos, categorías, modificadores) ya tienen soft-delete y
-- se instrumentan más adelante si hace falta.
create table public.auditoria (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid references public.sedes (id),
  usuario_id uuid references public.usuarios (id),
  accion text not null,
  tabla text not null,
  registro_id uuid not null,
  diff_json jsonb not null,
  creado_en timestamptz not null default now()
);

create table public.anulaciones (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos (id),
  usuario_id uuid not null references public.usuarios (id),
  motivo text not null,
  creado_en timestamptz not null default now()
);

alter table public.auditoria enable row level security;
alter table public.anulaciones enable row level security;

-- auditoria: nadie inserta directo (solo el trigger, vía security
-- definer, que no pasa por RLS). Admin SELECT sobre su sede.
create policy auditoria_admin_select on public.auditoria
  for select to authenticated
  using (public.current_rol() = 'admin' and sede_id = public.current_sede_id());

-- anulaciones: admin INSERT/SELECT sobre pedidos de su sede.
create policy anulaciones_admin_insert on public.anulaciones
  for insert to authenticated
  with check (exists (
    select 1 from public.pedidos p where p.id = pedido_id
      and public.current_rol() = 'admin' and p.sede_id = public.current_sede_id()
  ));

create policy anulaciones_admin_select on public.anulaciones
  for select to authenticated
  using (exists (
    select 1 from public.pedidos p where p.id = pedido_id
      and public.current_rol() = 'admin' and p.sede_id = public.current_sede_id()
  ));

-- Trigger genérico de auditoría. security definer: debe poder escribir en
-- auditoria sin importar qué rol disparó la operación instrumentada (ej.
-- una vendedora insertando un pedido no tiene, ni debe tener, INSERT
-- directo sobre auditoria — la escritura es consecuencia automática de la
-- operación, no algo que el cliente pide). auth.uid() sigue devolviendo
-- el usuario real que disparó la operación (no el dueño de la función),
-- así que usuario_id queda correcto.
create or replace function public.pg_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registro_id uuid;
  v_sede_id uuid;
  v_diff jsonb;
begin
  v_registro_id := coalesce(new.id, old.id);
  v_diff := jsonb_build_object(
    'before', case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    'after', case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  begin
    v_sede_id := (coalesce(to_jsonb(new), to_jsonb(old)) ->> 'sede_id')::uuid;
  exception when others then
    v_sede_id := null;
  end;

  insert into public.auditoria (sede_id, usuario_id, accion, tabla, registro_id, diff_json)
  values (v_sede_id, auth.uid(), TG_OP, TG_TABLE_NAME, v_registro_id, v_diff);

  return coalesce(new, old);
end;
$$;

create trigger pg_audit_trigger_pedidos
  after insert or update or delete on public.pedidos
  for each row execute function public.pg_audit_trigger();

create trigger pg_audit_trigger_pagos
  after insert or update or delete on public.pagos
  for each row execute function public.pg_audit_trigger();

create trigger pg_audit_trigger_turnos_caja
  after insert or update or delete on public.turnos_caja
  for each row execute function public.pg_audit_trigger();

create trigger pg_audit_trigger_movimientos_caja
  after insert or update or delete on public.movimientos_caja
  for each row execute function public.pg_audit_trigger();

create trigger pg_audit_trigger_anulaciones
  after insert or update or delete on public.anulaciones
  for each row execute function public.pg_audit_trigger();

create trigger pg_audit_trigger_usuarios
  after insert or update or delete on public.usuarios
  for each row execute function public.pg_audit_trigger();

-- anular_pedido: security invoker -- el UPDATE de pedidos.estado corre
-- con el rol de quien llama, así que pedidos_admin_all (Bloque 3, acceso
-- total del admin a su sede) es lo que efectivamente autoriza, sin
-- necesidad de una policy nueva sobre pedidos. Un no-admin falla antes de
-- llegar al UPDATE porque no tiene INSERT sobre anulaciones.
create or replace function public.anular_pedido(
  p_pedido_id uuid,
  p_motivo text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_estado public.estado_pedido;
begin
  select estado into v_estado
  from public.pedidos
  where id = p_pedido_id
  for update;

  if v_estado is null then
    raise exception 'Pedido no encontrado o sin permiso';
  end if;

  if v_estado <> 'cobrado' then
    raise exception 'Solo se pueden anular pedidos ya cobrados';
  end if;

  insert into public.anulaciones (pedido_id, usuario_id, motivo)
  values (p_pedido_id, auth.uid(), p_motivo);

  update public.pedidos
  set estado = 'anulado'
  where id = p_pedido_id;
end;
$$;

revoke execute on function public.anular_pedido(uuid, text) from public;
revoke execute on function public.anular_pedido(uuid, text) from anon;
grant execute on function public.anular_pedido(uuid, text) to authenticated;
