-- Bloque E: la cajera toma pedidos igual que la vendedora, en los 3
-- canales (decisión confirmada con el usuario). Se amplía el predicado de
-- rol de las policies ya existentes en vez de duplicarlas -- la cajera
-- necesita exactamente el mismo permiso que la vendedora, no una variante.
-- El resto de cada predicado (ownership vía vendedora_id = auth.uid(),
-- sede_id, transiciones de estado permitidas) no cambia.

drop policy if exists pedidos_vendedora_select on public.pedidos;
create policy pedidos_vendedora_select on public.pedidos
  for select to authenticated
  using (
    public.current_rol() in ('vendedora', 'cajera') and vendedora_id = auth.uid() and sede_id = public.current_sede_id()
  );

drop policy if exists pedidos_vendedora_insert on public.pedidos;
create policy pedidos_vendedora_insert on public.pedidos
  for insert to authenticated
  with check (
    public.current_rol() in ('vendedora', 'cajera') and vendedora_id = auth.uid() and sede_id = public.current_sede_id()
  );

drop policy if exists pedidos_vendedora_update on public.pedidos;
create policy pedidos_vendedora_update on public.pedidos
  for update to authenticated
  using (
    public.current_rol() in ('vendedora', 'cajera') and vendedora_id = auth.uid() and sede_id = public.current_sede_id()
    and estado not in ('cobrado', 'cerrado', 'anulado', 'cancelado')
  )
  with check (
    public.current_rol() in ('vendedora', 'cajera') and vendedora_id = auth.uid() and sede_id = public.current_sede_id()
    and estado in ('abierto', 'enviado_cocina', 'en_preparacion', 'listo', 'entregado', 'cancelado')
  );

-- pedidos_vendedora_delete (Bloque A, rollback de pedido vacío si
-- confirmarItemsPedido falla tras crear la fila): sin ampliar esta, el
-- rollback de un pedido creado por la cajera fallaría silenciosamente
-- (RLS deniega, 0 filas, sin error) y dejaría una fila 'abierto' huérfana
-- -- rompe el invariante "sin productos, no hay pedido" del Bloque A.
drop policy if exists pedidos_vendedora_delete on public.pedidos;
create policy pedidos_vendedora_delete on public.pedidos
  for delete to authenticated
  using (
    public.current_rol() in ('vendedora', 'cajera')
    and vendedora_id = auth.uid()
    and sede_id = public.current_sede_id()
    and estado = 'abierto'
  );

drop policy if exists pedido_items_vendedora_delete on public.pedido_items;
create policy pedido_items_vendedora_delete on public.pedido_items
  for delete to authenticated
  using (exists (
    select 1 from public.pedidos p
    where p.id = pedido_items.pedido_id
      and p.vendedora_id = auth.uid()
      and p.estado = 'abierto'
      and public.current_rol() in ('vendedora', 'cajera')
  ));

drop policy if exists pedido_item_mods_vendedora_delete on public.pedido_item_mods;
create policy pedido_item_mods_vendedora_delete on public.pedido_item_mods
  for delete to authenticated
  using (exists (
    select 1 from public.pedido_items pi
    join public.pedidos p on p.id = pi.pedido_id
    where pi.id = pedido_item_mods.pedido_item_id
      and p.vendedora_id = auth.uid()
      and p.estado = 'abierto'
      and public.current_rol() in ('vendedora', 'cajera')
  ));

-- Consolidación de mesas: mesas_vendedora_update_estado (libre<->ocupada,
-- solo vendedora) y mesas_cajera_update_estado (solo ocupada->libre, para
-- el cobro) se funden en una sola policy bidireccional para ambos roles
-- -- la policy de cajera queda redundante y se elimina.
drop policy if exists mesas_vendedora_update_estado on public.mesas;
drop policy if exists mesas_cajera_update_estado on public.mesas;

create policy mesas_staff_update_estado on public.mesas
  for update to authenticated
  using (
    public.current_rol() in ('vendedora', 'cajera')
    and sede_id = public.current_sede_id()
    and estado in ('libre', 'ocupada')
    and activa = true
  )
  with check (
    public.current_rol() in ('vendedora', 'cajera')
    and sede_id = public.current_sede_id()
    and estado in ('libre', 'ocupada')
  );
