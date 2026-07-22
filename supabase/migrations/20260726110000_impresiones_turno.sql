-- Impresiones de caja no ligadas a un pedido: la apertura del cajón de
-- dinero (para contar efectivo) y la tirilla de arqueo al cerrar turno
-- (CLAUDE.md §2.4, §2.6) se registran contra el TURNO, no contra un
-- pedido. `pedido_id` deja de ser obligatorio y se agrega `turno_id`;
-- exactamente una de las dos referencias debe estar presente en cada fila.
alter table public.impresiones
  alter column pedido_id drop not null,
  add column turno_id uuid references public.turnos_caja (id);

alter table public.impresiones
  add constraint impresiones_pedido_o_turno
  check ((pedido_id is not null) <> (turno_id is not null));

drop policy impresiones_cajera_insert on public.impresiones;
drop policy impresiones_cajera_select on public.impresiones;
drop policy impresiones_cajera_update on public.impresiones;

create policy impresiones_cajera_insert on public.impresiones
  for insert to authenticated
  with check (
    exists (
      select 1 from public.pedidos p where p.id = pedido_id
        and public.current_rol() = 'cajera' and p.sede_id = public.current_sede_id()
    )
    or exists (
      select 1 from public.turnos_caja t where t.id = turno_id
        and public.current_rol() = 'cajera' and t.cajera_id = auth.uid()
    )
  );

create policy impresiones_cajera_select on public.impresiones
  for select to authenticated
  using (
    exists (
      select 1 from public.pedidos p where p.id = pedido_id
        and (
          (public.current_rol() = 'cajera' and p.sede_id = public.current_sede_id())
          or (public.current_rol() = 'admin' and p.sede_id = public.current_sede_id())
        )
    )
    or exists (
      select 1 from public.turnos_caja t where t.id = turno_id
        and (
          (public.current_rol() = 'cajera' and t.cajera_id = auth.uid())
          or (public.current_rol() = 'admin' and t.sede_id = public.current_sede_id())
        )
    )
  );

create policy impresiones_cajera_update on public.impresiones
  for update to authenticated
  using (
    exists (
      select 1 from public.pedidos p where p.id = pedido_id
        and public.current_rol() = 'cajera' and p.sede_id = public.current_sede_id()
    )
    or exists (
      select 1 from public.turnos_caja t where t.id = turno_id
        and public.current_rol() = 'cajera' and t.cajera_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.pedidos p where p.id = pedido_id
        and public.current_rol() = 'cajera' and p.sede_id = public.current_sede_id()
    )
    or exists (
      select 1 from public.turnos_caja t where t.id = turno_id
        and public.current_rol() = 'cajera' and t.cajera_id = auth.uid()
    )
  );
