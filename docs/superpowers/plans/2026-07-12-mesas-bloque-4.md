# Mesas (Bloque 4) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gestión de mesas: tabla con RLS + Realtime, seed de 5 mesas, parrilla de estado en vivo, CRUD de admin en `/mesas`, y barra de navegación del admin.

**Architecture:** Migración SQL nueva (`mesas` + enum + Realtime publication) en el cloud deliarepas; `/mesas` como pantalla de admin (Server Component + Server Actions con `Result<T, DomainError>`); parrilla client con suscripción Supabase Realtime; UI Claymorphism reutilizando `ClayModal`/`ClayBadge` del bloque 3 más un `MesaTile` nuevo.

**Tech Stack:** Todo instalado (Next 15, zod v4, react-hook-form, cva, @supabase/supabase-js/ssr, vitest). Sin dependencias nuevas.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-12-mesas-bloque-4-design.md`. CLAUDE.md manda.
- Dinero N/A en este bloque. Soft delete siempre (`activa=false`); jamás DELETE (§13.8).
- Español CO en todo texto visible; dominio en español, infra en inglés.
- Server Components por defecto; `"use client"` solo interactividad. Mutaciones SOLO por Server Actions (§12).
- Errores de dominio: `Result<T, DomainError>` de `@/lib/result` (ya existe: `ok`/`err`/`DomainError` con `codigo: VALIDACION | NO_AUTORIZADO | NO_ENCONTRADO | BASE_DATOS`).
- Autorización: rol/sede se leen de **`app_metadata`** (no `user_metadata`). `exigirAdmin` y las funciones SQL `public.current_rol()`/`public.current_sede_id()` ya leen de ahí.
- TDD para lógica de negocio. `pnpm lint && pnpm test && pnpm build` verdes antes del commit final de cada task (suite base: 71 tests).
- Commits: Conventional español + trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. PowerShell 5.1: `git commit -F <tempfile>` (here-strings fallan). Regenerar tipos con `supabase gen types typescript --linked | Out-File -Encoding utf8 lib/supabase/types.ts`.
- Cloud: ref `btiejgeljpwsqwckuocs`; migraciones `supabase db push` con `$env:SUPABASE_ACCESS_TOKEN` (el controller lo provee); SQL ad-hoc y verificación vía Management API `POST https://api.supabase.com/v1/projects/btiejgeljpwsqwckuocs/database/query` (Bearer = access token).
- Sede seed: `00000000-0000-4000-8000-000000000001`.
- Queries a `usuarios`: SIEMPRE columnas explícitas (REVOKE de pin_hash). En `mesas` no aplica (sin columnas revocadas), pero se usan columnas explícitas por consistencia.
- Rama: `feature/mesas-bloque-4`. No commitear reportes de `.superpowers/` (gitignored).

---

### Task 1: Migración de mesas + Realtime + seed + tipos

**Files:**
- Create: `supabase/migrations/<timestamp>_mesas_base.sql` (timestamp real posterior a `20260712120000_auth_app_metadata.sql`, p. ej. `20260712130000_mesas_base.sql`)
- Modify: `lib/supabase/types.ts` (regenerado)

**Interfaces:**
- Produces: enum `public.estado_mesa`; tabla `public.mesas`; 5 filas seed; tabla en la publicación `supabase_realtime`; tipos regenerados con `mesas` en `Database`.

- [ ] **Step 1: Escribir la migración**

```sql
create type public.estado_mesa as enum ('libre', 'ocupada', 'reservada');

create table public.mesas (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references public.sedes (id),
  numero integer not null check (numero > 0),
  nombre text not null,
  capacidad integer not null default 4 check (capacidad between 1 and 20),
  activa boolean not null default true,
  estado public.estado_mesa not null default 'libre',
  creado_en timestamptz not null default now(),
  unique (sede_id, numero)
);

create index mesas_sede_activa on public.mesas (sede_id, activa);

alter table public.mesas enable row level security;

-- Lectura: personal autenticado de la sede
create policy mesas_select on public.mesas
  for select to authenticated using (sede_id = public.current_sede_id());

-- Escritura: solo admin de la sede. Sin policy de DELETE (soft delete).
create policy mesas_admin_insert on public.mesas
  for insert to authenticated
  with check (public.current_rol() = 'admin' and sede_id = public.current_sede_id());
create policy mesas_admin_update on public.mesas
  for update to authenticated
  using (public.current_rol() = 'admin' and sede_id = public.current_sede_id())
  with check (public.current_rol() = 'admin' and sede_id = public.current_sede_id());

-- Realtime: emitir cambios de fila de mesas (RLS sigue aplicando por suscriptor)
alter publication supabase_realtime add table public.mesas;

-- Seed idempotente de 5 mesas
insert into public.mesas (id, sede_id, numero, nombre, capacidad) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000001', 1, 'Mesa 1', 4),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000001', 2, 'Mesa 2', 4),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000001', 3, 'Mesa 3', 4),
  ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-000000000001', 4, 'Mesa 4', 4),
  ('00000000-0000-4000-8000-000000000405', '00000000-0000-4000-8000-000000000001', 5, 'Mesa 5', 4)
on conflict (id) do nothing;
```

- [ ] **Step 2: Aplicar** — `supabase db push`. Verificar por Management API: `select count(*) from public.mesas;` → 5; `select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename='mesas';` → 1.

- [ ] **Step 3: Regenerar tipos** — `supabase gen types typescript --linked | Out-File -Encoding utf8 lib/supabase/types.ts`. Confirmar que contiene `mesas` y `estado_mesa`. `pnpm build` → exit 0.

- [ ] **Step 4: Commit** — `feat: migración de mesas con RLS, Realtime y seed de 5 mesas`

---

### Task 2: Helper de estado de mesa (TDD)

**Files:**
- Create: `lib/mesas/estado.ts`, `tests/unit/estado-mesa.test.ts`

**Interfaces:**
- Produces:
  - `type EstadoMesa = "libre" | "ocupada" | "reservada"`
  - `metaEstadoMesa(estado: EstadoMesa): { etiqueta: string; claseFondo: string; claseTexto: string }` — mapeo puro a etiqueta en español y clases Tailwind de color (§8.3: libre=verde, ocupada=mostaza, reservada=tomate suaves). Un valor fuera del enum cae a un fallback neutro seguro.

- [ ] **Step 1: Test que falla (`tests/unit/estado-mesa.test.ts`)**

```ts
import { describe, expect, it } from "vitest";
import { metaEstadoMesa } from "@/lib/mesas/estado";

describe("metaEstadoMesa", () => {
  it("mapea libre a verde", () => {
    const m = metaEstadoMesa("libre");
    expect(m.etiqueta).toBe("Libre");
    expect(m.claseFondo).toContain("verde");
  });
  it("mapea ocupada a mostaza", () => {
    const m = metaEstadoMesa("ocupada");
    expect(m.etiqueta).toBe("Ocupada");
    expect(m.claseFondo).toContain("mostaza");
  });
  it("mapea reservada a tomate", () => {
    const m = metaEstadoMesa("reservada");
    expect(m.etiqueta).toBe("Reservada");
    expect(m.claseFondo).toContain("tomate");
  });
  it("cae a un fallback seguro para un valor desconocido", () => {
    // @ts-expect-error probamos un valor fuera del enum a propósito
    const m = metaEstadoMesa("gris");
    expect(m.etiqueta).toBe("Libre");
    expect(typeof m.claseFondo).toBe("string");
  });
});
```

- [ ] **Step 2: FAIL** — `pnpm test` → módulo no encontrado.

- [ ] **Step 3: Implementar `lib/mesas/estado.ts`**

```ts
export type EstadoMesa = "libre" | "ocupada" | "reservada";

interface MetaEstado {
  etiqueta: string;
  claseFondo: string;
  claseTexto: string;
}

const META: Record<EstadoMesa, MetaEstado> = {
  libre: { etiqueta: "Libre", claseFondo: "bg-brand-verde/25", claseTexto: "text-brand-chocolate" },
  ocupada: { etiqueta: "Ocupada", claseFondo: "bg-brand-mostaza/30", claseTexto: "text-brand-chocolate" },
  reservada: { etiqueta: "Reservada", claseFondo: "bg-brand-tomate/25", claseTexto: "text-brand-chocolate" },
};

export function metaEstadoMesa(estado: EstadoMesa): MetaEstado {
  return META[estado] ?? META.libre;
}
```

- [ ] **Step 4: PASS** — `pnpm test` → verde.
- [ ] **Step 5: Commit** — `feat: helper de estado de mesa con colores (TDD)`

---

### Task 3: Validación Zod de mesa (TDD)

**Files:**
- Create: `lib/validations/mesas.ts`, `tests/unit/validations-mesas.test.ts`

**Interfaces:**
- Produces: `mesaSchema` + `MesaInput`. Campos: `numero` (entero > 0), `nombre` (string opcional; si vacío/ausente la Server Action pondrá `Mesa <numero>` — el schema NO lo defaultea para no acoplar), `capacidad` (entero 1–20), `activa` (boolean, default true). Mensajes en español.

- [ ] **Step 1: Test que falla (`tests/unit/validations-mesas.test.ts`)**

```ts
import { describe, expect, it } from "vitest";
import { mesaSchema } from "@/lib/validations/mesas";

describe("mesaSchema", () => {
  it("acepta una mesa válida", () => {
    expect(mesaSchema.safeParse({ numero: 3, nombre: "Terraza", capacidad: 6, activa: true }).success).toBe(true);
  });
  it("acepta sin nombre (opcional)", () => {
    expect(mesaSchema.safeParse({ numero: 3, capacidad: 4, activa: true }).success).toBe(true);
  });
  it("rechaza número 0, negativo o decimal", () => {
    for (const numero of [0, -1, 2.5]) {
      expect(mesaSchema.safeParse({ numero, capacidad: 4, activa: true }).success).toBe(false);
    }
  });
  it("rechaza capacidad fuera de 1..20", () => {
    expect(mesaSchema.safeParse({ numero: 1, capacidad: 0, activa: true }).success).toBe(false);
    expect(mesaSchema.safeParse({ numero: 1, capacidad: 21, activa: true }).success).toBe(false);
  });
});
```

- [ ] **Step 2: FAIL** — `pnpm test` → módulo no encontrado.

- [ ] **Step 3: Implementar `lib/validations/mesas.ts`**

```ts
import { z } from "zod";

export const mesaSchema = z.object({
  numero: z
    .number("Escribe el número de la mesa")
    .int("El número no lleva decimales")
    .positive("El número debe ser mayor que cero"),
  nombre: z.string().min(1).optional(),
  capacidad: z
    .number("Escribe la capacidad")
    .int("La capacidad no lleva decimales")
    .min(1, "La capacidad mínima es 1")
    .max(20, "La capacidad máxima es 20"),
  activa: z.boolean().default(true),
});
export type MesaInput = z.infer<typeof mesaSchema>;
```

Nota zod v4: si `z.number("…")` no compila en la versión instalada, usar la forma equivalente que conserve los TEXTOS exactos (son contratos de los tests).

- [ ] **Step 4: PASS** — `pnpm test` → verde.
- [ ] **Step 5: Commit** — `feat: validación Zod de mesa (TDD)`

---

### Task 4: MesaTile

**Files:**
- Create: `components/ui/MesaTile.tsx`
- Modify: `app/design/page.tsx` (fila de muestra de los 3 estados + una inactiva)

**Interfaces:**
- Consumes: `metaEstadoMesa` (Task 2), `EstadoMesa` (Task 2), `ClayBadge`.
- Produces: `<MesaTile numero nombre capacidad estado activa onClick? />` — Server-compatible salvo que reciba `onClick` (entonces el consumidor lo monta en un client component). Props: `{ numero: number; nombre: string; capacidad: number; estado: EstadoMesa; activa: boolean; onClick?: () => void }`.

- [ ] **Step 1: Implementar `components/ui/MesaTile.tsx`**

Leer primero `components/ui/ClayCard.tsx` y `components/ui/ClayBadge.tsx` para el patrón. El tile: cuadrado (`aspect-square`), `rounded-clay-lg`, sombra clay, fondo = `metaEstadoMesa(estado).claseFondo` cuando `activa`, atenuado (`opacity-60 grayscale`) cuando `!activa`. Contenido centrado: número grande (`font-display text-4xl`), nombre debajo, capacidad con ícono de personas (texto "N pers."), y en la esquina un `ClayBadge` con la etiqueta del estado (o "Inactiva" variant alerta cuando `!activa`). Si hay `onClick`, es `<button>` con target ≥48px y focus visible mostaza; si no, `<div>`. Todo texto en español.

- [ ] **Step 2: Muestra en `/design`** — agregar una sección "Mesas" con 4 tiles: libre, ocupada, reservada, y una inactiva. (La página es Server Component; `MesaTile` sin `onClick` renderiza como `<div>`, así que va directo.)

- [ ] **Step 3: Verificar** — `pnpm lint`, `pnpm test`, `pnpm build` verdes; `/design` en dev muestra los 4 tiles con sus colores.
- [ ] **Step 4: Commit** — `feat: componente MesaTile con color por estado`

---

### Task 5: Server Actions de mesas

**Files:**
- Create: `app/(admin)/mesas/actions.ts`

**Interfaces:**
- Consumes: `mesaSchema`/`MesaInput` (Task 3), `createServerSupabase` (`@/lib/supabase/server`), `ok`/`err`/`Result`/`DomainError` (`@/lib/result`), `SEDE_DEFAULT_ID` (`@/lib/auth/roles`). Patrón `exigirAdmin` idéntico al de `app/(admin)/menu/actions.ts` (leerlo).
- Produces:
  - `crearMesa(input: MesaInput): Promise<Result<{ id: string }, DomainError>>` — sede del admin; `nombre` = `input.nombre ?? "Mesa " + input.numero`; si el insert viola `unique (sede_id, numero)` (código Postgres `23505`), devolver `err({ codigo: "VALIDACION", mensaje: "Ya existe una mesa con ese número" })`.
  - `editarMesa(id: string, input: MesaInput): Promise<Result<{ id: string }, DomainError>>` — valida `id` con `z.uuid()`; misma regla de nombre y de número duplicado.
  - `cambiarActivaMesa(id: string, activa: boolean): Promise<Result<{ id: string }, DomainError>>` — valida `id`; `.select("id").single()` para confirmar fila (si no hay fila → `NO_ENCONTRADO` "La mesa no existe").
  - Todas: `exigirAdmin()` primero, Zod al borde, `revalidatePath("/mesas")` tras mutar, nunca `throw`.

- [ ] **Step 1: Implementar `app/(admin)/mesas/actions.ts`**

Patrón (mostrado con `crearMesa`; replicar en las demás con sus firmas):

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { mesaSchema, type MesaInput } from "@/lib/validations/mesas";
import { err, ok, type DomainError, type Result } from "@/lib/result";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";

async function exigirAdmin(): Promise<Result<{ sedeId: string }, DomainError>> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return err({ codigo: "NO_AUTORIZADO", mensaje: "Inicia sesión de nuevo" });
  // app_metadata (no user_metadata): solo el service role lo escribe.
  if (user.app_metadata?.rol !== "admin") {
    return err({ codigo: "NO_AUTORIZADO", mensaje: "Solo el administrador puede editar las mesas" });
  }
  return ok({ sedeId: (user.app_metadata?.sede_id as string) ?? SEDE_DEFAULT_ID });
}

const uuidValido = (v: string) => z.uuid().safeParse(v).success;

export async function crearMesa(input: MesaInput): Promise<Result<{ id: string }, DomainError>> {
  const admin = await exigirAdmin();
  if (!admin.ok) return admin;
  const parsed = mesaSchema.safeParse(input);
  if (!parsed.success) {
    return err({ codigo: "VALIDACION", mensaje: parsed.error.issues[0]?.message ?? "Datos inválidos" });
  }
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("mesas")
    .insert({
      sede_id: admin.valor.sedeId,
      numero: parsed.data.numero,
      nombre: parsed.data.nombre ?? `Mesa ${parsed.data.numero}`,
      capacidad: parsed.data.capacidad,
      activa: parsed.data.activa,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return err({ codigo: "VALIDACION", mensaje: "Ya existe una mesa con ese número" });
    }
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos guardar la mesa. Intenta de nuevo." });
  }
  revalidatePath("/mesas");
  return ok({ id: data.id });
}
```

`editarMesa`: `if (!uuidValido(id)) return err({ codigo: "VALIDACION", mensaje: "Identificador inválido" });` luego parse + `update({...}).eq("id", id).select("id").single()` con el mismo manejo de `23505` y `NO_ENCONTRADO` si `!data`.
`cambiarActivaMesa`: valida `id`, `update({ activa }).eq("id", id).select("id").single()` → `NO_ENCONTRADO` si `error || !data`.

- [ ] **Step 2: Verificar** — `pnpm lint`, `pnpm test`, `pnpm build` verdes.
- [ ] **Step 3: Commit** — `feat: server actions de mesas con Result y validación`

---

### Task 6: GrillaMesas (Realtime) + EditorMesa

**Files:**
- Create: `components/mesas/GrillaMesas.tsx`, `components/mesas/EditorMesa.tsx`, `components/mesas/tipos.ts`

**Interfaces:**
- Consumes: `MesaTile` (Task 4), `metaEstadoMesa`/`EstadoMesa` (Task 2), actions (Task 5), `mesaSchema`/`MesaInput` (Task 3), `createClient` (`@/lib/supabase/client`), `ClayModal`/`ClayButton`/`ClayInput`.
- Produces:
  - `tipos.ts`: `type MesaVista = { id: string; numero: number; nombre: string; capacidad: number; estado: EstadoMesa; activa: boolean }`.
  - `GrillaMesas`: `<GrillaMesas mesasIniciales={MesaVista[]} sedeId={string} puedeEditar={boolean} />` (client). Estado local = `mesasIniciales`; se suscribe en `useEffect` al canal `mesas:sede_<sedeId>` (`.channel(...).on("postgres_changes", { event: "*", schema: "public", table: "mesas", filter: "sede_id=eq.<sedeId>" }, cb)`), y ante INSERT/UPDATE actualiza/inserta la fila en el estado local, ordenando por `numero`; cleanup con `supabase.removeChannel(canal)`. Si `puedeEditar`, muestra botón "+ Nueva mesa" y al hacer clic en un tile abre `EditorMesa`; si no, los tiles son de solo lectura.
  - `EditorMesa`: `<EditorMesa mesa={MesaVista | null} abierto onCerrar />` (client). `ClayModal` + `react-hook-form` + `zodResolver(mesaSchema)`; llama `crearMesa`/`editarMesa`; botón Desactivar (si `mesa` existe y está activa) → `cambiarActivaMesa(id, false)` con confirmación "La mesa deja de aparecer, pero conserva su historial"; Reactivar si está inactiva. Errores del `Result` en `<p role="alert">`; en éxito `onCerrar()` + `router.refresh()`.

- [ ] **Step 1: Implementar los tres archivos.**

Referencias a leer primero: `components/menu/GrillaProductos.tsx` + `components/menu/EditorProducto.tsx` (patrón de grilla client + editor con RHF/Result), `components/auth/PinPad.tsx` (patrón de suscripción/cleanup en `useEffect`). Canal Realtime con `createClient()` del browser. Ordenar por `numero`. El realtime callback debe usar la forma funcional de `setState` para no depender de closures viejas.

- [ ] **Step 2: Verificar** — `pnpm lint`, `pnpm test`, `pnpm build` verdes.
- [ ] **Step 3: Commit** — `feat: parrilla de mesas con Realtime y editor de mesa`

---

### Task 7: Página `/mesas` + AdminNav

**Files:**
- Create: `app/(admin)/mesas/page.tsx`, `components/admin/AdminNav.tsx`
- Modify: `app/(admin)/layout.tsx` (montar `AdminNav`), `middleware.ts` (regla `/mesas`)

**Interfaces:**
- Consumes: `GrillaMesas`/`MesaVista` (Task 6), `createServerSupabase`.
- Produces: ruta `/mesas` operativa para admin; nav del admin en todas sus páginas.

- [ ] **Step 1: `middleware.ts`** — en `PREFIJOS_POR_ROL` (dentro de `lib/auth/roles.ts` según bloque 2; localizar la tabla) cambiar la entrada de `/mesas` de `["vendedora"]` a `["admin"]`. Buscar el arreglo con `grep -n "mesas" lib/auth/roles.ts middleware.ts`. Un test de `roles.test.ts` puede referirse a `/mesas`+vendedora: actualizarlo a admin si existe.

- [ ] **Step 2: `app/(admin)/mesas/page.tsx`** (Server Component)

```tsx
import { createServerSupabase } from "@/lib/supabase/server";
import { GrillaMesas } from "@/components/mesas/GrillaMesas";
import type { MesaVista } from "@/components/mesas/tipos";

const SEDE_ID = process.env.NEXT_PUBLIC_SEDE_ID ?? "00000000-0000-4000-8000-000000000001";

export default async function MesasPage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("mesas")
    .select("id, numero, nombre, capacidad, estado, activa")
    .order("numero", { ascending: true });
  const mesas = (data ?? []) as MesaVista[];
  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Mesas</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">Gestiona las mesas del salón y observa su estado.</p>
      <GrillaMesas mesasIniciales={mesas} sedeId={SEDE_ID} puedeEditar />
    </main>
  );
}
```

- [ ] **Step 3: `components/admin/AdminNav.tsx`** (client — usa `usePathname`)

Barra lateral (o superior en móvil) con enlaces `next/link`: Panel (`/dashboard`), Menú (`/menu`), Mesas (`/mesas`). El enlace activo (comparando `usePathname()` con prefijo) va resaltado (fondo `bg-brand-chocolate-2`, texto mostaza). Íconos `lucide-react` (LayoutDashboard, UtensilsCrossed, Grid3x3). Texto español. Densidad admin.

- [ ] **Step 4: `app/(admin)/layout.tsx`** — envolver el contenido con un flex: `<AdminNav />` a un lado y `{children}` ocupando el resto. Leer el layout actual primero y preservar el fondo chocolate/estructura.

- [ ] **Step 5: Verificación manual + build** — `pnpm lint`, `pnpm test`, `pnpm build` verdes. Con sesión admin real (login `admin@criollitas.com` / `Admin.123` → PIN `1212`): `/mesas` muestra las 5 mesas; crear una mesa 6, editarla, desactivarla; intentar número duplicado → error claro; la nav resalta "Mesas" y navega a Menú/Panel.

- [ ] **Step 6: Commit** — `feat: página de mesas y navegación del admin`

---

### Task 8: Verificación Realtime + RLS + reconciliación + cierre

**Files:**
- Modify: `CLAUDE.md` (§5 nota de ruta de mesas, §9 regla de middleware)

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Verificación Realtime (manual, documentar)** — con `/mesas` abierto en el navegador (sesión admin), cambiar por Management API `update public.mesas set estado='ocupada' where numero=1;` y confirmar que el tile de la Mesa 1 se pone mostaza **sin recargar**. Revertir a `libre`.

- [ ] **Step 2: Verificación RLS (documentar status + body)** —
  a. `GET /rest/v1/mesas?select=id` con solo anon key → `200 []`.
  b. INSERT con anon → 401/403.
  c. Con sesión de un rol no admin (si existe seed; si no, documentar que solo hay admin y que la policy exige `current_rol()='admin'`) → INSERT rechazado.
  d. Con service_role → 5+ filas.

- [ ] **Step 3: Reconciliar CLAUDE.md** —
  - §5: en el árbol de carpetas, junto a `(admin)/mesas/` anotar `# CRUD + vista de estado (Realtime)` y en `(vendedora)/mesas/` anotar `# (bloque 5) reutiliza GrillaMesas para seleccionar mesa`.
  - §9: donde describe las redirecciones por rol, anotar que `/mesas` pertenece a `admin` en el bloque 4 (la vista de la vendedora llega en el bloque 5). Editar solo esas líneas.

- [ ] **Step 4: Verificación final** — `pnpm lint && pnpm test && pnpm build` verdes. Flujo dev: login admin → nav → `/mesas` con las 5 mesas.
- [ ] **Step 5: Commit** — `docs: reconciliar CLAUDE.md con la ruta de mesas del bloque 4`

---

## Notas para el ejecutor

- El controller provee `SUPABASE_ACCESS_TOKEN` en cada dispatch que toque cloud; nunca commitearlo ni imprimirlo.
- Credenciales admin de prueba: las provee el controller en el dispatch.
- Los 71 tests base deben seguir verdes en todas las tasks.
- Realtime requiere que la tabla esté en la publicación (Task 1) Y que el cliente se suscriba con el filtro de sede (Task 6); si el tile no se actualiza, revisar ambos y que RLS permita el SELECT de la fila al rol suscrito.
