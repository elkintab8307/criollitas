-- Fix reportado en uso real (relacionado con el fix de mesa_ocupada_con_
-- primer_item): ningún flujo liberaba una mesa al cobrar su pedido -- la
-- mesa quedaba 'ocupada' para siempre tras el primer pedido, sin que
-- ninguna vendedora pudiera reutilizarla (pedidos_vendedora_select no
-- excluye estados terminales, pero pedidos_vendedora_update sí, así que
-- tampoco podía "arreglarlo" reabriendo el pedido cobrado). Solo un admin
-- podía liberarla a mano desde /mesas.
--
-- La cajera no tenía ninguna policy de UPDATE sobre mesas. Se agrega una
-- simétrica a mesas_vendedora_update_estado pero en sentido inverso
-- (ocupada -> libre en vez de libre -> ocupada), y se extiende el trigger
-- de columna única (antes solo restringía a vendedora) para cubrir
-- también a cajera.
drop policy if exists mesas_vendedora_update_estado on public.mesas;

create policy mesas_vendedora_update_estado on public.mesas
  for update to authenticated
  using (
    public.current_rol() = 'vendedora'
    and sede_id = public.current_sede_id()
    and estado = 'libre'
    and activa = true
  )
  with check (
    public.current_rol() = 'vendedora'
    and sede_id = public.current_sede_id()
    and estado = 'ocupada'
  );

create policy mesas_cajera_update_estado on public.mesas
  for update to authenticated
  using (
    public.current_rol() = 'cajera'
    and sede_id = public.current_sede_id()
    and estado = 'ocupada'
    and activa = true
  )
  with check (
    public.current_rol() = 'cajera'
    and sede_id = public.current_sede_id()
    and estado = 'libre'
  );

drop trigger if exists mesas_vendedora_solo_estado_trigger on public.mesas;
drop function if exists public.mesas_vendedora_solo_estado();

create or replace function public.mesas_solo_estado_operacion()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.current_rol() in ('vendedora', 'cajera') then
    if (to_jsonb(new) - 'estado') is distinct from (to_jsonb(old) - 'estado') then
      raise exception 'Este rol solo puede actualizar el estado de la mesa';
    end if;
  end if;
  return new;
end;
$$;

create trigger mesas_solo_estado_operacion_trigger
  before update on public.mesas
  for each row execute function public.mesas_solo_estado_operacion();

-- cobrar_pedido: mismo cuerpo, captura canal/mesa_id en el lock inicial y
-- libera la mesa (si aplica) en la misma sentencia que marca el pedido
-- cobrado -- atómico, idempotente (where estado = 'ocupada').
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
  v_canal public.canal_pedido;
  v_mesa_id uuid;
  v_suma_pagos bigint;
  v_pago jsonb;
begin
  select total_cop, estado, canal, mesa_id into v_total, v_estado, v_canal, v_mesa_id
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

  if v_canal = 'mesa' and v_mesa_id is not null then
    update public.mesas
    set estado = 'libre'
    where id = v_mesa_id and estado = 'ocupada';
  end if;
end;
$$;

revoke execute on function public.cobrar_pedido(uuid, uuid, jsonb) from public;
revoke execute on function public.cobrar_pedido(uuid, uuid, jsonb) from anon;
grant execute on function public.cobrar_pedido(uuid, uuid, jsonb) to authenticated;
