-- Bloque E, hallazgo de verificación en vivo: pedidos_cajera_solo_estado
-- (Bloque 7) restringe a la cajera a tocar solo `estado`/`motivo_cancelacion`
-- en CUALQUIER UPDATE de pedidos, sin importar de quién es el pedido. Ese
-- trigger se diseñó cuando la cajera nunca era dueña de un pedido (solo
-- cobraba/cancelaba pedidos ajenos). Ahora que puede tomar sus propios
-- pedidos (Bloque E), recalcular_totales_pedido necesita poder escribir
-- también subtotal_cop/total_cop en el pedido que ella misma creó -- igual
-- que ya puede hacer la vendedora, que no tiene esta restricción de
-- columnas en absoluto.
--
-- Fix: la restricción de columnas solo aplica cuando la cajera NO es la
-- dueña del pedido (vendedora_id != auth.uid()) -- ahí sigue protegiendo
-- contra que toque campos fuera de cobro/cancelación de un pedido ajeno.
-- Sobre su propio pedido, queda con la misma libertad que la vendedora.
create or replace function public.pedidos_cajera_solo_estado()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.current_rol() = 'cajera' and old.vendedora_id is distinct from auth.uid() then
    if (to_jsonb(new) - 'estado' - 'motivo_cancelacion') is distinct from (to_jsonb(old) - 'estado' - 'motivo_cancelacion') then
      raise exception 'La cajera solo puede actualizar el estado del pedido';
    end if;
  end if;
  return new;
end;
$$;
