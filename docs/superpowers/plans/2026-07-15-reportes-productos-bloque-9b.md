# Bloque 9b (Reportes: Productos y Categorías) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al Administrador reportes de "productos más vendidos" (top 10 graficado + tabla completa, ordenable por unidades o ingreso) y "categorías más vendidas" (torta + participación %), reutilizando toda la infraestructura de reportes ya construida en el Bloque 9a.

**Architecture:** 2 funciones RPC de solo lectura (`security invoker`, guard doble `current_rol()='admin'` + `sede_id=current_sede_id()` desde el primer commit) que agregan `pedido_items` join `pedidos`/`productos`/`categorias`. 2 páginas cliente nuevas bajo `app/(admin)/reportes/`, cada una con su Server Action y componente `Vista*.tsx`, siguiendo exactamente el molde de `reportes/canales` del Bloque 9a. El layout de tabs existente (`app/(admin)/reportes/layout.tsx`) se extiende con 2 entradas nuevas.

**Tech Stack:** Next.js 15 App Router, TypeScript estricto, Supabase (Postgres + RLS), Recharts (ya instalado), Zod, Vitest.

## Global Constraints

- CLAUDE.md §13.4: no calcular reportes en el cliente — toda agregación vive en funciones SQL. El reordenamiento del toggle "Unidades/Ingreso" en `reportes/productos` es una excepción explícitamente aceptada: ordena un array ya agregado por SQL, no recalcula nada.
- CLAUDE.md §13.3: dinero como `bigint`/centavos en SQL; `number` en interfaces TypeScript (precedente Bloque 8/9a), envuelto en `BigInt(...)` solo al formatear con `formatearCOP`.
- "Venta" = pedido en estado `cobrado` (mismo criterio del Bloque 9a). `anulado` excluido.
- **Guard doble desde el primer commit** (lección aprendida en la revisión final del Bloque 9a, donde faltó en 4 de 6 funciones y tuvo que corregirse después): toda función/vista de reporte debe llevar `and public.current_rol() = 'admin'` **y** `and p.sede_id = public.current_sede_id()` (o el alias correspondiente) directamente en su propio `WHERE`, sin depender solo de RLS.
- Patrón RPC establecido: `revoke execute ... from public` **y** `from anon` explícitamente, `grant execute ... to authenticated`.
- Productos/categorías inactivos (`activo=false`/`activa=false`) NO se filtran en los reportes — deben seguir apareciendo con su nombre real en reportes históricos (soft-delete, CLAUDE.md §13.8).
- Todos los tests existentes deben seguir verdes en cada tarea (152 en `main` a la fecha de este plan).

---

### Task 1: Migración SQL — fn_reporte_productos y fn_reporte_categorias

**Files:**
- Create: `supabase/migrations/20260717100000_reportes_productos_categorias.sql`
- Modify: `lib/supabase/types.ts` (regenerar tras aplicar en cloud)

**Interfaces:**
- Produces: funciones `public.fn_reporte_productos(p_desde timestamptz, p_hasta timestamptz)` y `public.fn_reporte_categorias(p_desde timestamptz, p_hasta timestamptz)` — llamadas vía `supabase.rpc(...)` desde las Server Actions de las Tasks 2 y 3.

- [ ] **Step 1: Escribir la migración completa**

```sql
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
```

- [ ] **Step 2: Aplicar en Supabase cloud**

Run: `supabase db push` (confirmar `Y`). Debe terminar sin errores.

- [ ] **Step 3: Regenerar tipos y aplicar el diff quirúrgicamente**

```bash
supabase gen types typescript --linked > /tmp/types_nuevo.ts
```

NO sobreescribir `lib/supabase/types.ts` completo (precedente CRLF+BOM, Bloques 8-9a). Extraer del archivo nuevo las 2 funciones nuevas del bloque `public.Functions`, insertadas alfabéticamente: `fn_reporte_categorias` va antes de `fn_reporte_canales`... **verificar el orden exacto alfabético real contra el output de `supabase gen types`** (candidatos: entre `fn_reporte_canales` y `fn_reporte_mapa_calor_horas` para `fn_reporte_categorias`; entre `fn_reporte_metodos_pago` y `fn_reporte_ticket_promedio_canal` para `fn_reporte_productos`), con `Args`/`Returns` alfabetizados igual que las funciones del Bloque 9a.

- [ ] **Step 4: Verificación en vivo — anon rechazado**

```bash
cd /c/PROYECTOS/CRIOLLITAS
set -a; source .env.local; set +a
curl -s -w "\nHTTP:%{http_code}\n" -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/fn_reporte_productos" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_desde":"2026-01-01T00:00:00Z","p_hasta":"2026-12-31T00:00:00Z"}'
```

Expected: `401` con `code: "42501"`.

- [ ] **Step 5: Verificar suite completa**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 152/152 tests (esta tarea no agrega tests, solo SQL + tipos).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260717100000_reportes_productos_categorias.sql lib/supabase/types.ts
git commit -m "feat: funciones RPC de reportes de productos y categorias (bloque 9b)"
```

---

### Task 2: Reporte de productos más vendidos

**Files:**
- Create: `app/(admin)/reportes/productos/actions.ts`
- Create: `app/(admin)/reportes/productos/page.tsx`
- Create: `app/(admin)/reportes/productos/VistaProductos.tsx`

**Interfaces:**
- Consumes: RPC `fn_reporte_productos` (Task 1); `SelectorRangoFecha`, `BotonExportar` de `@/components/reportes/`; `resolverRangoPreset`, `type RangoFechas` de `@/lib/reportes/rangosFecha`; `formatearCOP` de `@/lib/money`.
- Produces: `obtenerReporteProductos(desde: string, hasta: string): Promise<Result<FilaProducto[], DomainError>>` con `interface FilaProducto { productoId: string; nombre: string; categoriaId: string; categoriaNombre: string; unidades: number; ingresoCop: number }` — usada solo por `VistaProductos.tsx` en esta misma tarea.

- [ ] **Step 1: `app/(admin)/reportes/productos/actions.ts`**

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

export interface FilaProducto {
  productoId: string;
  nombre: string;
  categoriaId: string;
  categoriaNombre: string;
  unidades: number;
  ingresoCop: number;
}

export async function obtenerReporteProductos(
  desde: string,
  hasta: string,
): Promise<Result<FilaProducto[], DomainError>> {
  const ctx = await exigirAdmin();
  if (!ctx.ok) return ctx;
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("fn_reporte_productos", {
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos cargar el reporte. Intenta de nuevo." });
  }

  return ok(
    (data ?? []).map((fila) => ({
      productoId: fila.producto_id,
      nombre: fila.nombre,
      categoriaId: fila.categoria_id,
      categoriaNombre: fila.categoria_nombre,
      unidades: fila.unidades,
      ingresoCop: fila.ingreso_cop,
    })),
  );
}
```

- [ ] **Step 2: `app/(admin)/reportes/productos/VistaProductos.tsx`**

```typescript
"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ClayCard } from "@/components/ui/ClayCard";
import { ClayButton } from "@/components/ui/ClayButton";
import { SelectorRangoFecha } from "@/components/reportes/SelectorRangoFecha";
import { BotonExportar } from "@/components/reportes/BotonExportar";
import { formatearCOP } from "@/lib/money";
import { resolverRangoPreset, type RangoFechas } from "@/lib/reportes/rangosFecha";
import { obtenerReporteProductos, type FilaProducto } from "./actions";

type CriterioOrden = "unidades" | "ingreso";

export function VistaProductos() {
  const [rango, setRango] = useState<RangoFechas>(() => resolverRangoPreset("mes"));
  const [filas, setFilas] = useState<FilaProducto[]>([]);
  const [criterio, setCriterio] = useState<CriterioOrden>("ingreso");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    obtenerReporteProductos(rango.desde.toISOString(), rango.hasta.toISOString()).then((resultado) => {
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

  const filasOrdenadas = useMemo(() => {
    const copia = [...filas];
    copia.sort((a, b) => (criterio === "unidades" ? b.unidades - a.unidades : b.ingresoCop - a.ingresoCop));
    return copia;
  }, [filas, criterio]);

  const top10 = filasOrdenadas.slice(0, 10);
  const datosGrafica = top10.map((f) => ({
    nombre: f.nombre,
    valor: criterio === "unidades" ? f.unidades : f.ingresoCop,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <SelectorRangoFecha onCambiar={setRango} />
        <div className="flex items-end gap-2">
          <span className="text-sm text-text-secondary">Ordenar por:</span>
          <ClayButton
            type="button"
            variant={criterio === "unidades" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setCriterio("unidades")}
          >
            Unidades
          </ClayButton>
          <ClayButton
            type="button"
            variant={criterio === "ingreso" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setCriterio("ingreso")}
          >
            Ingreso
          </ClayButton>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {error}
        </p>
      ) : null}
      {!cargando && !error && filas.length === 0 ? (
        <p className="text-sm text-text-secondary">Sin ventas en este período.</p>
      ) : null}

      {top10.length > 0 ? (
        <ClayCard variant="flat" className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={datosGrafica} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number"
                tickFormatter={(v: number) => (criterio === "ingreso" ? formatearCOP(BigInt(v)) : String(v))}
              />
              <YAxis type="category" dataKey="nombre" width={160} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: unknown) =>
                  typeof v === "number" ? (criterio === "ingreso" ? formatearCOP(BigInt(v)) : String(v)) : ""
                }
              />
              <Bar dataKey="valor" fill="#F5B822" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ClayCard>
      ) : null}

      {filasOrdenadas.length > 0 ? (
        <>
          <ClayCard variant="flat" className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-text-secondary">
                  <th className="py-2 pr-4">Producto</th>
                  <th className="py-2 pr-4">Categoría</th>
                  <th className="py-2 pr-4">Unidades</th>
                  <th className="py-2 pr-4">Ingreso</th>
                </tr>
              </thead>
              <tbody>
                {filasOrdenadas.map((f) => (
                  <tr key={f.productoId} className="border-b border-black/5 text-text-primary">
                    <td className="py-2 pr-4">{f.nombre}</td>
                    <td className="py-2 pr-4">{f.categoriaNombre}</td>
                    <td className="py-2 pr-4">{f.unidades}</td>
                    <td className="py-2 pr-4 font-mono">{formatearCOP(BigInt(f.ingresoCop))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ClayCard>
          <BotonExportar
            filas={filasOrdenadas as unknown as Record<string, unknown>[]}
            columnas={[
              { clave: "nombre", encabezado: "Producto" },
              { clave: "categoriaNombre", encabezado: "Categoría" },
              { clave: "unidades", encabezado: "Unidades" },
              { clave: "ingresoCop", encabezado: "Ingreso (COP)" },
            ]}
            nombreArchivo="productos-mas-vendidos"
          />
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: `app/(admin)/reportes/productos/page.tsx`**

```typescript
import { VistaProductos } from "./VistaProductos";

export default function ProductosPage() {
  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Productos más vendidos</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">
        Top de productos por unidades o por ingreso en el rango seleccionado.
      </p>
      <VistaProductos />
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
git add "app/(admin)/reportes/productos"
git commit -m "feat: reporte de productos mas vendidos"
```

---

### Task 3: Reporte de categorías más vendidas

**Files:**
- Create: `app/(admin)/reportes/categorias/actions.ts`
- Create: `app/(admin)/reportes/categorias/page.tsx`
- Create: `app/(admin)/reportes/categorias/VistaCategorias.tsx`

**Interfaces:**
- Consumes: RPC `fn_reporte_categorias` (Task 1); `SelectorRangoFecha`, `BotonExportar` de `@/components/reportes/`; `resolverRangoPreset`, `type RangoFechas` de `@/lib/reportes/rangosFecha`; `formatearCOP` de `@/lib/money`.
- Produces: `obtenerReporteCategorias(desde: string, hasta: string): Promise<Result<FilaCategoria[], DomainError>>` con `interface FilaCategoria { categoriaId: string; categoriaNombre: string; unidades: number; ingresoCop: number; porcentaje: number }`.

- [ ] **Step 1: `app/(admin)/reportes/categorias/actions.ts`**

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

export interface FilaCategoria {
  categoriaId: string;
  categoriaNombre: string;
  unidades: number;
  ingresoCop: number;
  porcentaje: number;
}

export async function obtenerReporteCategorias(
  desde: string,
  hasta: string,
): Promise<Result<FilaCategoria[], DomainError>> {
  const ctx = await exigirAdmin();
  if (!ctx.ok) return ctx;
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("fn_reporte_categorias", {
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos cargar el reporte. Intenta de nuevo." });
  }

  return ok(
    (data ?? []).map((fila) => ({
      categoriaId: fila.categoria_id,
      categoriaNombre: fila.categoria_nombre,
      unidades: fila.unidades,
      ingresoCop: fila.ingreso_cop,
      porcentaje: Number(fila.porcentaje),
    })),
  );
}
```

- [ ] **Step 2: `app/(admin)/reportes/categorias/VistaCategorias.tsx`**

```typescript
"use client";

import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { ClayCard } from "@/components/ui/ClayCard";
import { SelectorRangoFecha } from "@/components/reportes/SelectorRangoFecha";
import { BotonExportar } from "@/components/reportes/BotonExportar";
import { formatearCOP } from "@/lib/money";
import { resolverRangoPreset, type RangoFechas } from "@/lib/reportes/rangosFecha";
import { obtenerReporteCategorias, type FilaCategoria } from "./actions";

const COLORES = ["#F5B822", "#7CB342", "#D84315", "#52281A", "#D69A0C", "#9CCC65"];

export function VistaCategorias() {
  const [rango, setRango] = useState<RangoFechas>(() => resolverRangoPreset("mes"));
  const [filas, setFilas] = useState<FilaCategoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    obtenerReporteCategorias(rango.desde.toISOString(), rango.hasta.toISOString()).then((resultado) => {
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

  const datosGrafica = filas.map((f) => ({ nombre: f.categoriaNombre, valor: f.ingresoCop }));

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
                <Tooltip formatter={(valor) => (typeof valor === "number" ? formatearCOP(BigInt(valor)) : "")} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ClayCard>
          <ClayCard variant="flat" className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-text-secondary">
                  <th className="py-2 pr-4">Categoría</th>
                  <th className="py-2 pr-4">Unidades</th>
                  <th className="py-2 pr-4">Ingreso</th>
                  <th className="py-2 pr-4">%</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.categoriaId} className="border-b border-black/5 text-text-primary">
                    <td className="py-2 pr-4">{f.categoriaNombre}</td>
                    <td className="py-2 pr-4">{f.unidades}</td>
                    <td className="py-2 pr-4 font-mono">{formatearCOP(BigInt(f.ingresoCop))}</td>
                    <td className="py-2 pr-4">{f.porcentaje.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ClayCard>
          <BotonExportar
            filas={filas as unknown as Record<string, unknown>[]}
            columnas={[
              { clave: "categoriaNombre", encabezado: "Categoría" },
              { clave: "unidades", encabezado: "Unidades" },
              { clave: "ingresoCop", encabezado: "Ingreso (COP)" },
              { clave: "porcentaje", encabezado: "%" },
            ]}
            nombreArchivo="categorias-mas-vendidas"
          />
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: `app/(admin)/reportes/categorias/page.tsx`**

```typescript
import { VistaCategorias } from "./VistaCategorias";

export default function CategoriasPage() {
  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Categorías más vendidas</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">
        Participación de cada categoría en el rango seleccionado.
      </p>
      <VistaCategorias />
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
git add "app/(admin)/reportes/categorias"
git commit -m "feat: reporte de categorias mas vendidas"
```

---

### Task 4: Navegación, verificación en vivo y reconciliación

**Files:**
- Modify: `app/(admin)/reportes/layout.tsx:11-15` (agregar 2 entradas al array `TABS`)
- Modify: `CLAUDE.md` (solo si la verificación revela una divergencia real)

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Agregar los 2 tabs nuevos**

```typescript
// app/(admin)/reportes/layout.tsx — reemplazar el array TABS existente por:
const TABS: TabReporte[] = [
  { href: "/reportes/ventas", etiqueta: "Ventas" },
  { href: "/reportes/metodos-pago", etiqueta: "Métodos de pago" },
  { href: "/reportes/canales", etiqueta: "Canales" },
  { href: "/reportes/productos", etiqueta: "Productos" },
  { href: "/reportes/categorias", etiqueta: "Categorías" },
];
```

(El resto del archivo — `esActivo`, el componente `ReportesLayout`, los estilos de los tabs — no cambia.)

- [ ] **Step 2: Verificación en vivo de las 2 funciones (usuario admin y cajera de prueba)**

a. Con `service_role`, crear datos de prueba mínimos: 1 pedido en estado `cobrado`, 2 `pedido_items` de productos existentes en categorías distintas (usar productos/categorías reales del seed, `select id, nombre, categoria_id from productos limit 5` para elegir IDs válidos — no crear productos/categorías nuevos, reutilizar los del seed).

b. Con el token del admin de prueba (mecanismo `generate_link`+`verify`, sin tocar contraseñas — mismo patrón usado en el Bloque 9a Task 8), llamar ambas funciones vía curl y confirmar `200` con filas reflejando los `pedido_items` de prueba:

```bash
cd /c/PROYECTOS/CRIOLLITAS
set -a; source .env.local; set +a
ADMIN_TOKEN="<token del admin de prueba>"
for FN in fn_reporte_productos fn_reporte_categorias; do
  echo "--- $FN ---"
  curl -s -w "\nHTTP:%{http_code}\n" -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/$FN" \
    -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"p_desde":"2026-01-01T00:00:00Z","p_hasta":"2026-12-31T00:00:00Z"}'
done
```

c. Con el token de la cajera de prueba, repetir la llamada a `fn_reporte_productos`. Expected: `200` con `[]` (el guard `current_rol()='admin'` filtra, no un error).

d. Limpiar los `pedido_items`/`pedidos` de prueba creados en el paso (a) con `service_role`.

- [ ] **Step 3: Reconciliar CLAUDE.md si hace falta**

Revisar §7 (¿el bloque de comentario "Pendientes (bloques 9b/9c)" agregado en el Bloque 9a debe actualizarse ahora que `fn_reporte_productos`/`fn_reporte_categorias` sí existen?), §5 (la estructura de carpetas ya mostraba `reportes/productos` — confirmar que coincide, agregar `reportes/categorias` si falta). Si algo diverge, corregirlo; si no, no tocar nada por tocar.

- [ ] **Step 4: Verificación final**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 152/152 tests. Flujo dev: login admin → tabs de Reportes muestran 5 pestañas → clic en "Productos" → cambiar rango, alternar Unidades/Ingreso, exportar CSV/XLSX → clic en "Categorías" → confirmar gráfica de torta y exportación.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/reportes/layout.tsx" CLAUDE.md
git commit -m "feat: navegacion de productos/categorias y verificacion en vivo del bloque 9b"
```

(Si no hubo cambios en CLAUDE.md, el commit incluye solo `layout.tsx`.)

---

## Self-Review (del autor del plan)

**Cobertura del spec:** Top 10 fijo + tabla completa (decisión 1): Task 2, `top10 = filasOrdenadas.slice(0, 10)` para el gráfico, tabla y export usan `filasOrdenadas` completo. Toggle unidades/ingreso reordenando en cliente (decisión 2): Task 2, `criterio`/`useMemo` con un único RPC. Dos páginas separadas (decisión 3): Tasks 2 y 3. Sin filtro de `activo`/`activa` (decisión 4): ninguna de las 2 funciones de la Task 1 referencia esas columnas. Guard doble desde el primer commit: presente en ambas funciones de la Task 1, verbatim. Verificación en vivo: Task 4.

**Placeholders:** ninguno — todo el código de cada step está completo.

**Consistencia de tipos:** `RangoFechas`/`resolverRangoPreset` (ya existentes del 9a) se consumen sin modificación en Tasks 2 y 3. `FilaProducto` (Task 2) y `FilaCategoria` (Task 3) cada uno definido y consumido dentro de su propia tarea, sin cruce. `BotonExportar`/`SelectorRangoFecha` (ya existentes) se consumen con el mismo patrón de cast `as unknown as Record<string, unknown>[]` ya establecido y aprobado en la revisión del Bloque 9a (Tasks 5-7) — se documenta aquí para que el implementador no lo reinvente de otra forma.

**Nota de diseño agregada durante el self-review**: la Task 1 recuerda explícitamente en su propio comentario SQL por qué el guard doble va desde el primer commit (evitar repetir el fix posterior que hizo falta en el Bloque 9a) — esto no estaba en la spec de forma tan explícita, se agrega aquí porque es la lección más cara aprendida en el bloque anterior y vale la pena que quede visible en el código mismo, no solo en este plan.
