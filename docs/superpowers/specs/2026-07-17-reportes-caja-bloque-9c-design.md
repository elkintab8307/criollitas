# Bloque 9c — Reportes: Caja y Auditoría: Diseño

## Contexto

Roadmap CLAUDE.md §16, bloque 9 ("Reportes"), tercer y último sub-bloque tras 9a (Infraestructura + Ventas) y 9b (Productos y Categorías), ambos ya en `main`. Cierra el alcance completo de reportes que el usuario decidió mantener.

## Decisiones de negocio (confirmadas con el usuario)

1. **Reporte de descuentos/promociones descartado por completo**: el restaurante no usa esa función operativa. De los 3 reportes originalmente previstos para 9c en CLAUDE.md §2.7, este bloque implementa **solo dos**: "Historial de arqueos y diferencias" y "Anulaciones y motivos". "Descuentos y promociones aplicados" no se implementa ni se difiere — queda fuera de alcance de forma permanente por decisión del usuario, no por falta de tiempo.
2. **Forma de ambos reportes**: tabla de detalle + StatCards, sin gráfica — son reportes de auditoría/detalle (cada fila es un hecho puntual: un turno cerrado, una anulación), no series comparables como ventas por día. Mismo espíritu que la página `/anular` del Bloque 8, pero de solo lectura.
3. **Campo de fecha para filtrar**: ambos reportes filtran por el momento en que el hecho ocurrió (`turnos_caja.cerrado_en` para arqueos, `anulaciones.creado_en` para anulaciones), no por la apertura del turno ni la fecha del pedido original.

## Arquitectura

**Estructura de páginas**: dos páginas nuevas, `/reportes/arqueos` y `/reportes/anulaciones`, agregadas como 2 tabs nuevos al layout existente (`app/(admin)/reportes/layout.tsx`, ahora 7 tabs en total).

**Capa SQL**: 2 funciones RPC de solo lectura, `security invoker`, `stable`, con el guard doble (`current_rol()='admin'` + acotación por sede) presente desde el primer commit — mismo patrón aplicado sin excepción desde el Bloque 9b. `revoke execute ... from public` y `from anon` explícitos, `grant execute ... to authenticated`.

**Capa Server Actions + UI**: sin componentes de infraestructura nuevos — se reutilizan `SelectorRangoFecha`, `BotonExportar`, `StatCard`, `ClayBadge` (para colorear la diferencia de arqueo) ya existentes.

## Modelo de datos y funciones SQL

Sin cambios al esquema — se leen `turnos_caja (id, sede_id, cajera_id, abierto_en, cerrado_en, efectivo_inicial_cop, efectivo_declarado_cop, esperado_cop, diferencia_cop, estado)`, `anulaciones (id, pedido_id, usuario_id, motivo, creado_en)` del Bloque 8, `pedidos (numero_corto, total_cop, sede_id)`, `usuarios (nombre)`.

**`fn_reporte_arqueos(p_desde timestamptz, p_hasta timestamptz)`**

```sql
select tc.id as turno_id, u.nombre as cajera_nombre, tc.abierto_en, tc.cerrado_en,
  tc.efectivo_inicial_cop, tc.esperado_cop, tc.efectivo_declarado_cop, tc.diferencia_cop
from turnos_caja tc
join usuarios u on u.id = tc.cajera_id
where tc.estado = 'cerrado'
  and tc.cerrado_en >= p_desde and tc.cerrado_en < p_hasta
  and tc.sede_id = current_sede_id() and current_rol() = 'admin'
order by tc.cerrado_en desc;
```

`turnos_caja` tiene `sede_id` propio, se filtra directamente.

**`fn_reporte_anulaciones(p_desde timestamptz, p_hasta timestamptz)`**

```sql
select a.id as anulacion_id, p.numero_corto as pedido_numero_corto, a.creado_en as anulado_en,
  u.nombre as usuario_nombre, a.motivo, p.total_cop
from anulaciones a
join pedidos p on p.id = a.pedido_id
join usuarios u on u.id = a.usuario_id
where a.creado_en >= p_desde and a.creado_en < p_hasta
  and p.sede_id = current_sede_id() and current_rol() = 'admin'
order by a.creado_en desc;
```

`anulaciones` no tiene `sede_id` propio (decisión del Bloque 8: la auditoría de esta tabla resuelve `sede_id` vía `pedido_id` como respaldo) — este reporte se acota vía `p.sede_id` (el pedido unido), consistente con ese precedente.

## Páginas

- **`/reportes/arqueos`**: `SelectorRangoFecha` + 3 `StatCard` (turnos cerrados, turnos con diferencia distinta de cero, suma de diferencias) + tabla (Cajera | Apertura | Cierre | Esperado | Declarado | Diferencia) con la columna Diferencia coloreada vía `ClayBadge` (`variant="exito"` si `diferenciaCop === 0`, `variant="peligro"` si no) + `BotonExportar`.
- **`/reportes/anulaciones`**: `SelectorRangoFecha` + 2 `StatCard` (número de anulaciones, total anulado) + tabla (Pedido | Fecha | Anulado por | Motivo | Total) + `BotonExportar`.

Ambas con estados de error/vacío ("Sin turnos cerrados en este período" / "Sin anulaciones en este período"), mismo patrón que el resto de reportes de 9a/9b.

## Testing

- Sin lógica pura nueva: todo el cálculo agregado vive en SQL; el coloreado verde/rojo de la diferencia es una comparación trivial (`=== 0`), sin casos borde de negocio que ameriten TDD.
- Verificación en vivo de ambas funciones con curl contra Supabase cloud, usando el admin y la cajera de prueba ya existentes (mismo mecanismo `generate_link`+`verify` de bloques anteriores). Ejecutada directamente por el controlador, no vía subagente, por requerir credenciales reales.

## Fuera de alcance (descartado, no diferido)

- "Descuentos y promociones aplicados" — el restaurante no usa esta función; no se implementa ni se planifica para un bloque futuro.

Con este bloque se completa el 100% del alcance de Reportes (CLAUDE.md §2.7) que el usuario decidió mantener, tras descartar explícitamente ranking de Vendedoras, ranking de Cajeras, mesas más rentables, tiempo de preparación (Bloque 9b) y descuentos/promociones (este bloque).
