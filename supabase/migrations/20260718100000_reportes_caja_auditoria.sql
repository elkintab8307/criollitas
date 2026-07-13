-- Bloque 9c: reportes de arqueos (historial de turnos cerrados con su
-- diferencia) y anulaciones (con motivo). Ambas funciones llevan el guard
-- doble (current_rol()='admin' + acotación por sede) directamente en su
-- WHERE desde este primer commit -- mismo patrón obligatorio desde el
-- Bloque 9b, sin excepción. anulaciones no tiene sede_id propio (Bloque
-- 8: se resuelve vía pedido_id), así que se acota vía p.sede_id.
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
  esperado_cop bigint,
  declarado_cop bigint,
  diferencia_cop bigint
)
language sql
security invoker
set search_path = public
stable
as $$
  select tc.id as turno_id, u.nombre as cajera_nombre, tc.abierto_en, tc.cerrado_en,
    tc.efectivo_inicial_cop, tc.esperado_cop, tc.efectivo_declarado_cop as declarado_cop,
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

create or replace function public.fn_reporte_anulaciones(
  p_desde timestamptz,
  p_hasta timestamptz
)
returns table (
  anulacion_id uuid,
  pedido_numero_corto integer,
  anulado_en timestamptz,
  usuario_nombre text,
  motivo text,
  total_cop bigint
)
language sql
security invoker
set search_path = public
stable
as $$
  select a.id as anulacion_id, p.numero_corto as pedido_numero_corto, a.creado_en as anulado_en,
    u.nombre as usuario_nombre, a.motivo, p.total_cop
  from public.anulaciones a
  join public.pedidos p on p.id = a.pedido_id
  join public.usuarios u on u.id = a.usuario_id
  where a.creado_en >= p_desde
    and a.creado_en < p_hasta
    and p.sede_id = public.current_sede_id()
    and public.current_rol() = 'admin'
  order by a.creado_en desc;
$$;

revoke execute on function public.fn_reporte_anulaciones(timestamptz, timestamptz) from public;
revoke execute on function public.fn_reporte_anulaciones(timestamptz, timestamptz) from anon;
grant execute on function public.fn_reporte_anulaciones(timestamptz, timestamptz) to authenticated;
