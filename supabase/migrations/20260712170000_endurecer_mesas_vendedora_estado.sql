-- Ajuste al fix anterior (20260712160000): la policy y el trigger eran
-- demasiado permisivos. La vendedora podía cambiar el estado de una mesa
-- ocupada por otra persona, o de una mesa inactiva, hacia cualquier valor
-- de estado (no solo libre -> ocupada) mediante una llamada cruda al
-- cliente que evita crearPedidoMesa, reabriendo el mismo riesgo de doble
-- reserva que el fix anterior buscaba cerrar. Se restringe la transición
-- explícita, igual que ya se hace en pedidos_vendedora_update
-- (20260712150000). El trigger pasa de una lista blanca de columnas a una
-- comparación por diff de todo el registro (falla cerrado ante columnas
-- futuras de mesas, incluyendo creado_en), y se quita security definer
-- (innecesario: la función no hace nada que requiera privilegios elevados).

drop policy if exists mesas_vendedora_update_estado on public.mesas;

create policy mesas_vendedora_update_estado on public.mesas
  for update to authenticated
  using (
    public.current_rol() = 'vendedora'
    and sede_id = public.current_sede_id()
    and estado = 'libre'
    and activa = true
  )
  with check (
    public.current_rol() = 'vendedora'
    and sede_id = public.current_sede_id()
    and estado = 'ocupada'
  );

create or replace function public.mesas_vendedora_solo_estado()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.current_rol() = 'vendedora' then
    if (to_jsonb(new) - 'estado') is distinct from (to_jsonb(old) - 'estado') then
      raise exception 'La vendedora solo puede actualizar el estado de la mesa';
    end if;
  end if;
  return new;
end;
$$;
