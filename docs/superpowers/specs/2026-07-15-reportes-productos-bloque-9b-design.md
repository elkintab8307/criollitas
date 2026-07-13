# Bloque 9b — Reportes: Productos y Categorías: Diseño

## Contexto

Roadmap CLAUDE.md §16, bloque 9 ("Reportes"), segundo sub-bloque de 3 (decisión confirmada con el usuario en el Bloque 9a: 9a Infraestructura + Ventas ya en `main`, 9b Rankings y operación, 9c Caja y auditoría).

**Alcance reducido por decisión explícita del usuario:** de los 6 reportes originalmente previstos para 9b en CLAUDE.md §2.7, este bloque implementa **solo dos**: "Productos más vendidos" (top N por unidades y por ingreso) y "Categorías más vendidas". Se descartan por el momento — irrelevantes hoy, según el usuario, no diferidos a un bloque futuro concreto: ranking de Vendedoras, ranking de Cajeras, mesas más rentables, tiempo promedio de preparación por producto.

Este bloque reutiliza toda la infraestructura del Bloque 9a: `SelectorRangoFecha`, `BotonExportar`, `StatCard`, `lib/reportes/exportar.ts`, `lib/reportes/rangosFecha.ts`, y el layout de tabs `app/(admin)/reportes/layout.tsx` (se le agregan 2 tabs nuevos). Aplica directamente la lección aprendida en la revisión final del 9a: cada objeto SQL de reporte lleva el guard `current_rol() = 'admin'` **y** `sede_id = current_sede_id()` explícitos desde su primer commit, no como fix posterior.

## Decisiones de negocio (confirmadas con el usuario)

1. **Top N de productos**: fijo en 10 para el gráfico de barras, sin selector configurable en la UI. La tabla completa (y su exportación CSV/XLSX) incluye TODOS los productos vendidos en el rango, no solo el top 10 — el RPC siempre trae el conjunto completo ya agregado y ordenado; la UI decide cuánto graficar.
2. **Unidades vs. ingreso**: un único gráfico de barras + una única tabla, con un toggle "Ordenar por: Unidades / Ingreso" que reordena ambos en el cliente. Una sola llamada al RPC (los datos ya vienen agregados con ambas columnas); el reordenamiento es una operación trivial de UI, no un nuevo cálculo (no viola CLAUDE.md §13.4).
3. **Estructura de páginas**: dos páginas separadas, `/reportes/productos` y `/reportes/categorias`, siguiendo el mismo patrón de tabs independientes del Bloque 9a (ahora 5 tabs: Ventas, Métodos de pago, Canales, Productos, Categorías). Categorías es conceptualmente más cercano a "Canales" (torta + participación %); Productos es su propio patrón (top N + tabla completa).
4. **Productos/categorías inactivos**: los reportes no filtran por `productos.activo`/`categorias.activa` — un producto o categoría descontinuado (soft-delete, CLAUDE.md §13.8) debe seguir apareciendo en reportes históricos con su nombre real, nunca ocultarse ni mostrarse como "desconocido". Esto no requirió confirmación explícita del usuario por ser la única interpretación consistente con el principio de soft-delete ya establecido en el proyecto.

## Arquitectura

**Capa SQL**: 2 funciones RPC de solo lectura, `security invoker`, `stable`, `set search_path = public`, con el guard doble (`current_rol() = 'admin'` + `sede_id = current_sede_id()`) presente desde el primer commit — a diferencia del 9a, donde el segundo guard llegó como fix de revisión. `revoke execute ... from public` y `from anon` explícitos, `grant execute ... to authenticated` (patrón establecido).

**Capa Server Actions + UI**: 2 páginas nuevas bajo `app/(admin)/reportes/`, cada una con su `actions.ts` (patrón `exigirAdmin()` local + `Result<T, DomainError>`) y su `Vista*.tsx` cliente. Sin componentes de infraestructura nuevos — todo se reutiliza del Bloque 9a. El layout `app/(admin)/reportes/layout.tsx` se extiende con 2 entradas nuevas en su array `TABS`.

## Modelo de datos y funciones SQL

Sin cambios al esquema — se leen `pedido_items (pedido_id, producto_id, cantidad, precio_unit_cop, subtotal_cop)`, `productos (id, sede_id, categoria_id, nombre, activo)`, `categorias (id, sede_id, nombre, activa)`, `pedidos (id, sede_id, estado, creado_en)` ya existentes. "Venta" = pedido en estado `cobrado` (mismo criterio del 9a).

**`fn_reporte_productos(p_desde timestamptz, p_hasta timestamptz)`**

```sql
select pr.id as producto_id, pr.nombre, pr.categoria_id, c.nombre as categoria_nombre,
  sum(pi.cantidad)::bigint as unidades, sum(pi.subtotal_cop)::bigint as ingreso_cop
from pedido_items pi
join pedidos p on p.id = pi.pedido_id
join productos pr on pr.id = pi.producto_id
join categorias c on c.id = pr.categoria_id
where p.estado = 'cobrado' and p.creado_en >= p_desde and p.creado_en < p_hasta
  and p.sede_id = current_sede_id() and current_rol() = 'admin'
group by pr.id, pr.nombre, pr.categoria_id, c.nombre
order by ingreso_cop desc;
```

Trae todos los productos vendidos en el rango, ordenados por ingreso descendente. La UI reordena por unidades cuando el admin cambia el toggle, sin nueva llamada al RPC.

**`fn_reporte_categorias(p_desde timestamptz, p_hasta timestamptz)`**

```sql
with totales as (
  select c.id as categoria_id, c.nombre as categoria_nombre,
    sum(pi.cantidad)::bigint as unidades, sum(pi.subtotal_cop)::bigint as ingreso_cop
  from pedido_items pi
  join pedidos p on p.id = pi.pedido_id
  join productos pr on pr.id = pi.producto_id
  join categorias c on c.id = pr.categoria_id
  where p.estado = 'cobrado' and p.creado_en >= p_desde and p.creado_en < p_hasta
    and p.sede_id = current_sede_id() and current_rol() = 'admin'
  group by c.id, c.nombre
)
select categoria_id, categoria_nombre, unidades, ingreso_cop,
  round(ingreso_cop * 100.0 / nullif(sum(ingreso_cop) over (), 0), 2) as porcentaje
from totales;
```

Mismo patrón de `porcentaje` calculado en SQL que `fn_reporte_canales` del Bloque 9a.

## Páginas

- **`/reportes/productos`**: `SelectorRangoFecha` + toggle "Ordenar por: Unidades / Ingreso" (estado local de React, un `.sort()` sobre el array ya cargado) + gráfico de barras (Recharts) del top 10 según el orden activo + tabla completa (Producto | Categoría | Unidades | Ingreso) + `BotonExportar` con todas las filas (no solo el top 10) + estados de error/vacío ("Sin ventas en este período") igual que el resto de reportes del 9a.
- **`/reportes/categorias`**: `SelectorRangoFecha` + gráfico de torta (Recharts) + tabla (Categoría | Unidades | Ingreso | %) + `BotonExportar` — misma estructura que `VistaCanales.tsx` del Bloque 9a, adaptada a las columnas de este reporte.

## Testing

- Sin lógica pura nueva que amerite TDD: todo el cálculo agregado vive en SQL; el reordenamiento del toggle es una única línea de `.sort()` sobre datos ya agregados, trivial y sin casos borde de negocio.
- Verificación en vivo de ambas funciones con curl contra el proyecto Supabase cloud, usando el admin y la cajera de prueba ya existentes (generación de sesión vía `admin/generate_link` + `verify`, sin tocar contraseñas reales) — mismo patrón que la Tarea 8 del Bloque 9a. Se ejecuta directamente por el controlador (no vía subagente), por requerir credenciales reales del proyecto.

## Fuera de alcance (descartado, no diferido a un bloque concreto)

- Ranking de Vendedoras (ingreso generado, número de pedidos, ticket promedio).
- Ranking de Cajeras (turnos, pedidos cobrados, diferencia promedio en arqueo).
- Mesas más rentables (ingreso por mesa, rotación).
- Tiempo promedio de preparación por producto.

Estos cuatro reportes de CLAUDE.md §2.7 quedan sin implementar por decisión explícita del usuario ("irrelevantes por el momento"); se retoman si el usuario los solicita en el futuro, no están planificados en un bloque 9c/9d concreto.
