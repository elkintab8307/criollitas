-- Hallazgo del review final de rama del Bloque 6 (Important): confirmarItemsPedido
-- (Bloque 5) decidía la transición de estado con siguienteEstadoTrasEnvio, que solo
-- reabría desde `abierto` o `entregado`. Agregar un ítem tardío a un pedido ya
-- `listo` (posible recién ahora que el Bloque 6 permite llegar a `listo`) o a uno
-- en `en_preparacion` dejaba el nuevo ítem en `pendiente` sin mover pedidos.estado
-- -- violando el invariante que el Bloque 6 formaliza (el agregado del pedido
-- siempre refleja el estado real de sus ítems) y que el Bloque 7 va a asumir para
-- decidir qué pedidos están listos para cobrar.
--
-- Se corrige recalcular_totales_pedido para que SIEMPRE derive el estado del
-- pedido a partir del estado real de sus pedido_items (misma regla que
-- actualizar_estado_item_pedido del Bloque 6 y lib/kds/estadoAgregado.ts), en vez
-- de aceptar un p_nuevo_estado decidido en el cliente. Como esta función corre
-- después de insertar los ítems nuevos, el array_agg siempre los incluye -- cubre
-- el primer envío (abierto, todos pendiente -> enviado_cocina), agregar mientras
-- ya está en cocina (mezcla -> en_preparacion), y reabrir un pedido listo/entregado
-- con un ítem tardío (mezcla -> en_preparacion), todo con la misma regla, sin
-- casos especiales por estado de origen.
--
-- Se deja la lógica del agregado DUPLICADA (no compartida vía llamada a la otra
-- función) a propósito: recalcular_totales_pedido corre en el contexto RLS de la
-- vendedora, actualizar_estado_item_pedido en el de cocina -- cada una debe seguir
-- siendo autosuficiente bajo su propio rol sin depender de que la otra función siga
-- funcionando igual bajo un rol distinto.
drop function if exists public.recalcular_totales_pedido(uuid, public.estado_pedido);

create or replace function public.recalcular_totales_pedido(p_pedido_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total bigint;
  v_estados public.estado_item_pedido[];
  v_nuevo_agregado public.estado_pedido;
begin
  select coalesce(sum(subtotal_cop), 0) into v_total
  from public.pedido_items
  where pedido_id = p_pedido_id;

  select array_agg(estado_item) into v_estados
  from public.pedido_items
  where pedido_id = p_pedido_id;

  v_nuevo_agregado := case
    when v_estados <@ array['listo']::public.estado_item_pedido[] then 'listo'
    when 'en_preparacion' = any(v_estados) or 'listo' = any(v_estados) then 'en_preparacion'
    else 'enviado_cocina'
  end;

  update public.pedidos
  set subtotal_cop = v_total,
      total_cop = v_total,
      estado = v_nuevo_agregado
  where id = p_pedido_id;
end;
$$;

grant execute on function public.recalcular_totales_pedido(uuid) to authenticated;
