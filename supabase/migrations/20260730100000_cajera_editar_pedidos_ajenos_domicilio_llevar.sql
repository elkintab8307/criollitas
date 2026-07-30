-- Decisión explícita del usuario (2026-07-30): la cajera hoy puede VER y
-- CANCELAR pedidos de domicilio/llevar de toda la sede (Bloque C), pero
-- solo puede AGREGAR/QUITAR productos a los que ella misma creó (Bloque
-- E, vendedora_id = auth.uid()). Se amplía para que también pueda
-- editar (agregar productos) un pedido AJENO de domicilio o para llevar
-- -- explícitamente NO se toca mesa, que sigue siendo exclusiva de quien
-- lo creó.

-- pedidos: UPDATE para recalcular_totales_pedido sobre un pedido ajeno de
-- domicilio/llevar no terminal -- mismos estados destino que
-- pedidos_vendedora_update.
create policy pedidos_cajera_editar_ajeno_update on public.pedidos
  for update to authenticated
  using (
    public.current_rol() = 'cajera' and sede_id = public.current_sede_id()
    and canal in ('domicilio', 'llevar')
    and estado not in ('cobrado', 'cerrado', 'anulado', 'cancelado')
  )
  with check (
    public.current_rol() = 'cajera' and sede_id = public.current_sede_id()
    and canal in ('domicilio', 'llevar')
    and estado in ('abierto', 'enviado_cocina', 'en_preparacion', 'listo', 'entregado', 'cancelado')
  );

-- pedido_items/pedido_item_mods: INSERT sobre un pedido ajeno de
-- domicilio/llevar no terminal (mismo criterio que
-- pedido_items_vendedora_insert, sin exigir vendedora_id = auth.uid()).
create policy pedido_items_cajera_editar_ajeno_insert on public.pedido_items
  for insert to authenticated
  with check (exists (
    select 1 from public.pedidos p where p.id = pedido_id
      and public.current_rol() = 'cajera' and p.sede_id = public.current_sede_id()
      and p.canal in ('domicilio', 'llevar')
      and p.estado not in ('cobrado', 'cerrado', 'anulado')
  ));

create policy pedido_item_mods_cajera_editar_ajeno_insert on public.pedido_item_mods
  for insert to authenticated
  with check (exists (
    select 1 from public.pedido_items pi join public.pedidos p on p.id = pi.pedido_id
    where pi.id = pedido_item_id
      and public.current_rol() = 'cajera' and p.sede_id = public.current_sede_id()
      and p.canal in ('domicilio', 'llevar')
      and p.estado not in ('cobrado', 'cerrado', 'anulado')
  ));

-- pedidos_cajera_solo_estado (Bloque E, 20260724120000) restringe a la
-- cajera a tocar solo estado/motivo_cancelacion cuando el pedido NO es
-- suyo -- eso bloquearía subtotal_cop/total_cop al agregar productos a
-- un ajeno de domicilio/llevar. Se excluye ese canal de la restricción,
-- igual que ya está excluido el caso "es dueña".
create or replace function public.pedidos_cajera_solo_estado()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.current_rol() = 'cajera'
     and old.vendedora_id is distinct from auth.uid()
     and old.canal not in ('domicilio', 'llevar') then
    if (to_jsonb(new) - 'estado' - 'motivo_cancelacion') is distinct from (to_jsonb(old) - 'estado' - 'motivo_cancelacion') then
      raise exception 'La cajera solo puede actualizar el estado del pedido';
    end if;
  end if;
  return new;
end;
$$;
