-- Bloque A: si crearPedidoConItems crea el pedido pero falla al insertar
-- los ítems (ej. un producto se desactivó a mitad de camino), necesita
-- borrar la fila recién creada para mantener el invariante "sin productos,
-- no hay pedido". Hoy no existe NINGUNA policy de DELETE sobre pedidos,
-- pedido_items ni pedido_item_mods para ningún rol -- sin policy, Postgres
-- RLS deniega la operación por defecto (0 filas afectadas, sin error).
-- Se acota a estado='abierto': un pedido deja 'abierto' únicamente cuando
-- recalcular_totales_pedido corre con éxito (Bloque 5/6), así que en el
-- momento en que este rollback se ejecuta (confirmarItemsPedido devolvió
-- error), el pedido garantizadamente sigue 'abierto'.
create policy pedidos_vendedora_delete on public.pedidos
  for delete to authenticated
  using (
    public.current_rol() = 'vendedora'
    and vendedora_id = auth.uid()
    and sede_id = public.current_sede_id()
    and estado = 'abierto'
  );

create policy pedido_items_vendedora_delete on public.pedido_items
  for delete to authenticated
  using (exists (
    select 1 from public.pedidos p
    where p.id = pedido_items.pedido_id
      and p.vendedora_id = auth.uid()
      and p.estado = 'abierto'
      and public.current_rol() = 'vendedora'
  ));

create policy pedido_item_mods_vendedora_delete on public.pedido_item_mods
  for delete to authenticated
  using (exists (
    select 1 from public.pedido_items pi
    join public.pedidos p on p.id = pi.pedido_id
    where pi.id = pedido_item_mods.pedido_item_id
      and p.vendedora_id = auth.uid()
      and p.estado = 'abierto'
      and public.current_rol() = 'vendedora'
  ));
