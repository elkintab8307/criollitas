-- Bloque B: columna para el motivo de cancelación (no una tabla nueva tipo
-- anulaciones -- ya se audita gratis vía pg_audit_trigger, ya adjunto a
-- pedidos desde el Bloque 8).
alter table public.pedidos add column motivo_cancelacion text;

-- pedidos_vendedora_update (20260712150000): el WITH CHECK no incluía
-- 'cancelado' como aterrizaje válido, y el USING no lo excluía como estado
-- terminal -- sin este reemplazo, cancelar_pedido (security invoker)
-- recibiría "new row violates row-level security policy".
drop policy if exists pedidos_vendedora_update on public.pedidos;

create policy pedidos_vendedora_update on public.pedidos
  for update to authenticated
  using (
    public.current_rol() = 'vendedora' and vendedora_id = auth.uid() and sede_id = public.current_sede_id()
    and estado not in ('cobrado', 'cerrado', 'anulado', 'cancelado')
  )
  with check (
    public.current_rol() = 'vendedora' and vendedora_id = auth.uid() and sede_id = public.current_sede_id()
    and estado in ('abierto', 'enviado_cocina', 'en_preparacion', 'listo', 'entregado', 'cancelado')
  );

-- mesas_vendedora_update_estado (20260719110000) solo permitía libre ->
-- ocupada. Se amplía para permitir también ocupada -> libre, simétrico a
-- como mesas_cajera_update_estado ya libera la mesa al cobrar.
drop policy if exists mesas_vendedora_update_estado on public.mesas;

create policy mesas_vendedora_update_estado on public.mesas
  for update to authenticated
  using (
    public.current_rol() = 'vendedora'
    and sede_id = public.current_sede_id()
    and estado in ('libre', 'ocupada')
    and activa = true
  )
  with check (
    public.current_rol() = 'vendedora'
    and sede_id = public.current_sede_id()
    and estado in ('libre', 'ocupada')
  );

-- cancelar_pedido: RPC atómico. Lock FOR UPDATE sobre la fila del pedido
-- (mismo patrón que cobrar_pedido), valida motivo y estado no terminal,
-- transiciona a 'cancelado' y libera la mesa en la misma sentencia si
-- canal='mesa'. security invoker: el UPDATE de pedidos pasa por
-- pedidos_vendedora_update (ownership ya validado ahí) y el de mesas por
-- mesas_vendedora_update_estado ampliada arriba. Genérico por canal (el
-- "if v_canal = 'mesa'" es la única rama condicional) para que el Bloque C
-- reutilice este mismo RPC sin cambios.
create or replace function public.cancelar_pedido(
  p_pedido_id uuid,
  p_motivo text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_estado public.estado_pedido;
  v_canal public.canal_pedido;
  v_mesa_id uuid;
begin
  if length(trim(p_motivo)) < 5 then
    raise exception 'Escribe un motivo de al menos 5 caracteres';
  end if;

  select estado, canal, mesa_id into v_estado, v_canal, v_mesa_id
  from public.pedidos
  where id = p_pedido_id
  for update;

  if v_estado is null then
    raise exception 'Pedido no encontrado o sin permiso';
  end if;

  if v_estado in ('cobrado', 'cerrado', 'anulado', 'cancelado') then
    raise exception 'Este pedido ya no se puede cancelar';
  end if;

  update public.pedidos
  set estado = 'cancelado', motivo_cancelacion = p_motivo
  where id = p_pedido_id;

  if v_canal = 'mesa' and v_mesa_id is not null then
    update public.mesas
    set estado = 'libre'
    where id = v_mesa_id and estado = 'ocupada';
  end if;
end;
$$;

revoke execute on function public.cancelar_pedido(uuid, text) from public;
revoke execute on function public.cancelar_pedido(uuid, text) from anon;
grant execute on function public.cancelar_pedido(uuid, text) to authenticated;
