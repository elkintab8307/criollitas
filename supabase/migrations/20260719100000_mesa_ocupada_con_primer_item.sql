-- Fix reportado en uso real: una mesa pasaba a 'ocupada' en el momento en
-- que se creaba el pedido (crearPedidoMesa, al tocar la mesa vacía), no
-- cuando efectivamente se agregaba el primer producto. Se mueve la
-- ocupación al RPC que ya corre justo después de insertar los primeros
-- ítems de un pedido (recalcular_totales_pedido), atómico con el resto
-- del recálculo, e idempotente (where estado = 'libre', no-op en envíos
-- posteriores al mismo pedido).
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
  v_canal public.canal_pedido;
  v_mesa_id uuid;
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

  select canal, mesa_id into v_canal, v_mesa_id
  from public.pedidos
  where id = p_pedido_id;

  update public.pedidos
  set subtotal_cop = v_total,
      total_cop = v_total,
      estado = v_nuevo_agregado
  where id = p_pedido_id;

  if v_canal = 'mesa' and v_mesa_id is not null then
    update public.mesas
    set estado = 'ocupada'
    where id = v_mesa_id and estado = 'libre';
  end if;
end;
$$;

grant execute on function public.recalcular_totales_pedido(uuid) to authenticated;
