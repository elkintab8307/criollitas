-- Sigue devolviendo 400 P0001 (el mensaje propio del RPC) para una llamada
-- anonima incluso tras revocar de PUBLIC en 20260713110000 -- confirma que
-- Supabase concede EXECUTE a anon directamente por privilegio por defecto
-- al crear la función (ALTER DEFAULT PRIVILEGES a nivel de proyecto), no
-- vía PUBLIC. RLS ya bloqueaba la escritura (0 filas, de ahí la excepción),
-- así que no hubo mutación de datos en ningún momento -- pero la
-- superficie real era "RLS es el único filtro", no "el grant también
-- filtra", que es una postura más débil de lo que parecía. Se revoca el
-- execute de anon explícitamente para que ambas capas filtren.
revoke execute on function public.actualizar_estado_item_pedido(uuid, public.estado_item_pedido) from anon;
