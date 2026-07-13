-- Bloque 7 (fusiona Turnos + Cobro, decisión confirmada con el usuario: el
-- bloque original de Cobro dependía de datos que solo existen en Turnos —
-- pagos.turno_id no es nulo y CLAUDE.md §2.4 exige que el efectivo cobrado
-- sume al turno abierto). Cierra también pedidos_cajera_update, pendiente
-- desde el Bloque 5.
create type public.estado_turno as enum ('abierto', 'cerrado');
create type public.metodo_pago as enum ('efectivo', 'nequi', 'daviplata', 'bancolombia_qr', 'datafono', 'otro');
create type public.tipo_movimiento_caja as enum ('retiro', 'gasto', 'ingreso_extra');

create table public.turnos_caja (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references public.sedes (id),
  cajera_id uuid not null references public.usuarios (id),
  abierto_en timestamptz not null default now(),
  cerrado_en timestamptz,
  efectivo_inicial_cop bigint not null check (efectivo_inicial_cop >= 0),
  efectivo_declarado_cop bigint,
  esperado_cop bigint,
  diferencia_cop bigint,
  estado public.estado_turno not null default 'abierto',
  notas text
);

-- Un solo turno abierto por cajera a la vez: índice único parcial en vez de
-- un trigger, para que la propia base de datos rechace atómicamente una
-- segunda apertura concurrente (dos toques casi simultáneos en "Abrir
-- turno" no pueden ambos pasar).
create unique index turnos_caja_una_abierta_por_cajera
  on public.turnos_caja (cajera_id)
  where estado = 'abierto';

create table public.movimientos_caja (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references public.turnos_caja (id),
  tipo public.tipo_movimiento_caja not null,
  concepto text not null,
  monto_cop bigint not null check (monto_cop > 0),
  creado_en timestamptz not null default now()
);

create table public.pagos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos (id),
  turno_id uuid not null references public.turnos_caja (id),
  metodo public.metodo_pago not null,
  monto_cop bigint not null check (monto_cop > 0),
  referencia text,
  creado_en timestamptz not null default now()
);

create table public.impresiones (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos (id),
  tipo text not null,
  contenido_escpos text not null,
  enviado_en timestamptz,
  exito boolean,
  error text,
  creado_en timestamptz not null default now()
);

alter table public.turnos_caja enable row level security;
alter table public.movimientos_caja enable row level security;
alter table public.pagos enable row level security;
alter table public.impresiones enable row level security;

-- turnos_caja: cajera INSERT/SELECT sobre los suyos de su sede. UPDATE
-- restringido por policy a los 3 valores no-terminales... en realidad solo
-- hay una transición (abierto -> cerrado), así que WITH CHECK exige
-- exactamente 'cerrado' como destino y USING exige que el actual sea
-- 'abierto' (nunca se reabre uno cerrado).
create policy turnos_caja_cajera_insert on public.turnos_caja
  for insert to authenticated
  with check (
    public.current_rol() = 'cajera' and cajera_id = auth.uid() and sede_id = public.current_sede_id()
    and estado = 'abierto'
  );

create policy turnos_caja_cajera_select on public.turnos_caja
  for select to authenticated
  using (
    public.current_rol() = 'cajera' and cajera_id = auth.uid() and sede_id = public.current_sede_id()
  );

create policy turnos_caja_cajera_update on public.turnos_caja
  for update to authenticated
  using (
    public.current_rol() = 'cajera' and cajera_id = auth.uid() and sede_id = public.current_sede_id()
    and estado = 'abierto'
  )
  with check (
    public.current_rol() = 'cajera' and cajera_id = auth.uid() and sede_id = public.current_sede_id()
    and estado = 'cerrado'
  );

create policy turnos_caja_admin_select on public.turnos_caja
  for select to authenticated
  using (public.current_rol() = 'admin' and sede_id = public.current_sede_id());

-- Trigger de columnas: mismo patrón que pedidos_cocina_solo_estado del
-- Bloque 6 — la cajera solo puede cambiar los campos de cierre en su
-- UPDATE (nunca efectivo_inicial_cop después de creado, ni cajera_id/
-- sede_id/abierto_en/notas por esta vía).
create or replace function public.turnos_caja_cajera_solo_cierre()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.current_rol() = 'cajera' then
    if (to_jsonb(new) - 'estado' - 'cerrado_en' - 'efectivo_declarado_cop' - 'esperado_cop' - 'diferencia_cop')
       is distinct from
       (to_jsonb(old) - 'estado' - 'cerrado_en' - 'efectivo_declarado_cop' - 'esperado_cop' - 'diferencia_cop')
    then
      raise exception 'La cajera solo puede cerrar su turno, no editar sus demás campos';
    end if;
  end if;
  return new;
end;
$$;

create trigger turnos_caja_cajera_solo_cierre_trigger
  before update on public.turnos_caja
  for each row
  execute function public.turnos_caja_cajera_solo_cierre();

-- movimientos_caja: cajera INSERT/SELECT solo sobre su propio turno
-- abierto. Sin UPDATE ni DELETE (inmutable, igual que pedido_items no
-- permite corrección directa fuera de su RPC).
create policy movimientos_caja_cajera_insert on public.movimientos_caja
  for insert to authenticated
  with check (exists (
    select 1 from public.turnos_caja t where t.id = turno_id
      and public.current_rol() = 'cajera' and t.cajera_id = auth.uid() and t.estado = 'abierto'
  ));

create policy movimientos_caja_cajera_select on public.movimientos_caja
  for select to authenticated
  using (exists (
    select 1 from public.turnos_caja t where t.id = turno_id
      and (
        (public.current_rol() = 'cajera' and t.cajera_id = auth.uid())
        or (public.current_rol() = 'admin' and t.sede_id = public.current_sede_id())
      )
  ));

-- pagos: cajera INSERT/SELECT solo sobre su propio turno abierto y pedidos
-- de su sede. Sin UPDATE ni DELETE.
create policy pagos_cajera_insert on public.pagos
  for insert to authenticated
  with check (exists (
    select 1 from public.turnos_caja t where t.id = turno_id
      and public.current_rol() = 'cajera' and t.cajera_id = auth.uid() and t.estado = 'abierto'
  ));

create policy pagos_cajera_select on public.pagos
  for select to authenticated
  using (exists (
    select 1 from public.turnos_caja t where t.id = turno_id
      and (
        (public.current_rol() = 'cajera' and t.cajera_id = auth.uid())
        or (public.current_rol() = 'admin' and t.sede_id = public.current_sede_id())
      )
  ));

-- impresiones: cajera INSERT/SELECT/UPDATE (para el reintento) sobre
-- pedidos de su sede.
create policy impresiones_cajera_insert on public.impresiones
  for insert to authenticated
  with check (exists (
    select 1 from public.pedidos p where p.id = pedido_id
      and public.current_rol() = 'cajera' and p.sede_id = public.current_sede_id()
  ));

create policy impresiones_cajera_select on public.impresiones
  for select to authenticated
  using (exists (
    select 1 from public.pedidos p where p.id = pedido_id
      and (
        (public.current_rol() = 'cajera' and p.sede_id = public.current_sede_id())
        or (public.current_rol() = 'admin' and p.sede_id = public.current_sede_id())
      )
  ));

create policy impresiones_cajera_update on public.impresiones
  for update to authenticated
  using (exists (
    select 1 from public.pedidos p where p.id = pedido_id
      and public.current_rol() = 'cajera' and p.sede_id = public.current_sede_id()
  ))
  with check (exists (
    select 1 from public.pedidos p where p.id = pedido_id
      and public.current_rol() = 'cajera' and p.sede_id = public.current_sede_id()
  ));

-- pedidos_cajera_update: pendiente desde el Bloque 5. La cajera transiciona
-- un pedido listo/entregado a cobrado, nunca otro valor. Trigger de
-- columnas análogo a pedidos_cocina_solo_estado (Bloque 6): solo puede
-- cambiar `estado`.
create policy pedidos_cajera_update on public.pedidos
  for update to authenticated
  using (
    public.current_rol() = 'cajera' and sede_id = public.current_sede_id()
    and estado in ('listo', 'entregado')
  )
  with check (
    public.current_rol() = 'cajera' and sede_id = public.current_sede_id()
    and estado = 'cobrado'
  );

create or replace function public.pedidos_cajera_solo_estado()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.current_rol() = 'cajera' then
    if (to_jsonb(new) - 'estado') is distinct from (to_jsonb(old) - 'estado') then
      raise exception 'La cajera solo puede actualizar el estado del pedido';
    end if;
  end if;
  return new;
end;
$$;

create trigger pedidos_cajera_solo_estado_trigger
  before update on public.pedidos
  for each row
  execute function public.pedidos_cajera_solo_estado();
