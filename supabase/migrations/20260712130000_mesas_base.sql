create type public.estado_mesa as enum ('libre', 'ocupada', 'reservada');

create table public.mesas (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references public.sedes (id),
  numero integer not null check (numero > 0),
  nombre text not null,
  capacidad integer not null default 4 check (capacidad between 1 and 20),
  activa boolean not null default true,
  estado public.estado_mesa not null default 'libre',
  creado_en timestamptz not null default now(),
  unique (sede_id, numero)
);

create index mesas_sede_activa on public.mesas (sede_id, activa);

alter table public.mesas enable row level security;

-- Lectura: personal autenticado de la sede
create policy mesas_select on public.mesas
  for select to authenticated using (sede_id = public.current_sede_id());

-- Escritura: solo admin de la sede. Sin policy de DELETE (soft delete).
create policy mesas_admin_insert on public.mesas
  for insert to authenticated
  with check (public.current_rol() = 'admin' and sede_id = public.current_sede_id());
create policy mesas_admin_update on public.mesas
  for update to authenticated
  using (public.current_rol() = 'admin' and sede_id = public.current_sede_id())
  with check (public.current_rol() = 'admin' and sede_id = public.current_sede_id());

-- Realtime: emitir cambios de fila de mesas (RLS sigue aplicando por suscriptor)
alter publication supabase_realtime add table public.mesas;

-- Seed idempotente de 5 mesas
insert into public.mesas (id, sede_id, numero, nombre, capacidad) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000001', 1, 'Mesa 1', 4),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000001', 2, 'Mesa 2', 4),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000001', 3, 'Mesa 3', 4),
  ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-000000000001', 4, 'Mesa 4', 4),
  ('00000000-0000-4000-8000-000000000405', '00000000-0000-4000-8000-000000000001', 5, 'Mesa 5', 4)
on conflict (id) do nothing;
