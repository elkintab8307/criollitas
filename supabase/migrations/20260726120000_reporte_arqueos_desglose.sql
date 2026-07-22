-- Extiende fn_reporte_arqueos con el desglose de movimientos del turno
-- (ventas en efectivo, salidas de gastos/retiros, entradas extra) para que
-- el reporte de Admin refleje la misma información que ya se imprime en
-- la tirilla de arqueo (CLAUDE.md §2.4, §2.7) -- "de dónde salió" el total
-- esperado, no solo el número final.
drop function if exists public.fn_reporte_arqueos(timestamptz, timestamptz);

create or replace function public.fn_reporte_arqueos(
  p_desde timestamptz,
  p_hasta timestamptz
)
returns table (
  turno_id uuid,
  cajera_nombre text,
  abierto_en timestamptz,
  cerrado_en timestamptz,
  efectivo_inicial_cop bigint,
  ventas_efectivo_cop bigint,
  salidas_cop bigint,
  entradas_extra_cop bigint,
  esperado_cop bigint,
  declarado_cop bigint,
  diferencia_cop bigint
)
language sql
security invoker
set search_path = public
stable
as $$
  select
    tc.id as turno_id,
    u.nombre as cajera_nombre,
    tc.abierto_en,
    tc.cerrado_en,
    tc.efectivo_inicial_cop,
    coalesce((
      select sum(p.monto_cop) from public.pagos p
      where p.turno_id = tc.id and p.metodo = 'efectivo'
    ), 0) as ventas_efectivo_cop,
    coalesce((
      select sum(m.monto_cop) from public.movimientos_caja m
      where m.turno_id = tc.id and m.tipo in ('retiro', 'gasto')
    ), 0) as salidas_cop,
    coalesce((
      select sum(m.monto_cop) from public.movimientos_caja m
      where m.turno_id = tc.id and m.tipo = 'ingreso_extra'
    ), 0) as entradas_extra_cop,
    tc.esperado_cop,
    tc.efectivo_declarado_cop as declarado_cop,
    tc.diferencia_cop
  from public.turnos_caja tc
  join public.usuarios u on u.id = tc.cajera_id
  where tc.estado = 'cerrado'
    and tc.cerrado_en >= p_desde
    and tc.cerrado_en < p_hasta
    and tc.sede_id = public.current_sede_id()
    and public.current_rol() = 'admin'
  order by tc.cerrado_en desc;
$$;

revoke execute on function public.fn_reporte_arqueos(timestamptz, timestamptz) from public;
revoke execute on function public.fn_reporte_arqueos(timestamptz, timestamptz) from anon;
grant execute on function public.fn_reporte_arqueos(timestamptz, timestamptz) to authenticated;
