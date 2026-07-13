-- Bloque B: la vendedora cancela su propio pedido antes de cobrar (ej. el
-- cliente se retira). Es una acción distinta de anular_pedido (Bloque 8),
-- que es EXCLUSIVA para que un admin revierta un pedido YA cobrado
-- (CLAUDE.md §2.2) y alimenta la tabla anulaciones/el reporte de
-- anulaciones. Reusar 'anulado' aquí rompería el invariante "todo pedido
-- anulado tiene fila en anulaciones". 'cancelado' se agrega en su propia
-- migración porque Postgres no permite usar un valor de enum recién creado
-- en la misma transacción que lo agrega.
alter type public.estado_pedido add value 'cancelado';
