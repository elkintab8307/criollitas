-- Bloque E, hallazgo de verificación en vivo: el Bloque E amplió las
-- policies de nivel superior (pedidos, mesas) pero pasó por alto una capa
-- completa de policies sobre pedido_items/pedido_item_mods
-- (20260712140000) que también restringían a 'vendedora' -- sin estas,
-- confirmarItemsPedido falla para la cajera desde el propio INSERT (no
-- solo en la lectura posterior), porque las 4 policies afectadas nunca
-- consideraron que un rol distinto de 'vendedora' pudiera ser DUEÑO de un
-- pedido, no solo tener acceso por estado (cajera: cola de cobro/Bloque C;
-- cocina: KDS).
--
-- Se amplía la rama de vendedora a incluir cajera por ownership en las 4
-- policies, sin tocar las ramas de cajera-por-estado ni de cocina/admin
-- (siguen haciendo falta para sus casos de uso existentes).

drop policy if exists pedido_items_select on public.pedido_items;
create policy pedido_items_select on public.pedido_items
  for select to authenticated using (exists (
    select 1 from public.pedidos p where p.id = pedido_id and (
      (public.current_rol() in ('vendedora', 'cajera') and p.vendedora_id = auth.uid() and p.sede_id = public.current_sede_id())
      or (public.current_rol() = 'cajera' and p.sede_id = public.current_sede_id() and p.estado in ('listo', 'entregado', 'cobrado'))
      or (public.current_rol() = 'cocina' and p.sede_id = public.current_sede_id() and p.estado in ('enviado_cocina', 'en_preparacion', 'listo'))
      or (public.current_rol() = 'admin' and p.sede_id = public.current_sede_id())
    )
  ));

drop policy if exists pedido_items_vendedora_insert on public.pedido_items;
create policy pedido_items_vendedora_insert on public.pedido_items
  for insert to authenticated
  with check (exists (
    select 1 from public.pedidos p where p.id = pedido_id
      and public.current_rol() in ('vendedora', 'cajera') and p.vendedora_id = auth.uid()
      and p.sede_id = public.current_sede_id() and p.estado not in ('cobrado', 'cerrado', 'anulado')
  ));

drop policy if exists pedido_item_mods_select on public.pedido_item_mods;
create policy pedido_item_mods_select on public.pedido_item_mods
  for select to authenticated using (exists (
    select 1 from public.pedido_items pi join public.pedidos p on p.id = pi.pedido_id
    where pi.id = pedido_item_id and (
      (public.current_rol() in ('vendedora', 'cajera') and p.vendedora_id = auth.uid() and p.sede_id = public.current_sede_id())
      or (public.current_rol() = 'cajera' and p.sede_id = public.current_sede_id() and p.estado in ('listo', 'entregado', 'cobrado'))
      or (public.current_rol() = 'cocina' and p.sede_id = public.current_sede_id() and p.estado in ('enviado_cocina', 'en_preparacion', 'listo'))
      or (public.current_rol() = 'admin' and p.sede_id = public.current_sede_id())
    )
  ));

drop policy if exists pedido_item_mods_vendedora_insert on public.pedido_item_mods;
create policy pedido_item_mods_vendedora_insert on public.pedido_item_mods
  for insert to authenticated
  with check (exists (
    select 1 from public.pedido_items pi join public.pedidos p on p.id = pi.pedido_id
    where pi.id = pedido_item_id and public.current_rol() in ('vendedora', 'cajera') and p.vendedora_id = auth.uid()
      and p.sede_id = public.current_sede_id() and p.estado not in ('cobrado', 'cerrado', 'anulado')
  ));

-- clientes_domicilio_insert/_update (mismo archivo original): también
-- restringidas a 'vendedora'/'admin' -- crearPedidoDomicilio hace un
-- upsert ahí, así que sin este ajuste la cajera no puede tomar un pedido
-- de domicilio en absoluto (falla el propio upsert del cliente, antes de
-- llegar siquiera a crear el pedido).
drop policy if exists clientes_domicilio_insert on public.clientes_domicilio;
create policy clientes_domicilio_insert on public.clientes_domicilio
  for insert to authenticated
  with check (sede_id = public.current_sede_id() and public.current_rol() in ('vendedora', 'cajera', 'admin'));

drop policy if exists clientes_domicilio_update on public.clientes_domicilio;
create policy clientes_domicilio_update on public.clientes_domicilio
  for update to authenticated
  using (sede_id = public.current_sede_id() and public.current_rol() in ('vendedora', 'cajera', 'admin'))
  with check (sede_id = public.current_sede_id() and public.current_rol() in ('vendedora', 'cajera', 'admin'));
