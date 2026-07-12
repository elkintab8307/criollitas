create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references public.sedes (id),
  nombre text not null,
  orden integer not null default 0,
  activa boolean not null default true,
  imagen_url text,
  creado_en timestamptz not null default now()
);

create table public.productos (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references public.sedes (id),
  categoria_id uuid not null references public.categorias (id),
  nombre text not null,
  descripcion text,
  precio_cop bigint not null check (precio_cop > 0),
  imagen_url text,
  activo boolean not null default true,
  tiempo_prep_min integer,
  es_combo boolean not null default false,
  creado_en timestamptz not null default now()
);

-- grupo: agrupa opciones excluyentes (ej. "Queso"); extensión al modelo §7,
-- reconciliar CLAUDE.md en la Task 9.
create table public.modificadores (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos (id),
  grupo text,
  nombre text not null,
  precio_delta_cop bigint not null default 0,
  obligatorio boolean not null default false,
  max_seleccion integer not null default 1 check (max_seleccion >= 1),
  activo boolean not null default true
);

create index productos_sede_categoria on public.productos (sede_id, categoria_id, activo);
create index modificadores_producto on public.modificadores (producto_id, activo);

alter table public.categorias enable row level security;
alter table public.productos enable row level security;
alter table public.modificadores enable row level security;

-- Lectura: personal autenticado de la sede
create policy categorias_select on public.categorias
  for select to authenticated using (sede_id = public.current_sede_id());
create policy productos_select on public.productos
  for select to authenticated using (sede_id = public.current_sede_id());
create policy modificadores_select on public.modificadores
  for select to authenticated using (exists (
    select 1 from public.productos p
    where p.id = producto_id and p.sede_id = public.current_sede_id()
  ));

-- Escritura: solo admin de la sede. Sin policy de DELETE (soft delete).
create policy categorias_admin_insert on public.categorias
  for insert to authenticated
  with check (public.current_rol() = 'admin' and sede_id = public.current_sede_id());
create policy categorias_admin_update on public.categorias
  for update to authenticated
  using (public.current_rol() = 'admin' and sede_id = public.current_sede_id())
  with check (public.current_rol() = 'admin' and sede_id = public.current_sede_id());
create policy productos_admin_insert on public.productos
  for insert to authenticated
  with check (public.current_rol() = 'admin' and sede_id = public.current_sede_id());
create policy productos_admin_update on public.productos
  for update to authenticated
  using (public.current_rol() = 'admin' and sede_id = public.current_sede_id())
  with check (public.current_rol() = 'admin' and sede_id = public.current_sede_id());
create policy modificadores_admin_insert on public.modificadores
  for insert to authenticated
  with check (public.current_rol() = 'admin' and exists (
    select 1 from public.productos p
    where p.id = producto_id and p.sede_id = public.current_sede_id()
  ));
create policy modificadores_admin_update on public.modificadores
  for update to authenticated
  using (public.current_rol() = 'admin' and exists (
    select 1 from public.productos p
    where p.id = producto_id and p.sede_id = public.current_sede_id()
  ))
  with check (public.current_rol() = 'admin' and exists (
    select 1 from public.productos p
    where p.id = producto_id and p.sede_id = public.current_sede_id()
  ));
