-- Fix sobre 20260713100000, tres hallazgos del review de Task 1:
--
-- 1. actualizar_estado_item_pedido no serializaba el recalculo del agregado:
--    dos toques concurrentes sobre items DISTINTOS del mismo pedido, bajo
--    READ COMMITTED (default, sin lock explicito), podian cada uno leer el
--    array_agg antes de que la otra transaccion confirmara su propio UPDATE
--    de pedido_items -- cada llamada calculaba un agregado obsoleto, y el
--    pedido podia quedar atascado por debajo de lo que sus items realmente
--    indican (ej. en_preparacion aunque todos ya esten listo). Se agrega un
--    "select ... for update" sobre la fila del pedido antes de leer los
--    estados hermanos: serializa las dos transacciones, la segunda ve el
--    resultado ya confirmado de la primera.
--
-- 2. pedidos_cocina_update_estado restringe el VALOR de estado que cocina
--    puede escribir, pero no QUE COLUMNAS puede tocar un UPDATE crudo vía
--    PostgREST que bypasee el RPC -- podria escribir total_cop, mesa_id,
--    etc. mientras el estado final sea uno de los 3 permitidos. Mismo tipo
--    de gap ya cerrado en el Bloque 5 para mesas (mesas_vendedora_solo_estado,
--    20260712170000): se agrega el trigger analogo para pedidos+cocina,
--    permitiendo cambiar solo estado y enviado_cocina_en (esta ultima
--    porque el propio RPC la escribe). pedido_items no necesita un trigger
--    equivalente: ya tiene proteccion a nivel de columna desde el Bloque 5
--    (revoke update on pedido_items from authenticated; grant update
--    (estado_item, tiempo_listo_en) ...) -- Postgres rechaza cualquier otra
--    columna en el SET antes de que RLS siquiera evalue.
--
-- 3. El RPC solo tenia "grant execute ... to authenticated", sin revocar el
--    execute implicito que Postgres concede a PUBLIC al crear una funcion.
--    No se pudo confirmar en el review si anon retenia ese privilegio (la
--    llamada anonima devolvia 400 con el mensaje propio del RPC en vez de
--    401/403, lo cual es compatible con ambas hipotesis). Se revoca de
--    PUBLIC explicitamente por defensa en profundidad, sin depender de cual
--    hipotesis era la correcta.

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

  -- Serializa con cualquier otra llamada concurrente sobre el mismo pedido:
  -- bloquea hasta que esa otra transaccion confirme (o revierta), así que el
  -- array_agg de abajo siempre ve el estado ya confirmado de todos los
  -- ítems hermanos, no un snapshot obsoleto tomado antes de su commit.
  perform 1 from public.pedidos where id = v_pedido_id for update;

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

revoke execute on function public.actualizar_estado_item_pedido(uuid, public.estado_item_pedido) from public;
grant execute on function public.actualizar_estado_item_pedido(uuid, public.estado_item_pedido) to authenticated;

create or replace function public.pedidos_cocina_solo_estado()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.current_rol() = 'cocina' then
    if (to_jsonb(new) - 'estado' - 'enviado_cocina_en')
       is distinct from (to_jsonb(old) - 'estado' - 'enviado_cocina_en')
    then
      raise exception 'Cocina solo puede actualizar el estado del pedido';
    end if;
  end if;
  return new;
end;
$$;

create trigger pedidos_cocina_solo_estado_trigger
  before update on public.pedidos
  for each row
  execute function public.pedidos_cocina_solo_estado();
