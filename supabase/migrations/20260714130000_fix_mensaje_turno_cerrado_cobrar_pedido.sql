-- Detectado en la verificación RLS en vivo de la Task 10: cobrar_pedido
-- (20260714120000) intentaba distinguir "turno no encontrado" de "turno ya
-- cerrado" con dos ramas separadas, pero esa distinción es imposible con
-- "select ... for key share": Postgres exige que una fila visible a un
-- SELECT con cláusula de bloqueo satisfaga TANTO la policy de SELECT COMO
-- el USING de una policy de UPDATE aplicable sobre esa misma tabla (así
-- funciona RLS combinado con FOR UPDATE/FOR SHARE/FOR KEY SHARE). La
-- policy turnos_caja_cajera_update tiene "using (... and estado =
-- 'abierto')", así que en cuanto el turno pasa a 'cerrado' la fila deja de
-- ser visible para CUALQUIER select con lock -- exactamente igual de
-- invisible que si no existiera o fuera de otra cajera. La rama "El turno
-- ya está cerrado" era código muerto: nunca se alcanza, porque
-- v_turno_estado siempre da null en ese caso.
--
-- Confirmado en vivo: una cajera con turno recién cerrado que intenta
-- cobrar_pedido recibía "Turno no encontrado o sin permiso" en vez de un
-- mensaje que la oriente a abrir un turno nuevo -- no es un problema de
-- seguridad (el cobro se sigue bloqueando igual), pero el mensaje es
-- enganoso. cerrar_turno (20260714110000) ya tenía la redacción correcta
-- para este mismo límite ("Turno no encontrado, sin permiso, o ya está
-- cerrado") -- se alinea cobrar_pedido a esa misma redacción en vez de
-- prometer una distinción que RLS no permite hacer.
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

  if v_turno_estado is null or v_turno_estado <> 'abierto' then
    raise exception 'Turno no encontrado, sin permiso, o ya está cerrado';
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
