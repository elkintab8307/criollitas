-- Bloque D: el establecimiento no usa el flujo de cocina -- un pedido debe
-- llegar directo a la cola de cobro sin que nadie mueva ítems por el KDS.
-- Se modela como config por sede (no una constante global) porque el
-- sistema es multi-sede desde el diseño (CLAUDE.md §1); una sede futura
-- que sí use cocina no requiere cambio de código, solo esta fila en false.
alter table public.sedes add column usa_cocina boolean not null default true;

-- La sede de Armenia (la única real hoy) es la que el usuario pidió sin
-- cocina.
update public.sedes set usa_cocina = false where id = '00000000-0000-4000-8000-000000000001';
