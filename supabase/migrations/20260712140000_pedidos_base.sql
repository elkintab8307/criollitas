create type public.canal_pedido as enum ('mesa', 'domicilio', 'llevar');
create type public.estado_pedido as enum (
  'abierto', 'enviado_cocina', 'en_preparacion', 'listo', 'entregado', 'cobrado', 'cerrado', 'anulado'
);
create type public.estado_item_pedido as enum ('pendiente', 'en_preparacion', 'listo', 'entregado');

create table public.clientes_domicilio (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references public.sedes (id),
  nombre text not null,
  telefono text not null,
  direccion text not null,
  referencia text,
  notas text,
  creado_en timestamptz not null default now(),
  unique (sede_id, telefono)
);

create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references public.sedes (id),
  -- Sin unicidad a nivel de BD: se calcula por sede+día en la Server Action
  -- (ver lib/pedido/numeroCorto.ts); una carrera entre dos pedidos simultáneos
  -- de la misma sede en el mismo instante podría repetir número. Riesgo bajo
  -- a la escala de un solo local; se documenta en vez de resolverse con una
  -- función SQL por ahora (YAGNI).
  numero_corto integer not null,
  canal public.canal_pedido not null,
  mesa_id uuid references public.mesas (id),
  cliente_id uuid references public.clientes_domicilio (id),
  vendedora_id uuid not null references public.usuarios (id),
  estado public.estado_pedido not null default 'abierto',
  subtotal_cop bigint not null default 0,
  descuento_cop bigint not null default 0,
  propina_cop bigint not null default 0,
  total_cop bigint not null default 0,
  notas text,
  creado_en timestamptz not null default now(),
  cerrado_en timestamptz
);

create table public.pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos (id),
  producto_id uuid not null references public.productos (id),
  cantidad integer not null check (cantidad > 0),
  precio_unit_cop bigint not null,
  subtotal_cop bigint not null,
  notas text,
  estado_item public.estado_item_pedido not null default 'pendiente',
  tiempo_listo_en timestamptz
);

create table public.pedido_item_mods (
  id uuid primary key default gen_random_uuid(),
  pedido_item_id uuid not null references public.pedido_items (id),
  modificador_id uuid not null references public.modificadores (id),
  precio_delta_cop bigint not null
);

create index pedidos_sede_estado on public.pedidos (sede_id, estado);
create index pedidos_vendedora on public.pedidos (vendedora_id, estado);
create index pedido_items_pedido on public.pedido_items (pedido_id);
create index pedido_item_mods_item on public.pedido_item_mods (pedido_item_id);

alter table public.clientes_domicilio enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_items enable row level security;
alter table public.pedido_item_mods enable row level security;

-- clientes_domicilio: vendedora y admin de la sede ven/crean/actualizan
-- (actualizar hace falta para "reutilizar por teléfono" vía upsert). Sin
-- DELETE: nunca se borra un cliente.
create policy clientes_domicilio_select on public.clientes_domicilio
  for select to authenticated using (sede_id = public.current_sede_id());
create policy clientes_domicilio_insert on public.clientes_domicilio
  for insert to authenticated
  with check (sede_id = public.current_sede_id() and public.current_rol() in ('vendedora', 'admin'));
create policy clientes_domicilio_update on public.clientes_domicilio
  for update to authenticated
  using (sede_id = public.current_sede_id() and public.current_rol() in ('vendedora', 'admin'))
  with check (sede_id = public.current_sede_id() and public.current_rol() in ('vendedora', 'admin'));

-- pedidos
create policy pedidos_vendedora_select on public.pedidos
  for select to authenticated
  using (
    public.current_rol() = 'vendedora' and vendedora_id = auth.uid() and sede_id = public.current_sede_id()
  );
create policy pedidos_vendedora_insert on public.pedidos
  for insert to authenticated
  with check (
    public.current_rol() = 'vendedora' and vendedora_id = auth.uid() and sede_id = public.current_sede_id()
  );
create policy pedidos_vendedora_update on public.pedidos
  for update to authenticated
  using (
    public.current_rol() = 'vendedora' and vendedora_id = auth.uid() and sede_id = public.current_sede_id()
    and estado not in ('cobrado', 'cerrado', 'anulado')
  )
  with check (
    public.current_rol() = 'vendedora' and vendedora_id = auth.uid() and sede_id = public.current_sede_id()
  );

create policy pedidos_cajera_select on public.pedidos
  for select to authenticated
  using (
    public.current_rol() = 'cajera' and sede_id = public.current_sede_id()
    and estado in ('listo', 'entregado', 'cobrado')
  );

create policy pedidos_cocina_select on public.pedidos
  for select to authenticated
  using (
    public.current_rol() = 'cocina' and sede_id = public.current_sede_id()
    and estado in ('enviado_cocina', 'en_preparacion', 'listo')
  );

create policy pedidos_admin_all on public.pedidos
  for all to authenticated
  using (public.current_rol() = 'admin' and sede_id = public.current_sede_id())
  with check (public.current_rol() = 'admin' and sede_id = public.current_sede_id());

-- pedido_items: heredan permisos vía join a pedidos
create policy pedido_items_select on public.pedido_items
  for select to authenticated using (exists (
    select 1 from public.pedidos p where p.id = pedido_id and (
      (public.current_rol() = 'vendedora' and p.vendedora_id = auth.uid() and p.sede_id = public.current_sede_id())
      or (public.current_rol() = 'cajera' and p.sede_id = public.current_sede_id() and p.estado in ('listo', 'entregado', 'cobrado'))
      or (public.current_rol() = 'cocina' and p.sede_id = public.current_sede_id() and p.estado in ('enviado_cocina', 'en_preparacion', 'listo'))
      or (public.current_rol() = 'admin' and p.sede_id = public.current_sede_id())
    )
  ));

create policy pedido_items_vendedora_insert on public.pedido_items
  for insert to authenticated
  with check (exists (
    select 1 from public.pedidos p where p.id = pedido_id
      and public.current_rol() = 'vendedora' and p.vendedora_id = auth.uid()
      and p.sede_id = public.current_sede_id() and p.estado not in ('cobrado', 'cerrado', 'anulado')
  ));

create policy pedido_items_cocina_update on public.pedido_items
  for update to authenticated
  using (exists (
    select 1 from public.pedidos p where p.id = pedido_id
      and public.current_rol() = 'cocina' and p.sede_id = public.current_sede_id()
      and p.estado in ('enviado_cocina', 'en_preparacion', 'listo')
  ))
  with check (exists (
    select 1 from public.pedidos p where p.id = pedido_id
      and public.current_rol() = 'cocina' and p.sede_id = public.current_sede_id()
  ));

create policy pedido_items_admin_all on public.pedido_items
  for all to authenticated
  using (exists (
    select 1 from public.pedidos p where p.id = pedido_id and public.current_rol() = 'admin' and p.sede_id = public.current_sede_id()
  ))
  with check (exists (
    select 1 from public.pedidos p where p.id = pedido_id and public.current_rol() = 'admin' and p.sede_id = public.current_sede_id()
  ));

-- Cocina (y cualquier otro rol) solo puede actualizar el estado del ítem y su
-- marca de tiempo, nunca cantidad/producto/precio vía la API — ajustes reales
-- se modelan como filas nuevas o una función con service role, no un UPDATE
-- libre (CLAUDE.md §6.2: "cocina: UPDATE solo del campo estado_item").
revoke update on public.pedido_items from authenticated;
grant update (estado_item, tiempo_listo_en) on public.pedido_items to authenticated;

-- pedido_item_mods: heredan vía join a pedido_items→pedidos
create policy pedido_item_mods_select on public.pedido_item_mods
  for select to authenticated using (exists (
    select 1 from public.pedido_items pi join public.pedidos p on p.id = pi.pedido_id
    where pi.id = pedido_item_id and (
      (public.current_rol() = 'vendedora' and p.vendedora_id = auth.uid() and p.sede_id = public.current_sede_id())
      or (public.current_rol() = 'cajera' and p.sede_id = public.current_sede_id() and p.estado in ('listo', 'entregado', 'cobrado'))
      or (public.current_rol() = 'cocina' and p.sede_id = public.current_sede_id() and p.estado in ('enviado_cocina', 'en_preparacion', 'listo'))
      or (public.current_rol() = 'admin' and p.sede_id = public.current_sede_id())
    )
  ));

create policy pedido_item_mods_vendedora_insert on public.pedido_item_mods
  for insert to authenticated
  with check (exists (
    select 1 from public.pedido_items pi join public.pedidos p on p.id = pi.pedido_id
    where pi.id = pedido_item_id and public.current_rol() = 'vendedora' and p.vendedora_id = auth.uid()
      and p.sede_id = public.current_sede_id() and p.estado not in ('cobrado', 'cerrado', 'anulado')
  ));

create policy pedido_item_mods_admin_all on public.pedido_item_mods
  for all to authenticated
  using (exists (
    select 1 from public.pedido_items pi join public.pedidos p on p.id = pi.pedido_id
    where pi.id = pedido_item_id and public.current_rol() = 'admin' and p.sede_id = public.current_sede_id()
  ))
  with check (exists (
    select 1 from public.pedido_items pi join public.pedidos p on p.id = pi.pedido_id
    where pi.id = pedido_item_id and public.current_rol() = 'admin' and p.sede_id = public.current_sede_id()
  ));

alter publication supabase_realtime add table public.pedidos;
alter publication supabase_realtime add table public.pedido_items;
