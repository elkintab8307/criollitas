-- Bloque 9b: reportes de productos y categorías más vendidos. Ambas
-- funciones llevan el guard doble (current_rol()='admin' + sede_id=
-- current_sede_id()) directamente en su WHERE desde este primer commit
-- -- lección del Bloque 9a, donde 4 de 6 funciones dependían solo de RLS
-- y tuvieron que corregirse en una migración posterior. Ninguna filtra
-- por productos.activo/categorias.activa: un producto o categoría
-- descontinuado (soft-delete) debe seguir apareciendo en reportes
-- históricos con su nombre real.
create or replace function public.fn_reporte_productos(
  p_desde timestamptz,
  p_hasta timestamptz
)
returns table (
  producto_id uuid,
  nombre text,
  categoria_id uuid,
  categoria_nombre text,
  unidades bigint,
  ingreso_cop bigint
)
language sql
security invoker
set search_path = public
stable
as $$
  select pr.id as producto_id, pr.nombre, pr.categoria_id, c.nombre as categoria_nombre,
    sum(pi.cantidad)::bigint as unidades, sum(pi.subtotal_cop)::bigint as ingreso_cop
  from public.pedido_items pi
  join public.pedidos p on p.id = pi.pedido_id
  join public.productos pr on pr.id = pi.producto_id
  join public.categorias c on c.id = pr.categoria_id
  where p.estado = 'cobrado'
    and p.creado_en >= p_desde
    and p.creado_en < p_hasta
    and p.sede_id = public.current_sede_id()
    and public.current_rol() = 'admin'
  group by pr.id, pr.nombre, pr.categoria_id, c.nombre
  order by ingreso_cop desc;
$$;

revoke execute on function public.fn_reporte_productos(timestamptz, timestamptz) from public;
revoke execute on function public.fn_reporte_productos(timestamptz, timestamptz) from anon;
grant execute on function public.fn_reporte_productos(timestamptz, timestamptz) to authenticated;

create or replace function public.fn_reporte_categorias(
  p_desde timestamptz,
  p_hasta timestamptz
)
returns table (
  categoria_id uuid,
  categoria_nombre text,
  unidades bigint,
  ingreso_cop bigint,
  porcentaje numeric
)
language sql
security invoker
set search_path = public
stable
as $$
  with totales as (
    select c.id as categoria_id, c.nombre as categoria_nombre,
      sum(pi.cantidad)::bigint as unidades, sum(pi.subtotal_cop)::bigint as ingreso_cop
    from public.pedido_items pi
    join public.pedidos p on p.id = pi.pedido_id
    join public.productos pr on pr.id = pi.producto_id
    join public.categorias c on c.id = pr.categoria_id
    where p.estado = 'cobrado'
      and p.creado_en >= p_desde
      and p.creado_en < p_hasta
      and p.sede_id = public.current_sede_id()
      and public.current_rol() = 'admin'
    group by c.id, c.nombre
  )
  select categoria_id, categoria_nombre, unidades, ingreso_cop,
    round(ingreso_cop * 100.0 / nullif(sum(ingreso_cop) over (), 0), 2) as porcentaje
  from totales;
$$;

revoke execute on function public.fn_reporte_categorias(timestamptz, timestamptz) from public;
revoke execute on function public.fn_reporte_categorias(timestamptz, timestamptz) from anon;
grant execute on function public.fn_reporte_categorias(timestamptz, timestamptz) to authenticated;
