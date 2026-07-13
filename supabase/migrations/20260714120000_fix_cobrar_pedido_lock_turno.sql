-- Hallazgo del review de Task 2 (Critical): cobrar_pedido no bloqueaba la
-- fila de turnos_caja, así que un pago podía insertarse en pagos contra un
-- turno que cerrar_turno estaba cerrando en ese mismo instante. La secuencia
-- exacta: cobrar_pedido hace su INSERT en pagos; la policy RLS
-- pagos_cajera_insert evalúa su WITH CHECK (t.estado = 'abierto') contra el
-- snapshot READ COMMITTED de esa sentencia -- que todavía ve el turno como
-- 'abierto' porque cerrar_turno aún no confirmó su UPDATE -- y el check pasa.
-- Solo DESPUÉS de que el check de RLS ya aprobó, el trigger de FK (AFTER
-- ROW, on public.pagos.turno_id -> turnos_caja.id) intenta tomar FOR KEY
-- SHARE sobre la fila del turno y ahí sí bloquea contra el FOR UPDATE de
-- cerrar_turno -- pero cuando cerrar_turno confirma y libera el lock, el FK
-- solo verifica que la fila padre exista (le da igual su estado), así que
-- el insert de todas formas se completa. El pago queda guardado en un turno
-- ya 'cerrado', invisible para el SUM que cerrar_turno ya corrió y confirmó
-- -- una diferencia de caja silenciosa y permanente, sin ningún error.
--
-- Se corrige agregando un lock y chequeo explícito del turno DENTRO de
-- cobrar_pedido, antes de validar el cuadre y de insertar. "for key share"
-- (no "for update") porque dos cobros concurrentes sobre pedidos distintos
-- del mismo turno no deben bloquearse entre sí -- FOR KEY SHARE no choca
-- consigo mismo, solo con el FOR UPDATE de cerrar_turno. Si el turno ya
-- estaba cerrado cuando se toma el lock, o se cerró mientras esta
-- sentencia esperaba el lock, el re-chequeo posterior al bloqueo lo
-- detecta con un snapshot fresco (no el de antes de bloquear) y rechaza
-- explícitamente en vez de depender del timing de RLS.
create or replace function public.cobrar_pedido(
  p_pedido_id uuid,
  p_turno_id uuid,
  p_pagos jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total bigint;
  v_estado public.estado_pedido;
  v_turno_estado public.estado_turno;
  v_suma_pagos bigint;
  v_pago jsonb;
begin
  select estado into v_turno_estado
  from public.turnos_caja
  where id = p_turno_id
  for key share;

  if v_turno_estado is null then
    raise exception 'Turno no encontrado o sin permiso';
  end if;

  if v_turno_estado <> 'abierto' then
    raise exception 'El turno ya está cerrado';
  end if;

  select total_cop, estado into v_total, v_estado
  from public.pedidos
  where id = p_pedido_id
  for update;

  if v_total is null then
    raise exception 'Pedido no encontrado o sin permiso';
  end if;

  if v_estado not in ('listo', 'entregado') then
    raise exception 'El pedido no está listo para cobrar';
  end if;

  select coalesce(sum((pago->>'monto_cop')::bigint), 0) into v_suma_pagos
  from jsonb_array_elements(p_pagos) as pago;

  if v_suma_pagos <> v_total then
    raise exception 'La suma de los pagos no coincide con el total del pedido';
  end if;

  for v_pago in select * from jsonb_array_elements(p_pagos)
  loop
    insert into public.pagos (pedido_id, turno_id, metodo, monto_cop, referencia)
    values (
      p_pedido_id,
      p_turno_id,
      (v_pago->>'metodo')::public.metodo_pago,
      (v_pago->>'monto_cop')::bigint,
      v_pago->>'referencia'
    );
  end loop;

  update public.pedidos
  set estado = 'cobrado'
  where id = p_pedido_id;
end;
$$;

revoke execute on function public.cobrar_pedido(uuid, uuid, jsonb) from public;
revoke execute on function public.cobrar_pedido(uuid, uuid, jsonb) from anon;
grant execute on function public.cobrar_pedido(uuid, uuid, jsonb) to authenticated;
