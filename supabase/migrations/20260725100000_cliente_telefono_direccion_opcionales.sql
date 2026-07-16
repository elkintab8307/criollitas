-- Decisión del usuario: al tomar un pedido para llevar (y ahora también
-- domicilio, mismo formulario) solo el nombre del cliente es obligatorio --
-- teléfono y dirección pasan a ser opcionales. El unique (sede_id,
-- telefono) existente no estorba: en Postgres los NULL nunca chocan entre
-- sí, así que múltiples clientes sin teléfono conviven sin conflicto; el
-- upsert por teléfono solo aplica cuando el teléfono sí se diligenció
-- (app/(vendedora)/inicio/actions.ts).
alter table public.clientes_domicilio
  alter column telefono drop not null,
  alter column direccion drop not null;
