# Bloque 9a (Reportes: Infraestructura + Ventas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al Administrador reportes de ventas (por rango, por hora, por método de pago, por canal, ticket promedio, comparativo período contra período) con exportación CSV/XLSX, sentando la infraestructura compartida (rangos de fecha, exportación, componentes) que reutilizarán los Bloques 9b y 9c.

**Architecture:** Una vista SQL (`vw_ventas_diarias`) + 6 funciones RPC de solo lectura (`security invoker`, gateadas por `current_rol() = 'admin'` en su propio `WHERE` — no basta con la RLS de sede, porque Cajera también tiene SELECT sobre pedidos `cobrado` y CLAUDE.md le niega explícitamente "ver reportes"). Server Actions por página llaman a los RPC vía `supabase.rpc(...)`. Tres páginas cliente (`reportes/ventas`, `reportes/metodos-pago`, `reportes/canales`) con Recharts para gráficas y una cuadrícula HTML/CSS propia para el mapa de calor. Exportación CSV/XLSX ocurre en el cliente sobre los datos ya cargados.

**Tech Stack:** Next.js 15 App Router, TypeScript estricto, Supabase (Postgres + RLS), Recharts (nuevo), `xlsx`/SheetJS (nuevo), Zod, Vitest, `date-fns` + `@date-fns/tz`.

## Global Constraints

- CLAUDE.md §13.4: no calcular reportes en el cliente — toda agregación vive en vistas SQL o funciones RPC. Sumar filas YA agregadas por SQL (ej. totales diarios para una tarjeta, o comparar dos resultados ya agregados) no cuenta como "calcular el reporte en el cliente".
- CLAUDE.md §13.3: dinero como `bigint`/centavos en SQL; en TypeScript se maneja como `number` en las interfaces de reporte (mismo precedente que `PedidoParaAnularVista.totalCop` del Bloque 8) y se envuelve en `BigInt(...)` solo al formatear con `formatearCOP`.
- CLAUDE.md §13.5: toda fecha se calcula y muestra en `America/Bogota` — nunca se reinterpreta una fecha-calendario (`date` de Postgres, ej. `"2026-07-15"`) a través de un conversor de zona horaria, porque `new Date("2026-07-15")` es medianoche UTC y al convertir a Bogotá (-05:00) cae en el día anterior. Los `date` de SQL se muestran tal cual (string ISO) o se formatean con manipulación de string, nunca con `new Date(...)` + `TZDate`.
- CLAUDE.md §12: Server Actions para toda mutación/lectura de datos vía Supabase; validación en el borde; `Result<T, DomainError>`; sin `any`; nombres de dominio en español.
- CLAUDE.md §11: sin Realtime en reportes (son datos históricos, no operación en vivo).
- "Venta" = pedido en estado `cobrado` (el único estado terminal que el código realmente escribe hoy — `cerrado` nunca se transiciona en ningún RPC existente). `anulado` queda excluido de todo reporte de ingresos.
- Patrón RPC establecido (Bloques 5-8): `revoke execute ... from public` **y** `from anon` explícitamente (Supabase concede `execute` a `anon` por defecto al crear la función, revocar solo de `public` es un no-op), `grant execute ... to authenticated`.
- Todos los tests existentes deben seguir verdes en cada tarea (141 en `main` a la fecha de este plan).

---

### Task 1: Migración SQL — vista de ventas diarias y 6 funciones de reporte

**Files:**
- Create: `supabase/migrations/20260716100000_reportes_ventas_base.sql`
- Modify: `lib/supabase/types.ts` (regenerar tras aplicar en cloud)

**Interfaces:**
- Produces: vista `public.vw_ventas_diarias`; funciones `public.fn_reporte_ventas_rango(p_desde timestamptz, p_hasta timestamptz, p_canal canal_pedido default null)`, `public.fn_reporte_mapa_calor_horas(p_desde timestamptz, p_hasta timestamptz)`, `public.fn_reporte_ticket_promedio_global(p_desde timestamptz, p_hasta timestamptz)`, `public.fn_reporte_ticket_promedio_canal(p_desde timestamptz, p_hasta timestamptz)`, `public.fn_reporte_metodos_pago(p_desde timestamptz, p_hasta timestamptz)`, `public.fn_reporte_canales(p_desde timestamptz, p_hasta timestamptz)` — todas llamadas vía `supabase.rpc(...)` desde las Server Actions de las Tasks 5-7.

- [ ] **Step 1: Escribir la migración completa**

```sql
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
```

- [ ] **Step 2: Aplicar en Supabase cloud**

Run: `supabase db push` (confirmar `Y`). Debe terminar sin errores.

- [ ] **Step 3: Regenerar tipos y aplicar el diff quirúrgicamente**

```bash
supabase gen types typescript --linked > /tmp/types_nuevo.ts
```

Igual que en el Bloque 8 Task 1: NO sobreescribir `lib/supabase/types.ts` completo (precedente CRLF+BOM). Extraer del archivo nuevo:
- El bloque `vw_ventas_diarias` dentro de `Views` (reemplaza el actual `Views: { [_ in never]: never }` de la sección `public`, línea ~796 del archivo actual) — campos alfabetizados: `canal, descuento_cop, dia, num_pedidos, propina_cop, sede_id, subtotal_cop, total_cop`, con `Relationships: []`.
- Las 6 funciones nuevas dentro de `Functions` (sección `public`), insertadas alfabéticamente por nombre de función (entre `current_sede_id` y `recalcular_totales_pedido`: `fn_reporte_canales`, `fn_reporte_mapa_calor_horas`, `fn_reporte_metodos_pago`, `fn_reporte_ticket_promedio_canal`, `fn_reporte_ticket_promedio_global`, `fn_reporte_ventas_rango`), con `Args`/`Returns` cuyos campos siguen alfabetizados (mismo patrón confirmado en `anulaciones`/`auditoria` del Bloque 8).

- [ ] **Step 4: Verificación en vivo — anon rechazado**

```bash
cd /c/PROYECTOS/CRIOLLITAS
set -a; source .env.local; set +a
curl -s -w "\nHTTP:%{http_code}\n" -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/fn_reporte_ventas_rango" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_desde":"2026-01-01T00:00:00Z","p_hasta":"2026-12-31T00:00:00Z"}'
```

Expected: `401` con `code: "42501"` (mismo patrón de revoke explícito de `anon`).

- [ ] **Step 5: Verificar suite completa**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 141/141 tests (esta tarea no agrega tests, solo SQL + tipos).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260716100000_reportes_ventas_base.sql lib/supabase/types.ts
git commit -m "feat: vista y funciones RPC de reportes de ventas (bloque 9a)"
```

---

### Task 2: `lib/reportes/rangosFecha.ts` — presets de rango y período anterior

**Files:**
- Create: `lib/reportes/rangosFecha.ts`
- Create: `tests/unit/reportes-rangos-fecha.test.ts`

**Interfaces:**
- Consumes: `TZ_BOGOTA` de `@/lib/dates`.
- Produces: `type PresetRango = "dia" | "semana" | "mes" | "anio"`; `interface RangoFechas { desde: Date; hasta: Date }`; `resolverRangoPreset(preset: PresetRango, fechaReferencia?: Date): RangoFechas`; `rangoAnterior(rango: RangoFechas): RangoFechas` — usadas por `SelectorRangoFecha` (Task 4) y las 3 vistas cliente (Tasks 5-7).

- [ ] **Step 1: Escribir los tests**

```typescript
// tests/unit/reportes-rangos-fecha.test.ts
import { describe, expect, it } from "vitest";
import { resolverRangoPreset, rangoAnterior } from "@/lib/reportes/rangosFecha";

describe("resolverRangoPreset", () => {
  it("dia: devuelve el dia calendario completo en hora Bogota", () => {
    const referencia = new Date("2026-07-15T18:00:00.000Z");
    const { desde, hasta } = resolverRangoPreset("dia", referencia);
    expect(desde.toISOString()).toBe("2026-07-15T05:00:00.000Z");
    expect(hasta.toISOString()).toBe("2026-07-16T05:00:00.000Z");
  });

  it("semana: devuelve lunes a domingo de la semana de la fecha de referencia", () => {
    const referencia = new Date("2026-07-15T18:00:00.000Z");
    const { desde, hasta } = resolverRangoPreset("semana", referencia);
    expect(desde.toISOString()).toBe("2026-07-13T05:00:00.000Z");
    expect(hasta.toISOString()).toBe("2026-07-20T05:00:00.000Z");
  });

  it("mes: devuelve el mes calendario completo", () => {
    const referencia = new Date("2026-07-15T18:00:00.000Z");
    const { desde, hasta } = resolverRangoPreset("mes", referencia);
    expect(desde.toISOString()).toBe("2026-07-01T05:00:00.000Z");
    expect(hasta.toISOString()).toBe("2026-08-01T05:00:00.000Z");
  });

  it("anio: devuelve el año calendario completo", () => {
    const referencia = new Date("2026-07-15T18:00:00.000Z");
    const { desde, hasta } = resolverRangoPreset("anio", referencia);
    expect(desde.toISOString()).toBe("2026-01-01T05:00:00.000Z");
    expect(hasta.toISOString()).toBe("2027-01-01T05:00:00.000Z");
  });
});

describe("rangoAnterior", () => {
  it("devuelve un rango de la misma duracion inmediatamente antes", () => {
    const rango = {
      desde: new Date("2026-07-13T05:00:00.000Z"),
      hasta: new Date("2026-07-20T05:00:00.000Z"),
    };
    const anterior = rangoAnterior(rango);
    expect(anterior.desde.toISOString()).toBe("2026-07-06T05:00:00.000Z");
    expect(anterior.hasta.toISOString()).toBe("2026-07-13T05:00:00.000Z");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `pnpm test tests/unit/reportes-rangos-fecha.test.ts`
Expected: FAIL — `lib/reportes/rangosFecha.ts` no existe.

- [ ] **Step 3: Implementar**

```typescript
// lib/reportes/rangosFecha.ts
import { TZDate } from "@date-fns/tz";
import { startOfDay, startOfWeek, startOfMonth, startOfYear, addDays, addWeeks, addMonths, addYears } from "date-fns";
import { TZ_BOGOTA } from "@/lib/dates";

export type PresetRango = "dia" | "semana" | "mes" | "anio";

export interface RangoFechas {
  desde: Date;
  hasta: Date;
}

export function resolverRangoPreset(preset: PresetRango, fechaReferencia: Date = new Date()): RangoFechas {
  const referencia = new TZDate(fechaReferencia.getTime(), TZ_BOGOTA);
  switch (preset) {
    case "dia": {
      const desde = startOfDay(referencia);
      return { desde, hasta: addDays(desde, 1) };
    }
    case "semana": {
      const desde = startOfWeek(referencia, { weekStartsOn: 1 });
      return { desde, hasta: addWeeks(desde, 1) };
    }
    case "mes": {
      const desde = startOfMonth(referencia);
      return { desde, hasta: addMonths(desde, 1) };
    }
    case "anio": {
      const desde = startOfYear(referencia);
      return { desde, hasta: addYears(desde, 1) };
    }
  }
}

export function rangoAnterior(rango: RangoFechas): RangoFechas {
  const duracionMs = rango.hasta.getTime() - rango.desde.getTime();
  return {
    desde: new Date(rango.desde.getTime() - duracionMs),
    hasta: new Date(rango.hasta.getTime() - duracionMs),
  };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `pnpm test tests/unit/reportes-rangos-fecha.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Verificar suite completa**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 146/146 tests (141 + 5 nuevos).

- [ ] **Step 6: Commit**

```bash
git add lib/reportes/rangosFecha.ts tests/unit/reportes-rangos-fecha.test.ts
git commit -m "feat: presets de rango de fechas y periodo anterior para reportes (TDD)"
```

---

### Task 3: `lib/reportes/exportar.ts` — exportación CSV y XLSX

**Files:**
- Create: `lib/reportes/exportar.ts`
- Create: `tests/unit/reportes-exportar.test.ts`
- Modify: `package.json` (nueva dependencia `xlsx`)

**Interfaces:**
- Produces: `interface ColumnaExport { clave: string; encabezado: string }`; `construirCSV(filas: Record<string, unknown>[], columnas: ColumnaExport[]): string`; `exportarCSV(filas, columnas, nombreArchivo: string): void`; `exportarXLSX(filas, columnas, nombreArchivo: string): void` — usadas por `BotonExportar` (Task 4).

- [ ] **Step 1: Instalar la dependencia**

```bash
pnpm add xlsx
```

Expected: exit 0, `xlsx` agregado a `dependencies` en `package.json`.

- [ ] **Step 2: Escribir los tests (solo de `construirCSV`, la parte pura)**

```typescript
// tests/unit/reportes-exportar.test.ts
import { describe, expect, it } from "vitest";
import { construirCSV } from "@/lib/reportes/exportar";

describe("construirCSV", () => {
  const columnas = [
    { clave: "dia", encabezado: "Día" },
    { clave: "total", encabezado: "Total" },
  ];

  it("incluye el encabezado con los nombres de columna", () => {
    const csv = construirCSV([], columnas);
    expect(csv).toBe("Día,Total");
  });

  it("incluye cada fila en el orden de las columnas", () => {
    const csv = construirCSV([{ dia: "2026-07-15", total: 50000 }], columnas);
    expect(csv).toBe("Día,Total\n2026-07-15,50000");
  });

  it("escapa valores que contienen comas envolviéndolos en comillas", () => {
    const csv = construirCSV([{ dia: "15 jul, 2026", total: 1000 }], columnas);
    expect(csv).toBe('Día,Total\n"15 jul, 2026",1000');
  });

  it("escapa comillas dobles duplicándolas", () => {
    const csv = construirCSV([{ dia: 'el "mejor" día', total: 1000 }], columnas);
    expect(csv).toBe('Día,Total\n"el ""mejor"" día",1000');
  });

  it("escapa saltos de línea envolviendo en comillas", () => {
    const csv = construirCSV([{ dia: "linea1\nlinea2", total: 1000 }], columnas);
    expect(csv).toBe('Día,Total\n"linea1\nlinea2",1000');
  });

  it("trata null y undefined como celda vacía", () => {
    const csv = construirCSV([{ dia: null, total: undefined }], columnas);
    expect(csv).toBe("Día,Total\n,");
  });
});
```

- [ ] **Step 3: Ejecutar y verificar que fallan**

Run: `pnpm test tests/unit/reportes-exportar.test.ts`
Expected: FAIL — `lib/reportes/exportar.ts` no existe.

- [ ] **Step 4: Implementar**

```typescript
// lib/reportes/exportar.ts
import * as XLSX from "xlsx";

export interface ColumnaExport {
  clave: string;
  encabezado: string;
}

function escaparCampoCSV(valor: unknown): string {
  const texto = valor === null || valor === undefined ? "" : String(valor);
  if (/[",\n]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

/** Construcción pura del contenido CSV — sin efectos de DOM, testeable en Node. */
export function construirCSV(filas: Record<string, unknown>[], columnas: ColumnaExport[]): string {
  const encabezado = columnas.map((c) => escaparCampoCSV(c.encabezado)).join(",");
  const cuerpo = filas.map((fila) => columnas.map((c) => escaparCampoCSV(fila[c.clave])).join(",")).join("\n");
  return cuerpo.length > 0 ? `${encabezado}\n${cuerpo}` : encabezado;
}

/** Dispara la descarga en el navegador. Sin test unitario (Blob/URL/document
 *  no existen en el entorno Node de vitest); la lógica de escape que sí
 *  importa está cubierta por los tests de construirCSV. */
export function exportarCSV(
  filas: Record<string, unknown>[],
  columnas: ColumnaExport[],
  nombreArchivo: string,
): void {
  const contenido = construirCSV(filas, columnas);
  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo.endsWith(".csv") ? nombreArchivo : `${nombreArchivo}.csv`;
  enlace.click();
  URL.revokeObjectURL(url);
}

/** Wrapper delgado sobre xlsx; sin test unitario dedicado (mismo criterio
 *  que otros wrappers delgados del proyecto, ej. codificarEscPos). */
export function exportarXLSX(
  filas: Record<string, unknown>[],
  columnas: ColumnaExport[],
  nombreArchivo: string,
): void {
  const datos = filas.map((fila) => {
    const objeto: Record<string, unknown> = {};
    for (const columna of columnas) {
      objeto[columna.encabezado] = fila[columna.clave] ?? "";
    }
    return objeto;
  });
  const hoja = XLSX.utils.json_to_sheet(datos);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Reporte");
  XLSX.writeFile(libro, nombreArchivo.endsWith(".xlsx") ? nombreArchivo : `${nombreArchivo}.xlsx`);
}
```

- [ ] **Step 5: Ejecutar y verificar que pasan**

Run: `pnpm test tests/unit/reportes-exportar.test.ts`
Expected: PASS (6/6).

- [ ] **Step 6: Verificar suite completa**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 152/152 tests (146 + 6 nuevos).

- [ ] **Step 7: Commit**

```bash
git add lib/reportes/exportar.ts tests/unit/reportes-exportar.test.ts package.json pnpm-lock.yaml
git commit -m "feat: exportacion CSV y XLSX de reportes (TDD para CSV)"
```

---

### Task 4: Componentes compartidos de reportes

**Files:**
- Create: `components/ui/StatCard.tsx`
- Create: `components/reportes/SelectorRangoFecha.tsx`
- Create: `components/reportes/BotonExportar.tsx`
- Create: `components/reportes/MapaCalorVentas.tsx`

**Interfaces:**
- Consumes: `ClayCard`, `ClayButton`, `ClayInput` de `components/ui/`; `cn` de `@/lib/cn`; `resolverRangoPreset`, `type PresetRango`, `type RangoFechas` de `@/lib/reportes/rangosFecha` (Task 2); `exportarCSV`, `exportarXLSX`, `type ColumnaExport` de `@/lib/reportes/exportar` (Task 3); `formatearCOP` de `@/lib/money`.
- Produces: `<StatCard titulo valor deltaPorcentaje? />`; `<SelectorRangoFecha onCambiar={(rango: RangoFechas) => void} />`; `<BotonExportar filas columnas nombreArchivo />`; `<MapaCalorVentas celdas={CeldaMapaCalor[]} />` con `interface CeldaMapaCalor { diaSemana: number; hora: number; promedioCop: number; numPedidos: number }` — usados por las 3 vistas cliente (Tasks 5-7).

- [ ] **Step 1: `components/ui/StatCard.tsx`** (CLAUDE.md §8.3 lo nombra explícitamente como componente base)

```typescript
import { ClayCard } from "@/components/ui/ClayCard";
import { cn } from "@/lib/cn";

export interface StatCardProps {
  titulo: string;
  valor: string;
  deltaPorcentaje?: number;
  className?: string;
}

export function StatCard({ titulo, valor, deltaPorcentaje, className }: StatCardProps) {
  const tieneDelta = typeof deltaPorcentaje === "number";
  const esPositivo = tieneDelta && deltaPorcentaje >= 0;
  return (
    <ClayCard className={cn("flex flex-col gap-1", className)}>
      <span className="text-sm text-text-secondary">{titulo}</span>
      <span className="font-display text-2xl font-semibold text-text-primary">{valor}</span>
      {tieneDelta ? (
        <span className={cn("text-sm font-medium", esPositivo ? "text-brand-verde" : "text-brand-tomate-2")}>
          {esPositivo ? "▲" : "▼"} {Math.abs(deltaPorcentaje).toFixed(1)}% vs. período anterior
        </span>
      ) : null}
    </ClayCard>
  );
}
```

- [ ] **Step 2: `components/reportes/SelectorRangoFecha.tsx`**

```typescript
"use client";

import { useState } from "react";
import { addDays } from "date-fns";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayInput } from "@/components/ui/ClayInput";
import { resolverRangoPreset, type PresetRango, type RangoFechas } from "@/lib/reportes/rangosFecha";

const PRESETS: { valor: PresetRango; etiqueta: string }[] = [
  { valor: "dia", etiqueta: "Hoy" },
  { valor: "semana", etiqueta: "Esta semana" },
  { valor: "mes", etiqueta: "Este mes" },
  { valor: "anio", etiqueta: "Este año" },
];

interface SelectorRangoFechaProps {
  onCambiar: (rango: RangoFechas) => void;
}

export function SelectorRangoFecha({ onCambiar }: SelectorRangoFechaProps) {
  const [modo, setModo] = useState<PresetRango | "libre">("mes");
  const [desdeLibre, setDesdeLibre] = useState("");
  const [hastaLibre, setHastaLibre] = useState("");

  function elegirPreset(preset: PresetRango) {
    setModo(preset);
    onCambiar(resolverRangoPreset(preset));
  }

  function aplicarLibre() {
    if (!desdeLibre || !hastaLibre) return;
    setModo("libre");
    const desde = new Date(`${desdeLibre}T00:00:00-05:00`);
    const hastaInclusive = new Date(`${hastaLibre}T00:00:00-05:00`);
    onCambiar({ desde, hasta: addDays(hastaInclusive, 1) });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      {PRESETS.map((p) => (
        <ClayButton
          key={p.valor}
          type="button"
          variant={modo === p.valor ? "primary" : "secondary"}
          size="sm"
          onClick={() => elegirPreset(p.valor)}
        >
          {p.etiqueta}
        </ClayButton>
      ))}
      <div className="flex items-end gap-2">
        <ClayInput label="Desde" type="date" value={desdeLibre} onChange={(e) => setDesdeLibre(e.target.value)} />
        <ClayInput label="Hasta" type="date" value={hastaLibre} onChange={(e) => setHastaLibre(e.target.value)} />
        <ClayButton
          type="button"
          variant={modo === "libre" ? "primary" : "secondary"}
          size="sm"
          onClick={aplicarLibre}
        >
          Aplicar
        </ClayButton>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `components/reportes/BotonExportar.tsx`**

```typescript
"use client";

import { ClayButton } from "@/components/ui/ClayButton";
import { exportarCSV, exportarXLSX, type ColumnaExport } from "@/lib/reportes/exportar";

interface BotonExportarProps {
  filas: Record<string, unknown>[];
  columnas: ColumnaExport[];
  nombreArchivo: string;
}

export function BotonExportar({ filas, columnas, nombreArchivo }: BotonExportarProps) {
  return (
    <div className="flex gap-2">
      <ClayButton
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => exportarCSV(filas, columnas, nombreArchivo)}
      >
        Exportar CSV
      </ClayButton>
      <ClayButton
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => exportarXLSX(filas, columnas, nombreArchivo)}
      >
        Exportar XLSX
      </ClayButton>
    </div>
  );
}
```

- [ ] **Step 4: `components/reportes/MapaCalorVentas.tsx`**

```typescript
import { formatearCOP } from "@/lib/money";

export interface CeldaMapaCalor {
  diaSemana: number;
  hora: number;
  promedioCop: number;
  numPedidos: number;
}

interface MapaCalorVentasProps {
  celdas: CeldaMapaCalor[];
}

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function MapaCalorVentas({ celdas }: MapaCalorVentasProps) {
  const maximo = Math.max(1, ...celdas.map((c) => c.promedioCop));
  const porClave = new Map(celdas.map((c) => [`${c.diaSemana}-${c.hora}`, c]));

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1">
        <thead>
          <tr>
            <th />
            {Array.from({ length: 24 }, (_, hora) => (
              <th key={hora} className="text-[10px] font-normal text-text-secondary">
                {hora}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DIAS.map((etiquetaDia, diaSemana) => (
            <tr key={diaSemana}>
              <td className="pr-2 text-xs font-medium text-text-secondary">{etiquetaDia}</td>
              {Array.from({ length: 24 }, (_, hora) => {
                const celda = porClave.get(`${diaSemana}-${hora}`);
                const intensidad = celda ? celda.promedioCop / maximo : 0;
                return (
                  <td
                    key={hora}
                    title={
                      celda
                        ? `${etiquetaDia} ${hora}:00 — ${formatearCOP(BigInt(celda.promedioCop))} (${celda.numPedidos} pedidos)`
                        : `${etiquetaDia} ${hora}:00 — sin ventas`
                    }
                    className="h-4 w-4 rounded-sm"
                    style={{ backgroundColor: `rgba(245, 184, 34, ${0.08 + intensidad * 0.92})` }}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Verificar suite completa**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 152/152 tests (componentes presentacionales, sin tests dedicados — mismo criterio que `ClayBadge`/`MesaTile`).

- [ ] **Step 6: Commit**

```bash
git add components/ui/StatCard.tsx components/reportes/
git commit -m "feat: componentes compartidos de reportes (StatCard, selector de rango, exportar, mapa de calor)"
```

---

### Task 5: Reporte de métodos de pago

**Files:**
- Create: `app/(admin)/reportes/metodos-pago/actions.ts`
- Create: `app/(admin)/reportes/metodos-pago/page.tsx`
- Create: `app/(admin)/reportes/metodos-pago/VistaMetodosPago.tsx`
- Modify: `package.json` (nueva dependencia `recharts`)

**Interfaces:**
- Consumes: RPC `fn_reporte_metodos_pago` (Task 1); `SelectorRangoFecha`, `BotonExportar` (Task 4); `resolverRangoPreset`, `type RangoFechas` (Task 2); `formatearCOP` de `@/lib/money`.
- Produces: `obtenerReporteMetodosPago(desde: string, hasta: string): Promise<Result<FilaMetodoPago[], DomainError>>` con `interface FilaMetodoPago { metodo: string; totalCop: number; numPagos: number; porcentaje: number }`.

- [ ] **Step 1: Instalar Recharts**

```bash
pnpm add recharts
```

Expected: exit 0, `recharts` agregado a `dependencies`.

- [ ] **Step 2: `app/(admin)/reportes/metodos-pago/actions.ts`**

```typescript
"use server";

import { err, ok, type DomainError, type Result } from "@/lib/result";
import { createServerSupabase } from "@/lib/supabase/server";

async function exigirAdmin(): Promise<Result<null, DomainError>> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return err({ codigo: "NO_AUTORIZADO", mensaje: "Inicia sesión de nuevo" });
  if (user.app_metadata?.rol !== "admin") {
    return err({ codigo: "NO_AUTORIZADO", mensaje: "Solo el administrador puede ver reportes" });
  }
  return ok(null);
}

export interface FilaMetodoPago {
  metodo: string;
  totalCop: number;
  numPagos: number;
  porcentaje: number;
}

export async function obtenerReporteMetodosPago(
  desde: string,
  hasta: string,
): Promise<Result<FilaMetodoPago[], DomainError>> {
  const ctx = await exigirAdmin();
  if (!ctx.ok) return ctx;
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("fn_reporte_metodos_pago", {
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos cargar el reporte. Intenta de nuevo." });
  }

  return ok(
    (data ?? []).map((fila) => ({
      metodo: fila.metodo,
      totalCop: fila.total_cop,
      numPagos: fila.num_pagos,
      porcentaje: Number(fila.porcentaje),
    })),
  );
}
```

- [ ] **Step 3: `app/(admin)/reportes/metodos-pago/VistaMetodosPago.tsx`**

```typescript
"use client";

import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { ClayCard } from "@/components/ui/ClayCard";
import { SelectorRangoFecha } from "@/components/reportes/SelectorRangoFecha";
import { BotonExportar } from "@/components/reportes/BotonExportar";
import { formatearCOP } from "@/lib/money";
import { resolverRangoPreset, type RangoFechas } from "@/lib/reportes/rangosFecha";
import { obtenerReporteMetodosPago, type FilaMetodoPago } from "./actions";

const COLORES = ["#F5B822", "#7CB342", "#D84315", "#52281A", "#D69A0C", "#9CCC65"];

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  nequi: "Nequi",
  daviplata: "Daviplata",
  bancolombia_qr: "Bancolombia QR",
  datafono: "Datáfono",
  otro: "Otro",
};

export function VistaMetodosPago() {
  const [rango, setRango] = useState<RangoFechas>(() => resolverRangoPreset("mes"));
  const [filas, setFilas] = useState<FilaMetodoPago[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    obtenerReporteMetodosPago(rango.desde.toISOString(), rango.hasta.toISOString()).then((resultado) => {
      if (cancelado) return;
      setCargando(false);
      if (!resultado.ok) {
        setError(resultado.error.mensaje);
        return;
      }
      setFilas(resultado.valor);
    });
    return () => {
      cancelado = true;
    };
  }, [rango]);

  const datosGrafica = filas.map((f) => ({ nombre: ETIQUETA_METODO[f.metodo] ?? f.metodo, valor: f.totalCop }));

  return (
    <div className="flex flex-col gap-6">
      <SelectorRangoFecha onCambiar={setRango} />
      {error ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {error}
        </p>
      ) : null}
      {!cargando && !error && filas.length === 0 ? (
        <p className="text-sm text-text-secondary">Sin ventas en este período.</p>
      ) : null}
      {filas.length > 0 ? (
        <>
          <ClayCard variant="flat" className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={datosGrafica} dataKey="valor" nameKey="nombre" outerRadius={100} label>
                  {datosGrafica.map((_, i) => (
                    <Cell key={i} fill={COLORES[i % COLORES.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(valor: number) => formatearCOP(BigInt(valor))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ClayCard>
          <ClayCard variant="flat" className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-text-secondary">
                  <th className="py-2 pr-4">Método</th>
                  <th className="py-2 pr-4">Total</th>
                  <th className="py-2 pr-4">Pagos</th>
                  <th className="py-2 pr-4">%</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.metodo} className="border-b border-black/5 text-text-primary">
                    <td className="py-2 pr-4">{ETIQUETA_METODO[f.metodo] ?? f.metodo}</td>
                    <td className="py-2 pr-4 font-mono">{formatearCOP(BigInt(f.totalCop))}</td>
                    <td className="py-2 pr-4">{f.numPagos}</td>
                    <td className="py-2 pr-4">{f.porcentaje.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ClayCard>
          <BotonExportar
            filas={filas}
            columnas={[
              { clave: "metodo", encabezado: "Método" },
              { clave: "totalCop", encabezado: "Total (COP)" },
              { clave: "numPagos", encabezado: "Pagos" },
              { clave: "porcentaje", encabezado: "%" },
            ]}
            nombreArchivo="ventas-por-metodo-pago"
          />
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: `app/(admin)/reportes/metodos-pago/page.tsx`**

```typescript
import { VistaMetodosPago } from "./VistaMetodosPago";

export default function MetodosPagoPage() {
  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Ventas por método de pago</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">
        Participación de cada método de pago en el rango seleccionado.
      </p>
      <VistaMetodosPago />
    </main>
  );
}
```

- [ ] **Step 5: Verificar suite completa**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 152/152 tests. `/reportes/metodos-pago` debe aparecer como ruta estática o dinámica en el build (no importa cuál, ambas están protegidas por middleware).

- [ ] **Step 6: Commit**

```bash
git add "app/(admin)/reportes/metodos-pago" package.json pnpm-lock.yaml
git commit -m "feat: reporte de ventas por metodo de pago"
```

---

### Task 6: Reporte de ventas por canal

**Files:**
- Create: `app/(admin)/reportes/canales/actions.ts`
- Create: `app/(admin)/reportes/canales/page.tsx`
- Create: `app/(admin)/reportes/canales/VistaCanales.tsx`

**Interfaces:**
- Consumes: RPC `fn_reporte_canales` (Task 1); `SelectorRangoFecha`, `BotonExportar` (Task 4); `resolverRangoPreset`, `type RangoFechas` (Task 2); `formatearCOP` de `@/lib/money`.
- Produces: `obtenerReporteCanales(desde: string, hasta: string): Promise<Result<FilaCanal[], DomainError>>` con `interface FilaCanal { canal: string; totalCop: number; numPedidos: number; porcentaje: number }`.

- [ ] **Step 1: `app/(admin)/reportes/canales/actions.ts`**

```typescript
"use server";

import { err, ok, type DomainError, type Result } from "@/lib/result";
import { createServerSupabase } from "@/lib/supabase/server";

async function exigirAdmin(): Promise<Result<null, DomainError>> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return err({ codigo: "NO_AUTORIZADO", mensaje: "Inicia sesión de nuevo" });
  if (user.app_metadata?.rol !== "admin") {
    return err({ codigo: "NO_AUTORIZADO", mensaje: "Solo el administrador puede ver reportes" });
  }
  return ok(null);
}

export interface FilaCanal {
  canal: string;
  totalCop: number;
  numPedidos: number;
  porcentaje: number;
}

export async function obtenerReporteCanales(
  desde: string,
  hasta: string,
): Promise<Result<FilaCanal[], DomainError>> {
  const ctx = await exigirAdmin();
  if (!ctx.ok) return ctx;
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("fn_reporte_canales", {
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos cargar el reporte. Intenta de nuevo." });
  }

  return ok(
    (data ?? []).map((fila) => ({
      canal: fila.canal,
      totalCop: fila.total_cop,
      numPedidos: fila.num_pedidos,
      porcentaje: Number(fila.porcentaje),
    })),
  );
}
```

- [ ] **Step 2: `app/(admin)/reportes/canales/VistaCanales.tsx`**

```typescript
"use client";

import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { ClayCard } from "@/components/ui/ClayCard";
import { SelectorRangoFecha } from "@/components/reportes/SelectorRangoFecha";
import { BotonExportar } from "@/components/reportes/BotonExportar";
import { formatearCOP } from "@/lib/money";
import { resolverRangoPreset, type RangoFechas } from "@/lib/reportes/rangosFecha";
import { obtenerReporteCanales, type FilaCanal } from "./actions";

const COLORES = ["#F5B822", "#7CB342", "#D84315"];

const ETIQUETA_CANAL: Record<string, string> = {
  mesa: "Mesa",
  domicilio: "Domicilio",
  llevar: "Para llevar",
};

export function VistaCanales() {
  const [rango, setRango] = useState<RangoFechas>(() => resolverRangoPreset("mes"));
  const [filas, setFilas] = useState<FilaCanal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    obtenerReporteCanales(rango.desde.toISOString(), rango.hasta.toISOString()).then((resultado) => {
      if (cancelado) return;
      setCargando(false);
      if (!resultado.ok) {
        setError(resultado.error.mensaje);
        return;
      }
      setFilas(resultado.valor);
    });
    return () => {
      cancelado = true;
    };
  }, [rango]);

  const datosGrafica = filas.map((f) => ({ nombre: ETIQUETA_CANAL[f.canal] ?? f.canal, valor: f.totalCop }));

  return (
    <div className="flex flex-col gap-6">
      <SelectorRangoFecha onCambiar={setRango} />
      {error ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {error}
        </p>
      ) : null}
      {!cargando && !error && filas.length === 0 ? (
        <p className="text-sm text-text-secondary">Sin ventas en este período.</p>
      ) : null}
      {filas.length > 0 ? (
        <>
          <ClayCard variant="flat" className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={datosGrafica} dataKey="valor" nameKey="nombre" outerRadius={100} label>
                  {datosGrafica.map((_, i) => (
                    <Cell key={i} fill={COLORES[i % COLORES.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(valor: number) => formatearCOP(BigInt(valor))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ClayCard>
          <ClayCard variant="flat" className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-text-secondary">
                  <th className="py-2 pr-4">Canal</th>
                  <th className="py-2 pr-4">Total</th>
                  <th className="py-2 pr-4">Pedidos</th>
                  <th className="py-2 pr-4">%</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.canal} className="border-b border-black/5 text-text-primary">
                    <td className="py-2 pr-4">{ETIQUETA_CANAL[f.canal] ?? f.canal}</td>
                    <td className="py-2 pr-4 font-mono">{formatearCOP(BigInt(f.totalCop))}</td>
                    <td className="py-2 pr-4">{f.numPedidos}</td>
                    <td className="py-2 pr-4">{f.porcentaje.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ClayCard>
          <BotonExportar
            filas={filas}
            columnas={[
              { clave: "canal", encabezado: "Canal" },
              { clave: "totalCop", encabezado: "Total (COP)" },
              { clave: "numPedidos", encabezado: "Pedidos" },
              { clave: "porcentaje", encabezado: "%" },
            ]}
            nombreArchivo="ventas-por-canal"
          />
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: `app/(admin)/reportes/canales/page.tsx`**

```typescript
import { VistaCanales } from "./VistaCanales";

export default function CanalesPage() {
  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Ventas por canal</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">
        Participación de mesa, domicilio y para llevar en el rango seleccionado.
      </p>
      <VistaCanales />
    </main>
  );
}
```

- [ ] **Step 4: Verificar suite completa**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 152/152 tests.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/reportes/canales"
git commit -m "feat: reporte de ventas por canal"
```

---

### Task 7: Reporte de ventas por rango (con mapa de calor y comparativo)

**Files:**
- Create: `app/(admin)/reportes/ventas/actions.ts`
- Create: `app/(admin)/reportes/ventas/page.tsx`
- Create: `app/(admin)/reportes/ventas/VistaVentas.tsx`

**Interfaces:**
- Consumes: RPC `fn_reporte_ventas_rango`, `fn_reporte_ticket_promedio_global`, `fn_reporte_mapa_calor_horas` (Task 1); `SelectorRangoFecha`, `StatCard`, `BotonExportar`, `MapaCalorVentas`, `type CeldaMapaCalor` (Task 4); `resolverRangoPreset`, `rangoAnterior`, `type RangoFechas` (Task 2); `formatearCOP` de `@/lib/money`.
- Produces: `obtenerVentasRango`, `obtenerTicketPromedioGlobal`, `obtenerMapaCalor` — Server Actions consumidas solo por `VistaVentas.tsx` en esta misma tarea.

- [ ] **Step 1: `app/(admin)/reportes/ventas/actions.ts`**

```typescript
"use server";

import { err, ok, type DomainError, type Result } from "@/lib/result";
import { createServerSupabase } from "@/lib/supabase/server";

async function exigirAdmin(): Promise<Result<null, DomainError>> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return err({ codigo: "NO_AUTORIZADO", mensaje: "Inicia sesión de nuevo" });
  if (user.app_metadata?.rol !== "admin") {
    return err({ codigo: "NO_AUTORIZADO", mensaje: "Solo el administrador puede ver reportes" });
  }
  return ok(null);
}

export interface FilaVentaDiaria {
  dia: string;
  canal: string;
  numPedidos: number;
  subtotalCop: number;
  descuentoCop: number;
  propinaCop: number;
  totalCop: number;
}

export async function obtenerVentasRango(
  desde: string,
  hasta: string,
  canal: string | null,
): Promise<Result<FilaVentaDiaria[], DomainError>> {
  const ctx = await exigirAdmin();
  if (!ctx.ok) return ctx;
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("fn_reporte_ventas_rango", {
    p_desde: desde,
    p_hasta: hasta,
    p_canal: canal,
  });
  if (error) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos cargar el reporte. Intenta de nuevo." });
  }
  return ok(
    (data ?? []).map((f) => ({
      dia: f.dia,
      canal: f.canal,
      numPedidos: f.num_pedidos,
      subtotalCop: f.subtotal_cop,
      descuentoCop: f.descuento_cop,
      propinaCop: f.propina_cop,
      totalCop: f.total_cop,
    })),
  );
}

export interface TicketPromedioGlobal {
  ticketPromedioCop: number;
  numPedidos: number;
}

export async function obtenerTicketPromedioGlobal(
  desde: string,
  hasta: string,
): Promise<Result<TicketPromedioGlobal, DomainError>> {
  const ctx = await exigirAdmin();
  if (!ctx.ok) return ctx;
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("fn_reporte_ticket_promedio_global", {
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos cargar el reporte. Intenta de nuevo." });
  }
  const fila = (data ?? [])[0];
  return ok({
    ticketPromedioCop: fila?.ticket_promedio_cop ?? 0,
    numPedidos: fila?.num_pedidos ?? 0,
  });
}

export interface CeldaMapaCalorReporte {
  diaSemana: number;
  hora: number;
  promedioCop: number;
  numPedidos: number;
}

export async function obtenerMapaCalor(
  desde: string,
  hasta: string,
): Promise<Result<CeldaMapaCalorReporte[], DomainError>> {
  const ctx = await exigirAdmin();
  if (!ctx.ok) return ctx;
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("fn_reporte_mapa_calor_horas", {
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos cargar el reporte. Intenta de nuevo." });
  }
  return ok(
    (data ?? []).map((f) => ({
      diaSemana: f.dia_semana,
      hora: f.hora,
      promedioCop: f.promedio_cop,
      numPedidos: f.num_pedidos,
    })),
  );
}
```

- [ ] **Step 2: `app/(admin)/reportes/ventas/VistaVentas.tsx`**

Nota importante: `f.dia` es un `date` de Postgres (`"YYYY-MM-DD"`), ya en calendario Bogotá — **nunca** se envuelve en `new Date(...)` + conversor de zona horaria (`new Date("2026-07-15")` es medianoche UTC, que cae en el día anterior al convertir a Bogotá). Se muestra tal cual o se recorta con slicing de string.

```typescript
"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ClayCard } from "@/components/ui/ClayCard";
import { StatCard } from "@/components/ui/StatCard";
import { SelectorRangoFecha } from "@/components/reportes/SelectorRangoFecha";
import { BotonExportar } from "@/components/reportes/BotonExportar";
import { MapaCalorVentas } from "@/components/reportes/MapaCalorVentas";
import { formatearCOP } from "@/lib/money";
import { resolverRangoPreset, rangoAnterior, type RangoFechas } from "@/lib/reportes/rangosFecha";
import {
  obtenerVentasRango,
  obtenerTicketPromedioGlobal,
  obtenerMapaCalor,
  type FilaVentaDiaria,
  type CeldaMapaCalorReporte,
} from "./actions";

const ETIQUETA_CANAL: Record<string, string> = { mesa: "Mesa", domicilio: "Domicilio", llevar: "Para llevar" };

function totalizar(filas: FilaVentaDiaria[]) {
  return filas.reduce(
    (acc, f) => ({
      totalCop: acc.totalCop + f.totalCop,
      descuentoCop: acc.descuentoCop + f.descuentoCop,
      numPedidos: acc.numPedidos + f.numPedidos,
    }),
    { totalCop: 0, descuentoCop: 0, numPedidos: 0 },
  );
}

function porDia(filas: FilaVentaDiaria[]) {
  const mapa = new Map<string, number>();
  for (const f of filas) {
    mapa.set(f.dia, (mapa.get(f.dia) ?? 0) + f.totalCop);
  }
  return Array.from(mapa.entries())
    .map(([dia, total]) => ({ dia, total }))
    .sort((a, b) => a.dia.localeCompare(b.dia));
}

export function VistaVentas() {
  const [rango, setRango] = useState<RangoFechas>(() => resolverRangoPreset("mes"));
  const [canal, setCanal] = useState("");
  const [comparar, setComparar] = useState(false);
  const [filas, setFilas] = useState<FilaVentaDiaria[]>([]);
  const [filasAnterior, setFilasAnterior] = useState<FilaVentaDiaria[]>([]);
  const [ticketPromedio, setTicketPromedio] = useState<number | null>(null);
  const [mapaCalor, setMapaCalor] = useState<CeldaMapaCalorReporte[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    const canalFiltro = canal || null;

    async function cargar() {
      const [resVentas, resTicket, resMapa] = await Promise.all([
        obtenerVentasRango(rango.desde.toISOString(), rango.hasta.toISOString(), canalFiltro),
        obtenerTicketPromedioGlobal(rango.desde.toISOString(), rango.hasta.toISOString()),
        obtenerMapaCalor(rango.desde.toISOString(), rango.hasta.toISOString()),
      ]);
      if (cancelado) return;
      if (!resVentas.ok) {
        setCargando(false);
        setError(resVentas.error.mensaje);
        return;
      }
      if (!resTicket.ok) {
        setCargando(false);
        setError(resTicket.error.mensaje);
        return;
      }
      if (!resMapa.ok) {
        setCargando(false);
        setError(resMapa.error.mensaje);
        return;
      }
      setFilas(resVentas.valor);
      setTicketPromedio(resTicket.valor.ticketPromedioCop);
      setMapaCalor(resMapa.valor);

      if (comparar) {
        const anterior = rangoAnterior(rango);
        const resAnterior = await obtenerVentasRango(
          anterior.desde.toISOString(),
          anterior.hasta.toISOString(),
          canalFiltro,
        );
        if (cancelado) return;
        if (resAnterior.ok) setFilasAnterior(resAnterior.valor);
      } else {
        setFilasAnterior([]);
      }
      setCargando(false);
    }
    cargar();
    return () => {
      cancelado = true;
    };
  }, [rango, canal, comparar]);

  const totales = useMemo(() => totalizar(filas), [filas]);
  const totalesAnterior = useMemo(() => totalizar(filasAnterior), [filasAnterior]);
  const datosBarra = useMemo(() => porDia(filas), [filas]);

  const deltaTotal =
    comparar && totalesAnterior.totalCop > 0
      ? ((totales.totalCop - totalesAnterior.totalCop) / totalesAnterior.totalCop) * 100
      : undefined;
  const deltaPedidos =
    comparar && totalesAnterior.numPedidos > 0
      ? ((totales.numPedidos - totalesAnterior.numPedidos) / totalesAnterior.numPedidos) * 100
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <SelectorRangoFecha onCambiar={setRango} />
        <select
          value={canal}
          onChange={(e) => setCanal(e.target.value)}
          className="h-9 rounded-clay-md bg-surface-sunken px-3 text-sm text-text-primary shadow-clay-pressed"
        >
          <option value="">Todos los canales</option>
          <option value="mesa">Mesa</option>
          <option value="domicilio">Domicilio</option>
          <option value="llevar">Para llevar</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={comparar} onChange={(e) => setComparar(e.target.checked)} />
          Comparar con período anterior
        </label>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {error}
        </p>
      ) : null}
      {!cargando && !error && filas.length === 0 ? (
        <p className="text-sm text-text-secondary">Sin ventas en este período.</p>
      ) : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard titulo="Total vendido" valor={formatearCOP(BigInt(totales.totalCop))} deltaPorcentaje={deltaTotal} />
        <StatCard titulo="Pedidos" valor={String(totales.numPedidos)} deltaPorcentaje={deltaPedidos} />
        <StatCard
          titulo="Ticket promedio"
          valor={ticketPromedio !== null ? formatearCOP(BigInt(ticketPromedio)) : "—"}
        />
        <StatCard titulo="Descuentos" valor={formatearCOP(BigInt(totales.descuentoCop))} />
      </div>

      {datosBarra.length > 0 ? (
        <ClayCard variant="flat" className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={datosBarra}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="dia" tickFormatter={(v: string) => v.slice(8, 10)} tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v: number) => formatearCOP(BigInt(v))} width={90} />
              <Tooltip formatter={(v: number) => formatearCOP(BigInt(v))} />
              <Bar dataKey="total" fill="#F5B822" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ClayCard>
      ) : null}

      {mapaCalor.length > 0 ? (
        <ClayCard variant="flat">
          <h2 className="mb-3 font-display text-lg text-text-primary">Mapa de calor semanal</h2>
          <MapaCalorVentas celdas={mapaCalor} />
        </ClayCard>
      ) : null}

      {filas.length > 0 ? (
        <>
          <ClayCard variant="flat" className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-text-secondary">
                  <th className="py-2 pr-4">Día</th>
                  <th className="py-2 pr-4">Canal</th>
                  <th className="py-2 pr-4">Pedidos</th>
                  <th className="py-2 pr-4">Total</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={`${f.dia}-${f.canal}`} className="border-b border-black/5 text-text-primary">
                    <td className="py-2 pr-4">{f.dia}</td>
                    <td className="py-2 pr-4">{ETIQUETA_CANAL[f.canal] ?? f.canal}</td>
                    <td className="py-2 pr-4">{f.numPedidos}</td>
                    <td className="py-2 pr-4 font-mono">{formatearCOP(BigInt(f.totalCop))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ClayCard>
          <BotonExportar
            filas={filas}
            columnas={[
              { clave: "dia", encabezado: "Día" },
              { clave: "canal", encabezado: "Canal" },
              { clave: "numPedidos", encabezado: "Pedidos" },
              { clave: "totalCop", encabezado: "Total (COP)" },
            ]}
            nombreArchivo="ventas-por-rango"
          />
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: `app/(admin)/reportes/ventas/page.tsx`**

```typescript
import { VistaVentas } from "./VistaVentas";

export default function VentasPage() {
  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Ventas</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">
        Ventas por rango de fecha, mapa de calor semanal y comparativo período contra período.
      </p>
      <VistaVentas />
    </main>
  );
}
```

- [ ] **Step 4: Verificar suite completa**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 152/152 tests.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/reportes/ventas"
git commit -m "feat: reporte de ventas por rango con mapa de calor y comparativo de periodo"
```

---

### Task 8: Navegación, verificación en vivo y reconciliación

**Files:**
- Modify: `components/admin/AdminNav.tsx` (agregar enlaces a Reportes, Auditoría y Anular — los dos últimos quedaron sin enlace desde el Bloque 8, corrección de paso <20 líneas por CLAUDE.md §0.1)
- Modify: `CLAUDE.md` (solo si la verificación revela una divergencia real)

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Agregar enlaces faltantes a `AdminNav`**

```typescript
// components/admin/AdminNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  UtensilsCrossed,
  Grid3x3,
  BarChart3,
  History,
  Ban,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface EnlaceNav {
  href: string;
  etiqueta: string;
  icono: LucideIcon;
}

const ENLACES: EnlaceNav[] = [
  { href: "/dashboard", etiqueta: "Panel", icono: LayoutDashboard },
  { href: "/menu", etiqueta: "Menú", icono: UtensilsCrossed },
  { href: "/mesas", etiqueta: "Mesas", icono: Grid3x3 },
  { href: "/reportes/ventas", etiqueta: "Reportes", icono: BarChart3 },
  { href: "/auditoria", etiqueta: "Auditoría", icono: History },
  { href: "/anular", etiqueta: "Anular pedido", icono: Ban },
];

function esActivo(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Navegación lateral del panel de administración (CLAUDE.md §5, §8.4). */
export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación de administración"
      className="flex shrink-0 flex-col gap-2 border-r border-white/10 bg-brand-chocolate-3 p-4 sm:w-56"
    >
      {ENLACES.map(({ href, etiqueta, icono: Icono }) => {
        const activo = esActivo(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={activo ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-clay-md px-4 py-3 font-display text-sm font-semibold transition-colors duration-150",
              "focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2",
              activo
                ? "bg-brand-chocolate-2 text-brand-mostaza"
                : "text-brand-crema/70 hover:bg-brand-chocolate-2 hover:text-brand-crema",
            )}
          >
            <Icono size={20} aria-hidden="true" />
            {etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
```

Nota: `esActivo("/reportes/ventas", "/reportes/ventas")` marca "Reportes" activo solo en `/reportes/ventas` — cuando existan `/reportes/metodos-pago`/`/reportes/canales` en la nav (no se agregan aún: un solo enlace "Reportes" apunta a la página de ventas como entrada principal; un submenú con las 3 páginas se agrega en el Bloque 9c cuando estén todas las páginas de reportes).

- [ ] **Step 2: Verificación en vivo de las 6 funciones (usuario admin de prueba)**

a. Con el token del admin de prueba (mismo mecanismo de `generate_link`+`verify` del Bloque 8 — sin tocar contraseñas reales), crear 2-3 pedidos de prueba en estado `cobrado` con `service_role` (distintos canales, un pago en `pagos` para al menos uno), y llamar cada una de las 6 funciones vía curl:

```bash
cd /c/PROYECTOS/CRIOLLITAS
set -a; source .env.local; set +a
ADMIN_TOKEN="<token del admin de prueba>"
for FN in fn_reporte_ventas_rango fn_reporte_mapa_calor_horas fn_reporte_ticket_promedio_global fn_reporte_ticket_promedio_canal fn_reporte_metodos_pago fn_reporte_canales; do
  echo "--- $FN ---"
  curl -s -w "\nHTTP:%{http_code}\n" -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/$FN" \
    -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"p_desde":"2026-01-01T00:00:00Z","p_hasta":"2026-12-31T00:00:00Z"}'
done
```

Expected: `200` en las 6, con filas reflejando los pedidos de prueba creados.

b. Con el token de la cajera de prueba (rol no-admin, pero con SELECT legítimo sobre pedidos `cobrado` de su sede — el caso que motivó el guard `current_rol() = 'admin'`), repetir la misma llamada a `fn_reporte_ventas_rango`. Expected: `200` con `[]` (el guard filtra, no un error — mismo patrón de "RLS filtra, no 403" ya usado en `auditoria`/`anulaciones`).

c. Limpiar los pedidos/pagos de prueba creados en el paso (a) con `service_role`.

- [ ] **Step 3: Reconciliar CLAUDE.md si hace falta**

Revisar §7 (¿el modelo de datos documentado sigue siendo preciso, o hace falta mencionar `vw_ventas_diarias` y las funciones `fn_reporte_*` reales en vez de los nombres aspiracionales `fn_reporte_rango`/`vw_top_productos`/etc.?), §5 (la estructura de carpetas ya mostraba `reportes/ventas`, `reportes/metodos-pago`, `reportes/canales` — confirmar que coincide). Si algo diverge, corregirlo; si no, no tocar nada por tocar.

- [ ] **Step 4: Verificación final**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 152/152 tests. Flujo dev: login admin → clic en "Reportes" en la nav → `/reportes/ventas` → cambiar rango, activar "Comparar con período anterior", exportar CSV y XLSX → navegar a "Métodos de pago" y "Canales" (vía URL directa, sin enlace de nav todavía) → confirmar gráficas y exportación.

- [ ] **Step 5: Commit**

```bash
git add components/admin/AdminNav.tsx CLAUDE.md
git commit -m "feat: enlaces de navegacion a reportes/auditoria/anular y verificacion en vivo del bloque 9a"
```

(Si no hubo cambios en CLAUDE.md, el commit incluye solo `AdminNav.tsx`.)

---

## Self-Review (del autor del plan)

**Cobertura del spec:** Vista + 6 funciones (decisión de arquitectura): Task 1. Librería XLSX `xlsx` (decisión 2): Task 3. Mapa de calor por promedio (decisión 3): función `fn_reporte_mapa_calor_horas` en Task 1 usa `avg`, no `sum`. "Venta" = `cobrado` (decisión 4): filtro `estado = 'cobrado'` en la vista y en las 4 funciones que no la usan. Sin selector de sede (decisión 5): ninguna función expone `p_sede`, confirmado. Las 3 páginas (ventas/metodos-pago/canales): Tasks 5-7. Comparativo período: Task 7 (`rangoAnterior` + segunda llamada a `fn_reporte_ventas_rango`). Exportación CSV/XLSX en las 3 páginas: `BotonExportar` en Tasks 5-7. TDD de `rangosFecha`/`exportar`: Tasks 2-3. Verificación en vivo de las 6 RPC: Task 8.

**Placeholders:** ninguno — todo el código de cada step está completo.

**Consistencia de tipos:** `RangoFechas` (Task 2) se consume sin modificación en `SelectorRangoFecha` (Task 4) y en las 3 vistas cliente (Tasks 5-7). `ColumnaExport` (Task 3) se consume sin modificación en `BotonExportar` (Task 4). `CeldaMapaCalor` (Task 4, en `MapaCalorVentas.tsx`) y `CeldaMapaCalorReporte` (Task 7, en `actions.ts`) son intencionalmente dos interfaces con la misma forma pero nombres distintos — `VistaVentas.tsx` las trata como estructuralmente compatibles (TypeScript structural typing), sin necesidad de que compartan el nombre; se documenta aquí para que no se lea como una inconsistencia real. `FilaVentaDiaria`, `FilaMetodoPago`, `FilaCanal`, `TicketPromedioGlobal` cada uno definido y consumido dentro de su propia tarea, sin cruce entre páginas.

**Nota de diseño agregada durante el self-review**: el guard `current_rol() = 'admin'` dentro de cada función/vista (no mencionado explícitamente en la spec original) se agrega aquí porque la spec asumía que la RLS de `pedidos`/`pagos` bastaba para restringir por rol — pero Cajera tiene SELECT legítimo sobre pedidos `cobrado` de su sede (necesario para su propio flujo de cobro), lo cual sin este guard le daría acceso de facto a reportes agregados que CLAUDE.md §2.1 le niega explícitamente. Es una corrección de diseño, no una desviación de alcance.
