-- La politica anterior (20260712140000) solo protegia la fila ACTUAL en
-- USING; el WITH CHECK no restringia a que estado podia moverla la propia
-- vendedora. Una vendedora podia, con un UPDATE crudo via PostgREST, poner
-- su propio pedido en 'cobrado'/'cerrado'/'anulado' sin pasar por el flujo
-- de caja (bloque 7) ni de anulacion (bloque 10). CLAUDE.md SS13.2: nunca
-- confiar en el rol/estado que declara el cliente para autorizar.
drop policy if exists pedidos_vendedora_update on public.pedidos;

create policy pedidos_vendedora_update on public.pedidos
  for update to authenticated
  using (
    public.current_rol() = 'vendedora' and vendedora_id = auth.uid() and sede_id = public.current_sede_id()
    and estado not in ('cobrado', 'cerrado', 'anulado')
  )
  with check (
    public.current_rol() = 'vendedora' and vendedora_id = auth.uid() and sede_id = public.current_sede_id()
    and estado in ('abierto', 'enviado_cocina', 'en_preparacion', 'listo', 'entregado')
  );
