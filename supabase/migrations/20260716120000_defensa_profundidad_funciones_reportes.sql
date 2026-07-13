-- Consistencia de defensa en profundidad (seguimiento de
-- 20260716110000_fix_ventas_diarias_sede_scope.sql): esa migracion agrego
-- p.sede_id = current_sede_id() explicito a vw_ventas_diarias y a las dos
-- funciones que dependen de ella (fn_reporte_ventas_rango, fn_reporte_canales).
-- Las otras 4 funciones de reportes de ventas consultan pedidos/pagos
-- directamente (no via la vista) y hoy dependen por completo de la politica
-- RLS pedidos_admin_all para acotar por sede -- correcto porque son
-- security invoker, pero inconsistente con el principio de defensa en
-- profundidad recien establecido: si esa politica se relaja en el futuro
-- (p.ej. para is_super_admin, CLAUDE.md §6.2), estas 4 funciones empezarian
-- a filtrar datos entre sedes sin ninguna senal local. Se agrega aqui el
-- mismo guard redundante que ya llevan las otras funciones de reportes.
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
    and p.sede_id = public.current_sede_id()
  group by 1, 2;
$$;

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
    and public.current_rol() = 'admin'
    and p.sede_id = public.current_sede_id();
$$;

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
    and p.sede_id = public.current_sede_id()
  group by p.canal;
$$;

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
      and p.sede_id = public.current_sede_id()
    group by pg.metodo
  )
  select metodo, total_cop, num_pagos,
    round(total_cop * 100.0 / nullif(sum(total_cop) over (), 0), 2) as porcentaje
  from totales;
$$;
