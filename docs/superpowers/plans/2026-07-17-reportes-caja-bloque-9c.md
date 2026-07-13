# Bloque 9c (Reportes: Caja y Auditoría) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al Administrador dos reportes de detalle/auditoría — historial de arqueos y diferencias, y anulaciones con motivo — cerrando el 100% del alcance de Reportes que el usuario decidió mantener (CLAUDE.md §2.7, con "Descuentos y promociones aplicados" descartado por decisión explícita del usuario).

**Architecture:** 2 funciones RPC de solo lectura (`security invoker`, guard doble `current_rol()='admin'` + acotación por sede desde el primer commit) que agregan `turnos_caja`/`anulaciones` unidas a `usuarios`/`pedidos`. 2 páginas cliente nuevas bajo `app/(admin)/reportes/`, siguiendo el mismo molde de Server Action + `Vista*.tsx` de los Bloques 9a/9b, pero sin gráfica — son tablas de detalle con `StatCard`s arriba. El layout de tabs existente se extiende con 2 entradas nuevas (7 tabs en total).

**Tech Stack:** Next.js 15 App Router, TypeScript estricto, Supabase (Postgres + RLS), Zod, Vitest.

## Global Constraints

- CLAUDE.md §13.4: no calcular reportes en el cliente — toda agregación vive en funciones SQL. El coloreado verde/rojo de la diferencia de arqueo es una comparación trivial (`=== 0`) sobre un valor ya agregado, no una excepción a este principio.
- CLAUDE.md §13.3: dinero como `bigint`/centavos en SQL; `number` en interfaces TypeScript (precedente Bloques 8/9a/9b), envuelto en `BigInt(...)` solo al formatear con `formatearCOP`.
- **Guard doble desde el primer commit** (patrón obligatorio desde el Bloque 9b, sin excepción): toda función de reporte debe llevar `and public.current_rol() = 'admin'` **y** la acotación por sede correspondiente (`turnos_caja.sede_id` directo; `pedidos.sede_id` vía join para `anulaciones`, que no tiene columna `sede_id` propia — precedente del Bloque 8) directamente en su propio `WHERE`.
- Patrón RPC establecido: `revoke execute ... from public` **y** `from anon` explícitamente, `grant execute ... to authenticated`.
- Ambos reportes filtran por el momento en que el hecho ocurrió: `turnos_caja.cerrado_en` para arqueos (no `abierto_en`), `anulaciones.creado_en` para anulaciones (no la fecha del pedido original).
- "Descuentos y promociones aplicados" está fuera de alcance de este bloque — no crear ninguna página, Server Action ni función SQL para ello.
- Todos los tests existentes deben seguir verdes en cada tarea (152 en `main` a la fecha de este plan).

---

### Task 1: Migración SQL — fn_reporte_arqueos y fn_reporte_anulaciones

**Files:**
- Create: `supabase/migrations/20260718100000_reportes_caja_auditoria.sql`
- Modify: `lib/supabase/types.ts` (regenerar tras aplicar en cloud)

**Interfaces:**
- Produces: funciones `public.fn_reporte_arqueos(p_desde timestamptz, p_hasta timestamptz)` y `public.fn_reporte_anulaciones(p_desde timestamptz, p_hasta timestamptz)` — llamadas vía `supabase.rpc(...)` desde las Server Actions de las Tasks 2 y 3.

- [ ] **Step 1: Escribir la migración completa**

```sql
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
```

- [ ] **Step 2: Aplicar en Supabase cloud**

Run: `supabase db push` (confirmar `Y`). Debe terminar sin errores.

- [ ] **Step 3: Regenerar tipos y aplicar el diff quirúrgicamente**

```bash
supabase gen types typescript --linked > /tmp/types_nuevo.ts
```

NO sobreescribir `lib/supabase/types.ts` completo (precedente CRLF+BOM). Extraer del archivo nuevo las 2 funciones nuevas del bloque `public.Functions`, insertadas alfabéticamente — verificar el orden exacto real contra el output de `supabase gen types` (candidatos: `fn_reporte_anulaciones` antes de `fn_reporte_canales`; `fn_reporte_arqueos` antes de `fn_reporte_anulaciones` — confirmar orden alfabético real ya que ambos empiezan por `fn_reporte_a...`), con `Args`/`Returns` alfabetizados igual que las funciones existentes.

- [ ] **Step 4: Verificación en vivo — anon rechazado**

```bash
cd /c/PROYECTOS/CRIOLLITAS
set -a; source .env.local; set +a
curl -s -w "\nHTTP:%{http_code}\n" -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/fn_reporte_arqueos" \
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
git add supabase/migrations/20260718100000_reportes_caja_auditoria.sql lib/supabase/types.ts
git commit -m "feat: funciones RPC de reportes de arqueos y anulaciones (bloque 9c)"
```

---

### Task 2: Reporte de historial de arqueos

**Files:**
- Create: `app/(admin)/reportes/arqueos/actions.ts`
- Create: `app/(admin)/reportes/arqueos/page.tsx`
- Create: `app/(admin)/reportes/arqueos/VistaArqueos.tsx`

**Interfaces:**
- Consumes: RPC `fn_reporte_arqueos` (Task 1); `SelectorRangoFecha`, `BotonExportar` de `@/components/reportes/`; `StatCard` de `@/components/ui/StatCard`; `ClayBadge` de `@/components/ui/ClayBadge`; `resolverRangoPreset`, `type RangoFechas` de `@/lib/reportes/rangosFecha`; `formatearCOP` de `@/lib/money`; `formatearFecha` de `@/lib/dates`.
- Produces: `obtenerReporteArqueos(desde: string, hasta: string): Promise<Result<FilaArqueo[], DomainError>>` con `interface FilaArqueo { turnoId: string; cajeraNombre: string; abiertoEn: string; cerradoEn: string; efectivoInicialCop: number; esperadoCop: number; declaradoCop: number; diferenciaCop: number }`.

- [ ] **Step 1: `app/(admin)/reportes/arqueos/actions.ts`**

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

export interface FilaArqueo {
  turnoId: string;
  cajeraNombre: string;
  abiertoEn: string;
  cerradoEn: string;
  efectivoInicialCop: number;
  esperadoCop: number;
  declaradoCop: number;
  diferenciaCop: number;
}

export async function obtenerReporteArqueos(
  desde: string,
  hasta: string,
): Promise<Result<FilaArqueo[], DomainError>> {
  const ctx = await exigirAdmin();
  if (!ctx.ok) return ctx;
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("fn_reporte_arqueos", {
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos cargar el reporte. Intenta de nuevo." });
  }

  return ok(
    (data ?? []).map((fila) => ({
      turnoId: fila.turno_id,
      cajeraNombre: fila.cajera_nombre,
      abiertoEn: fila.abierto_en,
      cerradoEn: fila.cerrado_en,
      efectivoInicialCop: fila.efectivo_inicial_cop,
      esperadoCop: fila.esperado_cop ?? 0,
      declaradoCop: fila.declarado_cop ?? 0,
      diferenciaCop: fila.diferencia_cop ?? 0,
    })),
  );
}
```

Nota: `esperado_cop`/`declarado_cop`/`diferencia_cop` son nullable en `turnos_caja` (solo se llenan al cerrar), pero la función SQL ya filtra `estado = 'cerrado'`, así que en la práctica siempre vienen no-nulos — el `?? 0` es una red de seguridad defensiva contra el tipo nullable generado por Supabase, no un caso esperado.

- [ ] **Step 2: `app/(admin)/reportes/arqueos/VistaArqueos.tsx`**

```typescript
"use client";

import { useEffect, useMemo, useState } from "react";
import { ClayCard } from "@/components/ui/ClayCard";
import { StatCard } from "@/components/ui/StatCard";
import { ClayBadge } from "@/components/ui/ClayBadge";
import { SelectorRangoFecha } from "@/components/reportes/SelectorRangoFecha";
import { BotonExportar } from "@/components/reportes/BotonExportar";
import { formatearCOP } from "@/lib/money";
import { formatearFecha } from "@/lib/dates";
import { resolverRangoPreset, type RangoFechas } from "@/lib/reportes/rangosFecha";
import { obtenerReporteArqueos, type FilaArqueo } from "./actions";

export function VistaArqueos() {
  const [rango, setRango] = useState<RangoFechas>(() => resolverRangoPreset("mes"));
  const [filas, setFilas] = useState<FilaArqueo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    obtenerReporteArqueos(rango.desde.toISOString(), rango.hasta.toISOString()).then((resultado) => {
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

  const stats = useMemo(() => {
    const conDiferencia = filas.filter((f) => f.diferenciaCop !== 0);
    const sumaDiferencias = filas.reduce((acc, f) => acc + f.diferenciaCop, 0);
    return { total: filas.length, conDiferencia: conDiferencia.length, sumaDiferencias };
  }, [filas]);

  return (
    <div className="flex flex-col gap-6">
      <SelectorRangoFecha onCambiar={setRango} />
      {error ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {error}
        </p>
      ) : null}
      {!cargando && !error && filas.length === 0 ? (
        <p className="text-sm text-text-secondary">Sin turnos cerrados en este período.</p>
      ) : null}

      {filas.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard titulo="Turnos cerrados" valor={String(stats.total)} />
            <StatCard titulo="Turnos con diferencia" valor={String(stats.conDiferencia)} />
            <StatCard titulo="Suma de diferencias" valor={formatearCOP(BigInt(stats.sumaDiferencias))} />
          </div>

          <ClayCard variant="flat" className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-text-secondary">
                  <th className="py-2 pr-4">Cajera</th>
                  <th className="py-2 pr-4">Apertura</th>
                  <th className="py-2 pr-4">Cierre</th>
                  <th className="py-2 pr-4">Esperado</th>
                  <th className="py-2 pr-4">Declarado</th>
                  <th className="py-2 pr-4">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.turnoId} className="border-b border-black/5 text-text-primary">
                    <td className="py-2 pr-4">{f.cajeraNombre}</td>
                    <td className="py-2 pr-4">{formatearFecha(new Date(f.abiertoEn))}</td>
                    <td className="py-2 pr-4">{formatearFecha(new Date(f.cerradoEn))}</td>
                    <td className="py-2 pr-4 font-mono">{formatearCOP(BigInt(f.esperadoCop))}</td>
                    <td className="py-2 pr-4 font-mono">{formatearCOP(BigInt(f.declaradoCop))}</td>
                    <td className="py-2 pr-4">
                      <ClayBadge variant={f.diferenciaCop === 0 ? "exito" : "peligro"}>
                        {formatearCOP(BigInt(f.diferenciaCop))}
                      </ClayBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ClayCard>
          <BotonExportar
            filas={filas as unknown as Record<string, unknown>[]}
            columnas={[
              { clave: "cajeraNombre", encabezado: "Cajera" },
              { clave: "abiertoEn", encabezado: "Apertura" },
              { clave: "cerradoEn", encabezado: "Cierre" },
              { clave: "esperadoCop", encabezado: "Esperado (COP)" },
              { clave: "declaradoCop", encabezado: "Declarado (COP)" },
              { clave: "diferenciaCop", encabezado: "Diferencia (COP)" },
            ]}
            nombreArchivo="historial-arqueos"
          />
        </>
      ) : null}
    </div>
  );
}
```

Nota importante: `abiertoEn`/`cerradoEn` son `timestamptz` (instantes reales, no fechas-calendario tipo `date`) — a diferencia del `f.dia` de `reportes/ventas` (Bloque 9a), aquí SÍ es correcto usar `new Date(f.abiertoEn)` + `formatearFecha`, porque un `timestamptz` ISO ya lleva su offset y `new Date(...)` lo interpreta correctamente sin el bug de day-shift que afecta a los `date` puros.

- [ ] **Step 3: `app/(admin)/reportes/arqueos/page.tsx`**

```typescript
import { VistaArqueos } from "./VistaArqueos";

export default function ArqueosPage() {
  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Historial de arqueos</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">
        Turnos cerrados y su diferencia de caja en el rango seleccionado.
      </p>
      <VistaArqueos />
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
git add "app/(admin)/reportes/arqueos"
git commit -m "feat: reporte de historial de arqueos"
```

---

### Task 3: Reporte de anulaciones

**Files:**
- Create: `app/(admin)/reportes/anulaciones/actions.ts`
- Create: `app/(admin)/reportes/anulaciones/page.tsx`
- Create: `app/(admin)/reportes/anulaciones/VistaAnulaciones.tsx`

**Interfaces:**
- Consumes: RPC `fn_reporte_anulaciones` (Task 1); `SelectorRangoFecha`, `BotonExportar` de `@/components/reportes/`; `StatCard` de `@/components/ui/StatCard`; `resolverRangoPreset`, `type RangoFechas` de `@/lib/reportes/rangosFecha`; `formatearCOP` de `@/lib/money`; `formatearFecha` de `@/lib/dates`.
- Produces: `obtenerReporteAnulaciones(desde: string, hasta: string): Promise<Result<FilaAnulacion[], DomainError>>` con `interface FilaAnulacion { anulacionId: string; pedidoNumeroCorto: number; anuladoEn: string; usuarioNombre: string; motivo: string; totalCop: number }`.

- [ ] **Step 1: `app/(admin)/reportes/anulaciones/actions.ts`**

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

export interface FilaAnulacion {
  anulacionId: string;
  pedidoNumeroCorto: number;
  anuladoEn: string;
  usuarioNombre: string;
  motivo: string;
  totalCop: number;
}

export async function obtenerReporteAnulaciones(
  desde: string,
  hasta: string,
): Promise<Result<FilaAnulacion[], DomainError>> {
  const ctx = await exigirAdmin();
  if (!ctx.ok) return ctx;
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("fn_reporte_anulaciones", {
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos cargar el reporte. Intenta de nuevo." });
  }

  return ok(
    (data ?? []).map((fila) => ({
      anulacionId: fila.anulacion_id,
      pedidoNumeroCorto: fila.pedido_numero_corto,
      anuladoEn: fila.anulado_en,
      usuarioNombre: fila.usuario_nombre,
      motivo: fila.motivo,
      totalCop: fila.total_cop,
    })),
  );
}
```

- [ ] **Step 2: `app/(admin)/reportes/anulaciones/VistaAnulaciones.tsx`**

```typescript
"use client";

import { useEffect, useMemo, useState } from "react";
import { ClayCard } from "@/components/ui/ClayCard";
import { StatCard } from "@/components/ui/StatCard";
import { SelectorRangoFecha } from "@/components/reportes/SelectorRangoFecha";
import { BotonExportar } from "@/components/reportes/BotonExportar";
import { formatearCOP } from "@/lib/money";
import { formatearFecha } from "@/lib/dates";
import { resolverRangoPreset, type RangoFechas } from "@/lib/reportes/rangosFecha";
import { obtenerReporteAnulaciones, type FilaAnulacion } from "./actions";

export function VistaAnulaciones() {
  const [rango, setRango] = useState<RangoFechas>(() => resolverRangoPreset("mes"));
  const [filas, setFilas] = useState<FilaAnulacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    obtenerReporteAnulaciones(rango.desde.toISOString(), rango.hasta.toISOString()).then((resultado) => {
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

  const totalAnulado = useMemo(() => filas.reduce((acc, f) => acc + f.totalCop, 0), [filas]);

  return (
    <div className="flex flex-col gap-6">
      <SelectorRangoFecha onCambiar={setRango} />
      {error ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {error}
        </p>
      ) : null}
      {!cargando && !error && filas.length === 0 ? (
        <p className="text-sm text-text-secondary">Sin anulaciones en este período.</p>
      ) : null}

      {filas.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard titulo="Anulaciones" valor={String(filas.length)} />
            <StatCard titulo="Total anulado" valor={formatearCOP(BigInt(totalAnulado))} />
          </div>

          <ClayCard variant="flat" className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-text-secondary">
                  <th className="py-2 pr-4">Pedido</th>
                  <th className="py-2 pr-4">Fecha</th>
                  <th className="py-2 pr-4">Anulado por</th>
                  <th className="py-2 pr-4">Motivo</th>
                  <th className="py-2 pr-4">Total</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.anulacionId} className="border-b border-black/5 text-text-primary">
                    <td className="py-2 pr-4">#{f.pedidoNumeroCorto}</td>
                    <td className="py-2 pr-4">{formatearFecha(new Date(f.anuladoEn))}</td>
                    <td className="py-2 pr-4">{f.usuarioNombre}</td>
                    <td className="py-2 pr-4">{f.motivo}</td>
                    <td className="py-2 pr-4 font-mono">{formatearCOP(BigInt(f.totalCop))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ClayCard>
          <BotonExportar
            filas={filas as unknown as Record<string, unknown>[]}
            columnas={[
              { clave: "pedidoNumeroCorto", encabezado: "Pedido" },
              { clave: "anuladoEn", encabezado: "Fecha" },
              { clave: "usuarioNombre", encabezado: "Anulado por" },
              { clave: "motivo", encabezado: "Motivo" },
              { clave: "totalCop", encabezado: "Total (COP)" },
            ]}
            nombreArchivo="anulaciones"
          />
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: `app/(admin)/reportes/anulaciones/page.tsx`**

```typescript
import { VistaAnulaciones } from "./VistaAnulaciones";

export default function AnulacionesPage() {
  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Anulaciones</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">
        Pedidos anulados y su motivo en el rango seleccionado.
      </p>
      <VistaAnulaciones />
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
git add "app/(admin)/reportes/anulaciones"
git commit -m "feat: reporte de anulaciones"
```

---

### Task 4: Navegación, verificación en vivo y reconciliación

**Files:**
- Modify: `app/(admin)/reportes/layout.tsx:12-18` (agregar 2 entradas al array `TABS`)
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
  { href: "/reportes/arqueos", etiqueta: "Arqueos" },
  { href: "/reportes/anulaciones", etiqueta: "Anulaciones" },
];
```

(El resto del archivo — `esActivo`, el componente `ReportesLayout`, los estilos — no cambia.)

- [ ] **Step 2: Verificación en vivo de las 2 funciones (usuario admin y cajera de prueba)**

a. Con `service_role`, crear datos de prueba mínimos:
   - Un turno de prueba en `turnos_caja` con `estado='cerrado'`, `efectivo_inicial_cop`, `esperado_cop`, `efectivo_declarado_cop`, `diferencia_cop` (elegir valores donde `diferencia_cop` sea distinto de 0, para verificar el caso "con diferencia").
   - Un pedido de prueba en `pedidos` con `estado='cobrado'` (o cualquier estado, ya que `anular_pedido` exige `cobrado` pero aquí se inserta directo con `service_role` — usar `estado='anulado'` directamente es más simple, sin pasar por el RPC), y una fila en `anulaciones` con `pedido_id` apuntando a él y un `motivo` de prueba.

b. Con el token del admin de prueba (mecanismo `generate_link`+`verify`, sin tocar contraseñas), llamar ambas funciones vía curl y confirmar `200` con filas reflejando los datos de prueba:

```bash
cd /c/PROYECTOS/CRIOLLITAS
set -a; source .env.local; set +a
ADMIN_TOKEN="<token del admin de prueba>"
for FN in fn_reporte_arqueos fn_reporte_anulaciones; do
  echo "--- $FN ---"
  curl -s -w "\nHTTP:%{http_code}\n" -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/$FN" \
    -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"p_desde":"2026-01-01T00:00:00Z","p_hasta":"2026-12-31T00:00:00Z"}'
done
```

c. Con el token de la cajera de prueba, repetir la llamada a `fn_reporte_arqueos`. Expected: `200` con `[]` (el guard `current_rol()='admin'` filtra, no un error).

d. Limpiar los datos de prueba creados en el paso (a) con `service_role` (en orden: `anulaciones` → `pedidos` → `turnos_caja`, respetando FKs; y las filas de `auditoria` que el trigger del Bloque 8 haya generado para estos objetos de prueba, mismo patrón de limpieza usado en bloques anteriores).

- [ ] **Step 3: Reconciliar CLAUDE.md si hace falta**

Revisar §7 (agregar `fn_reporte_arqueos`/`fn_reporte_anulaciones` al bloque de comentario de reportes, junto a las funciones de los Bloques 9a/9b), §5 (la estructura de carpetas ya mostraba `reportes/arqueos`/`reportes/anulaciones` — confirmar que coincide), §2.7 (opcionalmente anotar que "Descuentos y promociones aplicados" queda fuera de alcance por decisión del usuario, si CLAUDE.md no lo refleja ya). Si algo diverge, corregirlo; si no, no tocar nada por tocar.

- [ ] **Step 4: Verificación final**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 152/152 tests. Flujo dev: login admin → tabs de Reportes muestran 7 pestañas → clic en "Arqueos" → cambiar rango, ver la diferencia coloreada, exportar CSV/XLSX → clic en "Anulaciones" → confirmar tabla y exportación.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/reportes/layout.tsx" CLAUDE.md
git commit -m "feat: navegacion de arqueos/anulaciones y verificacion en vivo del bloque 9c"
```

(Si no hubo cambios en CLAUDE.md, el commit incluye solo `layout.tsx`.)

---

## Self-Review (del autor del plan)

**Cobertura del spec:** Descuentos descartado por completo (decisión 1): ninguna tarea crea código para ello, confirmado explícitamente en las Global Constraints. Tabla + StatCards sin gráfica (decisión 2): ambas Tasks 2 y 3 no usan Recharts. Filtro por `cerrado_en`/`creado_en` (decisión 3): presente en ambas funciones de la Task 1. Guard doble desde el primer commit: presente en ambas funciones de la Task 1, verbatim. Coloreado verde/rojo de diferencia: Task 2, `ClayBadge` con `variant` condicional. Verificación en vivo: Task 4.

**Placeholders:** ninguno — todo el código de cada step está completo.

**Consistencia de tipos:** `RangoFechas`/`resolverRangoPreset`/`StatCard`/`SelectorRangoFecha`/`BotonExportar` (ya existentes) se consumen sin modificación en Tasks 2 y 3. `FilaArqueo` (Task 2) y `FilaAnulacion` (Task 3) cada uno definido y consumido dentro de su propia tarea, sin cruce. Mismo patrón de cast `as unknown as Record<string, unknown>[]` para `BotonExportar` ya establecido y aprobado en los Bloques 9a/9b.

**Nota de diseño agregada durante el self-review**: la Task 2 documenta explícitamente por qué `new Date(f.abiertoEn)`/`new Date(f.cerradoEn)` es SEGURO aquí (a diferencia del `f.dia` de `reportes/ventas`, que es un `date` puro y NO debe envolverse en `new Date()`) — porque `abierto_en`/`cerrado_en` son `timestamptz`, instantes con offset real, no fechas-calendario. Esto no estaba en la spec de forma explícita; se agrega para que un implementador que conozca la regla del Bloque 9a no aplique la misma prohibición aquí por error, donde no corresponde.
