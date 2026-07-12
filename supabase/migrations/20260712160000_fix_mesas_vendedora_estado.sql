-- Bloque 5 (Toma de pedido) necesita que la vendedora marque una mesa como
-- 'ocupada' al crear un pedido de canal 'mesa' (crearPedidoMesa). La política
-- de escritura de mesas del Bloque 4 (20260712130000) solo permite UPDATE a
-- admin, así que ese update quedaba bloqueado por RLS (0 filas afectadas,
-- sin error visible en supabase-js). Se agrega una policy estrecha para
-- vendedora + un trigger que le impide tocar cualquier columna que no sea
-- estado, para que esta ampliación no le dé control sobre numero/nombre/
-- capacidad/activa/sede_id (eso sigue siendo exclusivo de admin).

create policy mesas_vendedora_update_estado on public.mesas
  for update to authenticated
  using (public.current_rol() = 'vendedora' and sede_id = public.current_sede_id())
  with check (public.current_rol() = 'vendedora' and sede_id = public.current_sede_id());

create or replace function public.mesas_vendedora_solo_estado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_rol() = 'vendedora' then
    if new.numero is distinct from old.numero
       or new.nombre is distinct from old.nombre
       or new.capacidad is distinct from old.capacidad
       or new.activa is distinct from old.activa
       or new.sede_id is distinct from old.sede_id
    then
      raise exception 'La vendedora solo puede actualizar el estado de la mesa';
    end if;
  end if;
  return new;
end;
$$;

create trigger mesas_vendedora_solo_estado_trigger
  before update on public.mesas
  for each row
  execute function public.mesas_vendedora_solo_estado();
