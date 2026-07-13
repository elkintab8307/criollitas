-- Fix sobre 20260712180000: recalcular_totales_pedido cerró la carrera de
-- totales, pero la Server Action seguía escribiendo el nuevo estado con un
-- segundo UPDATE separado (dos round-trips). Si el primero (totales) tenía
-- éxito y el segundo (estado) fallaba o se perdía (misma red inestable que
-- motivó el fix anterior), el pedido quedaba en un estado inconsistente
-- nuevo que no existía antes: totales correctos pero estado sin avanzar a
-- enviado_cocina, y como pedido_items no es idempotente, un reintento del
-- usuario duplicaría los ítems ya insertados. Se pliega la transición de
-- estado dentro de la misma función/statement para volver a tener una sola
-- escritura atómica, igual que el UPDATE original antes de 20260712180000.

drop function if exists public.recalcular_totales_pedido(uuid);

create or replace function public.recalcular_totales_pedido(
  p_pedido_id uuid,
  p_nuevo_estado public.estado_pedido default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total bigint;
begin
  select coalesce(sum(subtotal_cop), 0) into v_total
  from public.pedido_items
  where pedido_id = p_pedido_id;

  update public.pedidos
  set subtotal_cop = v_total,
      total_cop = v_total,
      estado = coalesce(p_nuevo_estado, estado)
  where id = p_pedido_id;
end;
$$;

grant execute on function public.recalcular_totales_pedido(uuid, public.estado_pedido) to authenticated;
