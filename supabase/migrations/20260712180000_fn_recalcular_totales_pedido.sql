-- confirmarItemsPedido (Bloque 5) puede llamarse varias veces sobre el mismo
-- pedido (edición después de enviado a cocina). Sumar el nuevo subtotal a un
-- valor leído antes del insert es un read-modify-write: dos llamadas
-- concurrentes/reintentadas pueden pisarse y el total queda por debajo de lo
-- real aunque los pedido_items sí quedaron bien guardados. Esta función
-- recalcula subtotal_cop/total_cop con un SUM fresco sobre pedido_items en
-- el mismo statement, evitando la ventana de carrera.
create or replace function public.recalcular_totales_pedido(p_pedido_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.pedidos
  set subtotal_cop = coalesce((
        select sum(subtotal_cop) from public.pedido_items where pedido_id = p_pedido_id
      ), 0),
      total_cop = coalesce((
        select sum(subtotal_cop) from public.pedido_items where pedido_id = p_pedido_id
      ), 0)
  where id = p_pedido_id;
$$;

grant execute on function public.recalcular_totales_pedido(uuid) to authenticated;
