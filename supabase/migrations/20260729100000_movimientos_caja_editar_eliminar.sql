-- Decisión explícita del usuario (2026-07-29): los movimientos_caja dejan
-- de ser inmutables. La cajera ahora puede editar/eliminar un movimiento
-- que ella misma registró, pero SOLO mientras su turno sigue abierto --
-- mismo criterio que usan los pedidos (se pueden cancelar antes de
-- cobrar, nunca después): una vez cerrado el turno, esos números ya
-- quedaron cuadrados y reconciliados, y editarlos después dejaría ese
-- arqueo desactualizado frente a sus propios datos. El trigger de
-- auditoría (20260715100000_auditoria_anulaciones_base.sql) ya está
-- adjunto a movimientos_caja, así que UPDATE/DELETE quedan igual de
-- trazables en `auditoria` -- no se pierde el rastro por permitir esto.
create policy movimientos_caja_cajera_update on public.movimientos_caja
  for update to authenticated
  using (exists (
    select 1 from public.turnos_caja t where t.id = turno_id
      and public.current_rol() = 'cajera' and t.cajera_id = auth.uid() and t.estado = 'abierto'
  ))
  with check (exists (
    select 1 from public.turnos_caja t where t.id = turno_id
      and public.current_rol() = 'cajera' and t.cajera_id = auth.uid() and t.estado = 'abierto'
  ));

create policy movimientos_caja_cajera_delete on public.movimientos_caja
  for delete to authenticated
  using (exists (
    select 1 from public.turnos_caja t where t.id = turno_id
      and public.current_rol() = 'cajera' and t.cajera_id = auth.uid() and t.estado = 'abierto'
  ));
