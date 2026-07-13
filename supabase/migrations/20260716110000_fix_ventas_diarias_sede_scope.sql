-- Fix encontrado en revision de la Tarea 1 del Bloque 9a: vw_ventas_diarias
-- filtraba por p.estado = 'cobrado' y public.current_rol() = 'admin', pero
-- le faltaba p.sede_id = public.current_sede_id(). Las vistas en Postgres
-- corren con los privilegios del dueno de la vista (el rol que aplica las
-- migraciones, que tiene BYPASSRLS en Supabase), asi que las politicas RLS
-- de pedidos (pedidos_admin_all, que si filtra por sede correctamente) NO se
-- aplican al leer a traves de la vista -- solo los predicados escritos a
-- mano en la vista protegen el acceso, y esos no acotaban por sede. Un admin
-- de cualquier sede (una vez exista una segunda sede) veria ventas de TODAS
-- las sedes mezcladas via fn_reporte_ventas_rango y fn_reporte_canales, las
-- dos funciones que consultan esta vista.
--
-- Ademas, esas dos funciones dependian por completo del guard
-- current_rol() = 'admin' embebido en la vista, en vez de llevar su propio
-- guard explicito en su propio WHERE -- inconsistente con las otras 4
-- funciones de la migracion base, que si se protegen directamente. Se agrega
-- el guard redundante en ambas funciones como defensa en profundidad: un
-- futuro cambio a la vista ya no puede quitarle proteccion a las funciones
-- sin que quede una senal local.
create or replace view public.vw_ventas_diarias as
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
  and p.sede_id = public.current_sede_id()
group by p.sede_id, (p.creado_en at time zone 'America/Bogota')::date, p.canal;

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
    and public.current_rol() = 'admin'
  order by v.dia;
$$;

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
      and public.current_rol() = 'admin'
    group by v.canal
  )
  select canal, total_cop, num_pedidos,
    round(total_cop * 100.0 / nullif(sum(total_cop) over (), 0), 2) as porcentaje
  from totales;
$$;
