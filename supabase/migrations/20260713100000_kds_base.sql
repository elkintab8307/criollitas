-- Bloque 6 (KDS): la cocina necesita ver cuánto tiempo lleva un pedido
-- esperando y tocar cada ítem para avanzar su estado. enviado_cocina_en se
-- fija la primera vez que el pedido entra a enviado_cocina (nunca se
-- sobreescribe, ni siquiera si un pedido entregado se "reabre" por el fix
-- del Bloque 5 al agregarle un ítem tardío) — el semáforo de tiempo mide
-- desde la primera llegada real a cocina, no desde creado_en (que podría
-- ser bastante antes si la vendedora editó el pedido antes de enviarlo).
alter table public.pedidos add column enviado_cocina_en timestamptz;

-- Policy de escritura para cocina sobre pedidos.estado: sin esto, el UPDATE
-- de pedidos.estado dentro del RPC de abajo fallaría en silencio bajo RLS
-- real (0 filas, sin error visible) — el mismo tipo de gap que se encontró
-- y cerró dos veces en el Bloque 5 (mesas y pedidos para vendedora). Se
-- restringe a los 3 valores no-terminales que cocina puede producir; nunca
-- puede escribir abierto/entregado/cobrado/cerrado/anulado.
create policy pedidos_cocina_update_estado on public.pedidos
  for update to authenticated
  using (
    public.current_rol() = 'cocina' and sede_id = public.current_sede_id()
    and estado in ('enviado_cocina', 'en_preparacion', 'listo')
  )
  with check (
    public.current_rol() = 'cocina' and sede_id = public.current_sede_id()
    and estado in ('enviado_cocina', 'en_preparacion', 'listo')
  );

-- Actualiza un ítem y recalcula el estado agregado del pedido en la misma
-- sentencia: si dos cocineros tocan ítems del mismo pedido casi al mismo
-- tiempo, cada llamada lee el estado real de TODOS los ítems hermanos
-- después de su propio UPDATE, no un valor que pudo quedar obsoleto entre
-- la lectura y la escritura en el cliente.
create or replace function public.actualizar_estado_item_pedido(
  p_pedido_item_id uuid,
  p_nuevo_estado public.estado_item_pedido
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pedido_id uuid;
  v_estados public.estado_item_pedido[];
  v_nuevo_agregado public.estado_pedido;
begin
  update public.pedido_items
  set estado_item = p_nuevo_estado,
      tiempo_listo_en = case when p_nuevo_estado = 'listo' then now() else tiempo_listo_en end
  where id = p_pedido_item_id
  returning pedido_id into v_pedido_id;

  if v_pedido_id is null then
    raise exception 'Ítem de pedido no encontrado o sin permiso';
  end if;

  select array_agg(estado_item) into v_estados
  from public.pedido_items
  where pedido_id = v_pedido_id;

  v_nuevo_agregado := case
    when v_estados <@ array['listo']::public.estado_item_pedido[] then 'listo'
    when 'en_preparacion' = any(v_estados) or 'listo' = any(v_estados) then 'en_preparacion'
    else 'enviado_cocina'
  end;

  update public.pedidos
  set estado = v_nuevo_agregado,
      enviado_cocina_en = coalesce(enviado_cocina_en, now())
  where id = v_pedido_id and estado is distinct from v_nuevo_agregado;
end;
$$;

grant execute on function public.actualizar_estado_item_pedido(uuid, public.estado_item_pedido) to authenticated;

-- La policy pedido_items_cocina_update del Bloque 5 (20260712140000) exige
-- que el pedido esté en un estado no-terminal para cocina, pero su
-- WITH CHECK no restringe a qué estado_item puede escribir cocina — un
-- UPDATE crudo vía PostgREST (fuera del RPC de arriba) podría poner
-- estado_item='entregado' directamente, algo que ningún toque de KDS
-- produce en este bloque. Mismo tipo de gap cerrado dos veces en el
-- Bloque 5 (mesas y pedidos para vendedora): se restringe aquí también,
-- aunque el camino legítimo (Server Action -> RPC) nunca lo dispara.
drop policy if exists pedido_items_cocina_update on public.pedido_items;

create policy pedido_items_cocina_update on public.pedido_items
  for update to authenticated
  using (exists (
    select 1 from public.pedidos p where p.id = pedido_id
      and public.current_rol() = 'cocina' and p.sede_id = public.current_sede_id()
      and p.estado in ('enviado_cocina', 'en_preparacion', 'listo')
  ))
  with check (
    estado_item in ('pendiente', 'en_preparacion', 'listo')
    and exists (
      select 1 from public.pedidos p where p.id = pedido_id
        and public.current_rol() = 'cocina' and p.sede_id = public.current_sede_id()
    )
  );
