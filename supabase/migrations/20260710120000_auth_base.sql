-- Enum de roles
create type public.rol_usuario as enum ('admin', 'cajera', 'vendedora', 'cocina');

-- Sedes
create table public.sedes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  direccion text,
  telefono text,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);

-- Usuarios (perfil operativo sobre auth.users)
create table public.usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  sede_id uuid not null references public.sedes (id),
  nombre text not null,
  rol public.rol_usuario not null,
  pin_hash text,
  activo boolean not null default true,
  avatar_url text,
  creado_en timestamptz not null default now()
);

-- Intentos de PIN (rate limit). Solo service role la toca.
create table public.pin_intentos (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  exito boolean not null,
  creado_en timestamptz not null default now()
);
create index pin_intentos_usuario_reciente
  on public.pin_intentos (usuario_id, creado_en desc);

-- Helpers de JWT
create or replace function public.current_rol() returns text
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb
         -> 'user_metadata' ->> 'rol'
$$;

create or replace function public.current_sede_id() returns uuid
language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb
          -> 'user_metadata' ->> 'sede_id')::uuid
$$;

-- RLS
alter table public.sedes enable row level security;
alter table public.usuarios enable row level security;
alter table public.pin_intentos enable row level security;

-- sedes: leer la propia sede; escribir solo admin de esa sede
create policy sedes_select on public.sedes
  for select to authenticated
  using (id = public.current_sede_id());
create policy sedes_admin_all on public.sedes
  for all to authenticated
  using (public.current_rol() = 'admin' and id = public.current_sede_id())
  with check (public.current_rol() = 'admin' and id = public.current_sede_id());

-- usuarios: cada quien su fila; admin ve/gestiona su sede. pin_hash nunca via API:
revoke select (pin_hash) on public.usuarios from anon, authenticated;
create policy usuarios_self_select on public.usuarios
  for select to authenticated
  using (id = auth.uid());
create policy usuarios_admin_select on public.usuarios
  for select to authenticated
  using (public.current_rol() = 'admin' and sede_id = public.current_sede_id());
create policy usuarios_admin_write on public.usuarios
  for all to authenticated
  using (public.current_rol() = 'admin' and sede_id = public.current_sede_id())
  with check (public.current_rol() = 'admin' and sede_id = public.current_sede_id());

-- pin_intentos: ninguna policy => solo service role accede.
