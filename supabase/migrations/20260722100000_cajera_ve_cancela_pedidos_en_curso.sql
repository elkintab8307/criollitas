-- Bloque C: la cajera necesita ver y cancelar pedidos de domicilio/llevar
-- en CUALQUIER estado no terminal, no solo listo/entregado/cobrado (su
-- alcance hasta ahora, pensado solo para la cola de cobro). Se amplía
-- pedidos_cajera_select para incluir abierto/enviado_cocina/en_preparacion
-- (ve el pedido mientras la vendedora aún lo arma o cocina lo prepara) y
-- cancelado (para poder confirmar visualmente que su propia cancelación
-- surtió efecto).
drop policy if exists pedidos_cajera_select on public.pedidos;

create policy pedidos_cajera_select on public.pedidos
  for select to authenticated
  using (
    public.current_rol() = 'cajera' and sede_id = public.current_sede_id()
    and estado in ('abierto', 'enviado_cocina', 'en_preparacion', 'listo', 'entregado', 'cobrado', 'cancelado')
  );

-- Nueva policy de UPDATE, paralela a pedidos_cajera_update (que solo
-- permite la transición hacia 'cobrado'): permite la transición hacia
-- 'cancelado' desde cualquier estado no terminal. cancelar_pedido (RPC,
-- Bloque B) ya valida ownership/estado por su cuenta con el lock FOR
-- UPDATE -- esta policy solo autoriza la escritura en sí.
create policy pedidos_cajera_cancelar on public.pedidos
  for update to authenticated
  using (
    public.current_rol() = 'cajera' and sede_id = public.current_sede_id()
    and estado not in ('cobrado', 'cerrado', 'anulado', 'cancelado')
  )
  with check (
    public.current_rol() = 'cajera' and sede_id = public.current_sede_id()
    and estado = 'cancelado'
  );

-- pedidos_cajera_solo_estado (Bloque 7) solo permitía cambiar la columna
-- `estado`. cancelar_pedido escribe estado Y motivo_cancelacion en la
-- misma sentencia -- sin este ajuste, el trigger rechazaría la
-- cancelación de la cajera con "La cajera solo puede actualizar el
-- estado del pedido".
create or replace function public.pedidos_cajera_solo_estado()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.current_rol() = 'cajera' then
    if (to_jsonb(new) - 'estado' - 'motivo_cancelacion') is distinct from (to_jsonb(old) - 'estado' - 'motivo_cancelacion') then
      raise exception 'La cajera solo puede actualizar el estado del pedido';
    end if;
  end if;
  return new;
end;
$$;
