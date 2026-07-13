-- Bloque 9a: reportes de ventas. "current_rol() = 'admin'" se agrega
-- explícitamente en cada función/vista porque la RLS de pedidos/pagos por
-- sí sola NO basta: Cajera también tiene SELECT sobre pedidos en estado
-- 'cobrado' (necesario para su flujo de cobro), pero CLAUDE.md §2.1 le
-- niega explícitamente "ver reportes históricos" — sin este guard, una
-- Cajera podría llamar estos RPC y ver ventas agregadas de toda la sede.
create view public.vw_ventas_diarias as
select
  p.sede_id,
  (p.creado_en at time zone 'America/Bogota')::date as dia,
  p.canal,
  count(*) as num_pedidos,
  sum(p.subtotal_cop) as subtotal_cop,
  sum(p.descuento_cop) as descuento_cop,
  sum(p.propina_cop) as propina_cop,
  sum(p.total_cop) as total_cop
from public.pedidos p
where p.estado = 'cobrado'
  and public.current_rol() = 'admin'
group by p.sede_id, (p.creado_en at time zone 'America/Bogota')::date, p.canal;

revoke all on public.vw_ventas_diarias from public;
revoke all on public.vw_ventas_diarias from anon;
grant select on public.vw_ventas_diarias to authenticated;

create or replace function public.fn_reporte_ventas_rango(
  p_desde timestamptz,
  p_hasta timestamptz,
  p_canal public.canal_pedido default null
)
returns table (
  dia date,
  canal public.canal_pedido,
  num_pedidos int,
  subtotal_cop bigint,
  descuento_cop bigint,
  propina_cop bigint,
  total_cop bigint
)
language sql
security invoker
set search_path = public
stable
as $$
  select v.dia, v.canal, v.num_pedidos::int, v.subtotal_cop, v.descuento_cop, v.propina_cop, v.total_cop
  from public.vw_ventas_diarias v
  where v.dia >= (p_desde at time zone 'America/Bogota')::date
    and v.dia < (p_hasta at time zone 'America/Bogota')::date
    and (p_canal is null or v.canal = p_canal)
  order by v.dia;
$$;

revoke execute on function public.fn_reporte_ventas_rango(timestamptz, timestamptz, public.canal_pedido) from public;
revoke execute on function public.fn_reporte_ventas_rango(timestamptz, timestamptz, public.canal_pedido) from anon;
grant execute on function public.fn_reporte_ventas_rango(timestamptz, timestamptz, public.canal_pedido) to authenticated;

create or replace function public.fn_reporte_mapa_calor_horas(
  p_desde timestamptz,
  p_hasta timestamptz
)
returns table (
  dia_semana int,
  hora int,
  promedio_cop bigint,
  num_pedidos bigint
)
language sql
security invoker
set search_path = public
stable
as $$
  select
    extract(dow from (p.creado_en at time zone 'America/Bogota'))::int as dia_semana,
    extract(hour from (p.creado_en at time zone 'America/Bogota'))::int as hora,
    round(avg(p.total_cop))::bigint as promedio_cop,
    count(*) as num_pedidos
  from public.pedidos p
  where p.estado = 'cobrado'
    and p.creado_en >= p_desde
    and p.creado_en < p_hasta
    and public.current_rol() = 'admin'
  group by 1, 2;
$$;

revoke execute on function public.fn_reporte_mapa_calor_horas(timestamptz, timestamptz) from public;
revoke execute on function public.fn_reporte_mapa_calor_horas(timestamptz, timestamptz) from anon;
grant execute on function public.fn_reporte_mapa_calor_horas(timestamptz, timestamptz) to authenticated;

create or replace function public.fn_reporte_ticket_promedio_global(
  p_desde timestamptz,
  p_hasta timestamptz
)
returns table (
  ticket_promedio_cop bigint,
  num_pedidos bigint
)
language sql
security invoker
set search_path = public
stable
as $$
  select coalesce(round(avg(p.total_cop))::bigint, 0), count(*)
  from public.pedidos p
  where p.estado = 'cobrado'
    and p.creado_en >= p_desde
    and p.creado_en < p_hasta
    and public.current_rol() = 'admin';
$$;

revoke execute on function public.fn_reporte_ticket_promedio_global(timestamptz, timestamptz) from public;
revoke execute on function public.fn_reporte_ticket_promedio_global(timestamptz, timestamptz) from anon;
grant execute on function public.fn_reporte_ticket_promedio_global(timestamptz, timestamptz) to authenticated;

create or replace function public.fn_reporte_ticket_promedio_canal(
  p_desde timestamptz,
  p_hasta timestamptz
)
returns table (
  canal public.canal_pedido,
  ticket_promedio_cop bigint,
  num_pedidos bigint
)
language sql
security invoker
set search_path = public
stable
as $$
  select p.canal, round(avg(p.total_cop))::bigint, count(*)
  from public.pedidos p
  where p.estado = 'cobrado'
    and p.creado_en >= p_desde
    and p.creado_en < p_hasta
    and public.current_rol() = 'admin'
  group by p.canal;
$$;

revoke execute on function public.fn_reporte_ticket_promedio_canal(timestamptz, timestamptz) from public;
revoke execute on function public.fn_reporte_ticket_promedio_canal(timestamptz, timestamptz) from anon;
grant execute on function public.fn_reporte_ticket_promedio_canal(timestamptz, timestamptz) to authenticated;

create or replace function public.fn_reporte_metodos_pago(
  p_desde timestamptz,
  p_hasta timestamptz
)
returns table (
  metodo public.metodo_pago,
  total_cop bigint,
  num_pagos int,
  porcentaje numeric
)
language sql
security invoker
set search_path = public
stable
as $$
  with totales as (
    select pg.metodo, sum(pg.monto_cop) as total_cop, count(*)::int as num_pagos
    from public.pagos pg
    join public.pedidos p on p.id = pg.pedido_id
    where p.estado = 'cobrado'
      and p.creado_en >= p_desde
      and p.creado_en < p_hasta
      and public.current_rol() = 'admin'
    group by pg.metodo
  )
  select metodo, total_cop, num_pagos,
    round(total_cop * 100.0 / nullif(sum(total_cop) over (), 0), 2) as porcentaje
  from totales;
$$;

revoke execute on function public.fn_reporte_metodos_pago(timestamptz, timestamptz) from public;
revoke execute on function public.fn_reporte_metodos_pago(timestamptz, timestamptz) from anon;
grant execute on function public.fn_reporte_metodos_pago(timestamptz, timestamptz) to authenticated;

create or replace function public.fn_reporte_canales(
  p_desde timestamptz,
  p_hasta timestamptz
)
returns table (
  canal public.canal_pedido,
  total_cop bigint,
  num_pedidos int,
  porcentaje numeric
)
language sql
security invoker
set search_path = public
stable
as $$
  with totales as (
    select v.canal, sum(v.total_cop) as total_cop, sum(v.num_pedidos)::int as num_pedidos
    from public.vw_ventas_diarias v
    where v.dia >= (p_desde at time zone 'America/Bogota')::date
      and v.dia < (p_hasta at time zone 'America/Bogota')::date
    group by v.canal
  )
  select canal, total_cop, num_pedidos,
    round(total_cop * 100.0 / nullif(sum(total_cop) over (), 0), 2) as porcentaje
  from totales;
$$;

revoke execute on function public.fn_reporte_canales(timestamptz, timestamptz) from public;
revoke execute on function public.fn_reporte_canales(timestamptz, timestamptz) from anon;
grant execute on function public.fn_reporte_canales(timestamptz, timestamptz) to authenticated;
