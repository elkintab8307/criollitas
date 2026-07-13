# Bloque 9a — Reportes: Infraestructura + Ventas: Diseño

## Contexto

Roadmap CLAUDE.md §16, bloque 9 ("Reportes"), primer sub-bloque de 3 (decisión confirmada con el usuario: 9a Infraestructura + Ventas, 9b Rankings y operación, 9c Caja y auditoría — 15 tipos de reporte distintos con exportación CSV/XLSX es varios subsistemas, no uno solo).

Ningún reporte existe todavía. `app/(admin)/reportes/` no existe como carpeta. No hay dependencia de gráficas (`recharts`) ni de exportación XLSX en `package.json`. Las vistas/funciones mencionadas en CLAUDE.md §7 (`vw_ventas_diarias`, `fn_reporte_rango`, etc.) son nombres aspiracionales, nunca creados en una migración real — este bloque las diseña desde cero sobre el modelo de datos real construido en los bloques 1-8.

`/reportes` ya está registrado en `PREFIJOS_POR_ROL` (`lib/auth/roles.ts`) desde bloques anteriores — no hace falta tocarlo.

## Decisiones de negocio (confirmadas con el usuario)

1. **Descomposición del bloque 9**: 3 sub-bloques secuenciales, cada uno con su propio spec/plan/PR — 9a (este documento): infraestructura de export + ventas por rango/canal/método/hora + ticket promedio + comparativos período. 9b: productos, categorías, ranking vendedoras/cajeras, mesas rentables, tiempos de preparación. 9c: arqueos, anulaciones, descuentos aplicados.
2. **Librería de exportación XLSX**: `xlsx` (SheetJS community edition) — la más usada, sin dependencias nativas, suficiente para tablas planas sin necesidad de estilos de celda (que sí requeriría `exceljs`, más pesada).
3. **Mapa de calor de ventas por hora**: muestra el **promedio** por franja día-de-semana×hora dentro del rango elegido (no la suma total), porque CLAUDE.md lo describe explícitamente como herramienta "para planificar personal" — responde "¿cómo es un lunes 6pm típico?", que no depende de cuántas semanas tenga el rango elegido.
4. **"Venta" = pedido en estado `cobrado`**: ningún RPC existente en el código actual transiciona un pedido a `cerrado` (ese estado es aspiracional en el diagrama de CLAUDE.md §2.2 pero nunca se escribe) — el único estado terminal de ingreso real es `cobrado`. `anulado` queda excluido, correctamente, de todo reporte de ingresos.
5. **Sin selector de sede en la UI**: `is_super_admin` (mencionado en CLAUDE.md §6.2 para un admin que vería todas las sedes) nunca se implementó en ninguna migración — cada admin ya está limitado a su propia sede vía RLS existente sobre `pedidos`/`pagos`. Un selector de sede sería sobre-ingeniería hoy; se agrega si en el futuro se implementa `is_super_admin`.

## Arquitectura

**Capa SQL** (CLAUDE.md §13.4: nada de agregaciones en el cliente):
- Una vista base `vw_ventas_diarias` (por sede, día en hora Bogotá, canal — agregados de pedidos `cobrado`).
- 6 funciones RPC de solo lectura, `security invoker` (RLS de `pedidos`/`pagos` ya limita por sede — sin policy nueva), `revoke execute from public/anon` + `grant to authenticated` (patrón establecido en bloques 5-8): `fn_reporte_ventas_rango`, `fn_reporte_mapa_calor_horas`, `fn_reporte_ticket_promedio_global`, `fn_reporte_ticket_promedio_canal`, `fn_reporte_metodos_pago`, `fn_reporte_canales`.

**Capa Server Actions**: una por página, en `app/(admin)/reportes/<pagina>/actions.ts`, valida el rango con Zod, llama al RPC vía `supabase.rpc(...)`, retorna `Result<T, DomainError>` — mismo patrón `exigirAdmin()` local por archivo ya establecido (deliberadamente no compartido entre carpetas de rol).

**Capa UI**: 3 páginas (`reportes/ventas`, `reportes/metodos-pago`, `reportes/canales`), cada una con selector de rango, gráfica Recharts, tabla y botón exportar CSV/XLSX. Protegidas solo por middleware (sin guard redundante en cada `page.tsx`, patrón confirmado en `mesas/page.tsx` y el resto de páginas admin).

**Infraestructura compartida**:
- `lib/reportes/rangosFecha.ts` — resuelve presets a `{desde, hasta}` en hora Bogotá y calcula el período anterior equivalente. Lógica pura → TDD.
- `lib/reportes/exportar.ts` — `exportarCSV` (construcción manual de string con escape, TDD) y `exportarXLSX` (wrapper delgado sobre `xlsx`, sin test dedicado).
- `components/reportes/BotonExportar.tsx`, `SelectorRangoFecha.tsx`, `TarjetaMetrica.tsx` (reutiliza contrato de `StatCard` de CLAUDE.md §8.3, aún no construido como componente propio — se crea en este bloque).

## Modelo de datos y funciones SQL

### Vista base

```sql
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
group by p.sede_id, (p.creado_en at time zone 'America/Bogota')::date, p.canal;
```

La vista no tiene RLS propia (las vistas heredan las políticas de las tablas base en Postgres/Supabase por defecto vía `security_invoker` implícito de una vista normal) — el acceso queda limitado por la RLS existente de `pedidos`.

### Funciones RPC

**1. `fn_reporte_ventas_rango(p_desde timestamptz, p_hasta timestamptz, p_canal public.canal_pedido default null)`**
→ filas `(dia date, canal text, num_pedidos int, subtotal_cop bigint, descuento_cop bigint, propina_cop bigint, total_cop bigint)`. Filtra `vw_ventas_diarias` por `[p_desde, p_hasta)` y, si `p_canal` no es null, por canal. Alimenta el gráfico de ventas por rango y, llamada dos veces (rango actual + rango anterior calculado en `rangosFecha.ts`), el comparativo período contra período — el delta se calcula en la UI sobre dos resultados ya agregados en SQL.

**2. `fn_reporte_mapa_calor_horas(p_desde timestamptz, p_hasta timestamptz)`**
→ filas `(dia_semana int, hora int, promedio_cop bigint, num_pedidos bigint)`. `dia_semana`: 0=domingo..6=sábado (`extract(dow from (creado_en at time zone 'America/Bogota'))`), `hora`: `extract(hour from (creado_en at time zone 'America/Bogota'))`. Promedia `total_cop` de pedidos `cobrado` agrupando por día-de-semana + hora dentro del rango.

**3. `fn_reporte_ticket_promedio_global(p_desde timestamptz, p_hasta timestamptz)`**
→ una fila `(ticket_promedio_cop bigint, num_pedidos bigint)`.

**4. `fn_reporte_ticket_promedio_canal(p_desde timestamptz, p_hasta timestamptz)`**
→ filas `(canal text, ticket_promedio_cop bigint, num_pedidos bigint)`.

Se separan en dos funciones (global y por canal) en vez de un tipo compuesto artificial — la página llama a ambas.

**5. `fn_reporte_metodos_pago(p_desde timestamptz, p_hasta timestamptz)`**
→ filas `(metodo text, total_cop bigint, num_pagos int, porcentaje numeric)`. Se agrega sobre `pagos` (no `pedidos`), uniendo por `pedido_id` a pedidos `cobrado` dentro del rango — el pago mixto reparte un mismo pedido entre métodos, así que sumar por `pedidos.total_cop` sobre-contaría. `porcentaje` calculado en SQL: `total_cop * 100.0 / sum(total_cop) over ()`.

**6. `fn_reporte_canales(p_desde timestamptz, p_hasta timestamptz)`**
→ filas `(canal text, total_cop bigint, num_pedidos int, porcentaje numeric)`, agregando `vw_ventas_diarias`, mismo patrón de `porcentaje` en SQL.

## Páginas y UI

**`reportes/ventas/`**: `SelectorRangoFecha` (presets día/semana/mes/año + rango libre, default mes actual) + filtro de canal (Todos/Mesa/Domicilio/Llevar) + toggle "Comparar con período anterior" (llama `fn_reporte_ventas_rango` dos veces, muestra deltas ↑/↓ %) + 4 `TarjetaMetrica` (total vendido, número de pedidos, ticket promedio global, descuento total) + gráfico de barras (Recharts `BarChart`) de ventas por día + mapa de calor semanal (grid 7×24 HTML/CSS propio con tooltip, envuelto en `overflow-x-auto`; Recharts no tiene heatmap nativo) + tabla detalle por día + exportar CSV/XLSX.

**`reportes/metodos-pago/`**: `SelectorRangoFecha` + gráfico de torta (Recharts `PieChart`) + tabla + exportar.

**`reportes/canales/`**: mismo patrón que métodos de pago, agrupado por canal.

Densidad según CLAUDE.md §8.4 (Admin: densidad alta permitida en tablas, gráficas con leyendas claras).

## Testing y manejo de errores

**TDD (lógica pura, CLAUDE.md §4.1):**
- `lib/reportes/rangosFecha.test.ts` — cada preset resuelve a los límites `[desde, hasta)` correctos en hora Bogotá (mismo patrón que `limitesDeHoyBogota()` en `lib/dates.ts`); el período anterior de un rango libre se calcula como el mismo número de días inmediatamente antes de `desde`.
- `lib/reportes/exportar.test.ts` — `exportarCSV` escapa comas/comillas/saltos de línea, incluye encabezados, separador `,` estándar (compatible con Excel/Sheets modernos; sin detección de locale, YAGNI).

**Sin TDD (wrappers delgados / SQL):**
- `exportarXLSX` — wrapper sobre `xlsx`, sin test unitario dedicado (mismo criterio que otros wrappers delgados del proyecto, ej. `codificarEscPos`).
- Las 6 funciones RPC y la vista — verificación en vivo con curl (admin ve datos de su sede, no-admin rechazado, filas coinciden con datos de prueba conocidos), mismo patrón de bloques 5-8.

**Manejo de errores:** cada Server Action retorna `Result<T, DomainError>`; error de RPC → `{codigo: "BASE_DATOS", mensaje: "No pudimos cargar el reporte. Intenta de nuevo."}`. Estado vacío (sin ventas en el rango) se distingue explícitamente en la UI ("Sin ventas en este período") de un error real.

## Fuera de alcance (diferido explícitamente)

- Productos más vendidos, categorías más vendidas, ranking de vendedoras/cajeras, mesas más rentables, tiempo promedio de preparación — Bloque 9b.
- Historial de arqueos y diferencias, anulaciones y motivos, descuentos aplicados — Bloque 9c.
- Selector de sede / vista multi-sede para un futuro `is_super_admin` — no implementado hoy, se agrega si se implementa esa capacidad.
- Exportación server-side (generación de XLSX en el servidor y descarga vía Server Action) — se exporta client-side desde los datos ya cargados, más simple y suficiente para el volumen de un solo restaurante.
