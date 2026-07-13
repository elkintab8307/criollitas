-- cerrar_turno: calcula esperado_cop/diferencia_cop con un SUM fresco sobre
-- pagos/movimientos_caja de este turno, en la misma sentencia que fija
-- estado='cerrado'. El "for update" sobre la fila del turno bloquea hasta
-- que cualquier cobro concurrente sobre ese turno termine, evitando cerrar
-- con un pago que llegó justo en el medio del cálculo (mismo patrón que el
-- lock de actualizar_estado_item_pedido del Bloque 6).
create or replace function public.cerrar_turno(
  p_turno_id uuid,
  p_efectivo_declarado_cop bigint
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_efectivo_inicial bigint;
  v_pagos_efectivo bigint;
  v_retiros_gastos bigint;
  v_ingresos_extra bigint;
  v_esperado bigint;
begin
  select efectivo_inicial_cop into v_efectivo_inicial
  from public.turnos_caja
  where id = p_turno_id and estado = 'abierto'
  for update;

  if v_efectivo_inicial is null then
    raise exception 'Turno no encontrado, sin permiso, o ya está cerrado';
  end if;

  select coalesce(sum(monto_cop), 0) into v_pagos_efectivo
  from public.pagos
  where turno_id = p_turno_id and metodo = 'efectivo';

  select coalesce(sum(monto_cop), 0) into v_retiros_gastos
  from public.movimientos_caja
  where turno_id = p_turno_id and tipo in ('retiro', 'gasto');

  select coalesce(sum(monto_cop), 0) into v_ingresos_extra
  from public.movimientos_caja
  where turno_id = p_turno_id and tipo = 'ingreso_extra';

  v_esperado := v_efectivo_inicial + v_pagos_efectivo - v_retiros_gastos + v_ingresos_extra;

  update public.turnos_caja
  set efectivo_declarado_cop = p_efectivo_declarado_cop,
      esperado_cop = v_esperado,
      diferencia_cop = p_efectivo_declarado_cop - v_esperado,
      estado = 'cerrado',
      cerrado_en = now()
  where id = p_turno_id;
end;
$$;

revoke execute on function public.cerrar_turno(uuid, bigint) from public;
revoke execute on function public.cerrar_turno(uuid, bigint) from anon;
grant execute on function public.cerrar_turno(uuid, bigint) to authenticated;

-- cobrar_pedido: relee total_cop/estado del pedido con lock ("for update",
-- nunca confía en el total que calculó el cliente — CLAUDE.md §13.2), valida
-- que el estado sea listo/entregado, valida server-side que la suma de los
-- pagos cuadre EXACTO con el total (§2.3), inserta todos los pagos, y
-- transiciona el pedido a cobrado — todo en una sola sentencia atómica.
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
  v_suma_pagos bigint;
  v_pago jsonb;
begin
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
