# Bloque H — Logo global con header sticky Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el logo de Criollitas sea visible en toda la app (excepto KDS), siempre presente al hacer scroll, integrado de forma distinta según el grupo de rutas ya validado con mockups.

**Architecture:** Un componente `LogoCriollitas` reutilizable (usa `next/image` sobre `public/logo.png`, ya comiteado) con dos tamaños. Cajera/Vendedora lo integran en su barra de navegación existente (ahora sticky). Admin gana una barra nueva y delgada encima de su estructura actual, sin tocar el sidebar. Login/PIN ganan su primer layout, con la misma barra delgada.

**Tech Stack:** Next.js 15 (`next/image`), Tailwind CSS (clases ya existentes del sistema Claymorphism).

## Global Constraints

- Español de Colombia en todo texto visible (CLAUDE.md §13.11) — alt text incluido.
- `KDS` (`app/(cocina)/`) queda exento — ningún archivo de ese grupo se toca.
- Todos los headers nuevos/modificados usan `position: sticky` (clase `sticky top-0`), `z-index` explícito, y fondo sólido `bg-brand-chocolate` — nunca transparentes al hacer scroll debajo.
- El sidebar de Admin (`AdminNav`) no se modifica en absoluto.
- Sin cambios a middleware, RLS, ni lógica de negocio — este bloque es 100% estructural/visual.
- `pnpm lint && pnpm test && pnpm build` deben quedar en verde al final de cada tarea. 162 tests en `main` a la fecha de este plan (confirmar corriendo `pnpm test` al iniciar).
- Windows: `git commit -F <tempfile>` en vez de heredocs. Trailer: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: Componente `LogoCriollitas`

**Files:**
- Create: `components/ui/LogoCriollitas.tsx`

**Interfaces:**
- Produces: `export function LogoCriollitas({ size }: { size?: "sm" | "md" }): JSX.Element` — `size` por defecto `"md"`. Consumido por las Tasks 2, 3 y 4.

- [ ] **Step 1: Crear el componente**

```typescript
import Image from "next/image";

export interface LogoCriollitasProps {
  /** "md": integrado en una barra con navegación (Cajera/Vendedora).
   *  "sm": barra delgada de solo logo (Admin/Auth). */
  size?: "sm" | "md";
}

const ALTURA_PX: Record<"sm" | "md", number> = { sm: 36, md: 48 };
const RATIO_ANCHO_ALTO = 1536 / 1024;

/** Logo de Criollitas (public/logo.png, PNG con transparencia real, sin
 *  recorte necesario). Tamaño fijo por altura -- el ancho se deriva de la
 *  proporción real del archivo (3:2) para no deformarlo. */
export function LogoCriollitas({ size = "md" }: LogoCriollitasProps) {
  const altura = ALTURA_PX[size];
  return (
    <Image
      src="/logo.png"
      alt="Criollitas — Arepas Rellenas"
      width={Math.round(altura * RATIO_ANCHO_ALTO)}
      height={altura}
      priority
    />
  );
}
```

- [ ] **Step 2: `pnpm lint && pnpm build`**

Run: `pnpm lint && pnpm build`
Expected: exit 0 en ambos (el componente aún no se usa desde ninguna página, pero debe compilar de forma aislada).

- [ ] **Step 3: Commit**

```bash
git add components/ui/LogoCriollitas.tsx
git commit -F- <<'MSG'
feat: componente LogoCriollitas reutilizable

MSG
```

---

### Task 2: Logo en los headers de Cajera y Vendedora

**Files:**
- Modify: `app/(cajera)/layout.tsx`
- Modify: `app/(vendedora)/layout.tsx`

**Interfaces:**
- Consumes: `LogoCriollitas` (Task 1), tamaño `"md"`.

- [ ] **Step 1: `app/(cajera)/layout.tsx` — agregar el logo y hacer el header sticky**

Reemplazar el contenido completo del archivo por:

```typescript
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LogoCriollitas } from "@/components/ui/LogoCriollitas";
import { BotonCerrarSesion } from "@/components/auth/BotonCerrarSesion";

export default function CajeraLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-brand-chocolate">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-brand-chocolate px-8 py-4">
        <LogoCriollitas size="md" />
        <Link
          href="/pedidos"
          className="inline-flex items-center gap-2 font-display text-lg text-brand-crema/70 transition-colors duration-150 hover:text-brand-crema focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2"
        >
          <ArrowLeft size={20} aria-hidden="true" />
          Caja
        </Link>
        <div className="flex flex-wrap items-center gap-6">
          <Link
            href="/inicio"
            className="font-display text-sm text-brand-crema/70 transition-colors duration-150 hover:text-brand-crema focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2"
          >
            Tomar pedido
          </Link>
          <Link
            href="/pedidos-en-curso"
            className="font-display text-sm text-brand-crema/70 transition-colors duration-150 hover:text-brand-crema focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2"
          >
            Domicilios y para llevar
          </Link>
          <Link
            href="/mi-turno"
            className="font-display text-sm text-brand-crema/70 transition-colors duration-150 hover:text-brand-crema focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2"
          >
            Mi turno
          </Link>
          <Link
            href="/turno/cerrar"
            className="font-display text-sm text-brand-crema/70 transition-colors duration-150 hover:text-brand-crema focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2"
          >
            Cerrar turno
          </Link>
          <BotonCerrarSesion />
        </div>
      </header>
      {children}
    </div>
  );
}
```

Nota: se agregó `flex-wrap` al `<header>` (ausente antes) para que el logo + los links se envuelvan en varias líneas en pantallas angostas, en vez de desbordar horizontalmente — coincide con el mockup de layout aprobado (Opción A: una sola fila que se envuelve en móvil). Se cambió `py-6` a `py-4` para compensar la altura que agrega el logo sin que el header quede demasiado alto.

- [ ] **Step 2: `app/(vendedora)/layout.tsx` — agregar el logo y hacer el header sticky**

Reemplazar el contenido completo del archivo por:

```typescript
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { LogoCriollitas } from "@/components/ui/LogoCriollitas";
import { BotonCerrarSesion } from "@/components/auth/BotonCerrarSesion";

export default async function VendedoraLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Estas rutas (/inicio, /pedido/*, /mis-pedidos) son compartidas con la
  // cajera desde el bloque E -- cuando toma un pedido, necesita un camino
  // de regreso a caja (cobro) que la vendedora no necesita, porque ella no
  // tiene turno/caja propios.
  const esCajera = user?.app_metadata?.rol === "cajera";

  return (
    <div className="min-h-dvh bg-brand-chocolate">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-brand-chocolate px-8 py-4">
        <LogoCriollitas size="md" />
        <Link
          href="/inicio"
          className="inline-flex items-center gap-2 font-display text-lg text-brand-crema/70 transition-colors duration-150 hover:text-brand-crema focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2"
        >
          <ArrowLeft size={20} aria-hidden="true" />
          Ventas
        </Link>
        <div className="flex flex-wrap items-center gap-6">
          {esCajera ? (
            <Link
              href="/pedidos"
              className="font-display text-sm text-brand-crema/70 transition-colors duration-150 hover:text-brand-crema focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2"
            >
              Volver a caja
            </Link>
          ) : null}
          <Link
            href="/mis-pedidos"
            className="font-display text-sm text-brand-crema/70 transition-colors duration-150 hover:text-brand-crema focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2"
          >
            Domicilios y para llevar
          </Link>
          <BotonCerrarSesion />
        </div>
      </header>
      {children}
    </div>
  );
}
```

Nota: si al leer el archivo real su contenido difiere del reproducido aquí (por cambios posteriores a la redacción de este plan), usar el contenido real como base y aplicar el mismo patrón de cambios: agregar el import de `LogoCriollitas`, insertar `<LogoCriollitas size="md" />` como primer hijo del `<header>` (antes del link "Ventas"), agregar `sticky top-0 z-10 flex-wrap` y `bg-brand-chocolate` a las clases del `<header>`, sin tocar el resto de la lógica ni los links existentes.

- [ ] **Step 3: `pnpm lint && pnpm test && pnpm build`**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: exit 0 en los tres, 162/162 tests.

- [ ] **Step 4: Commit**

```bash
git add "app/(cajera)/layout.tsx" "app/(vendedora)/layout.tsx"
git commit -F- <<'MSG'
feat: logo sticky en los headers de cajera y vendedora

MSG
```

---

### Task 3: Barra de logo en Admin, sin tocar el sidebar

**Files:**
- Modify: `app/(admin)/layout.tsx`

**Interfaces:**
- Consumes: `LogoCriollitas` (Task 1), tamaño `"sm"`.

- [ ] **Step 1: Agregar la barra de logo encima de la estructura actual**

Reemplazar el contenido completo del archivo por:

```typescript
import { AdminNav } from "@/components/admin/AdminNav";
import { LogoCriollitas } from "@/components/ui/LogoCriollitas";
import { BotonCerrarSesion } from "@/components/auth/BotonCerrarSesion";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-brand-chocolate">
      <header className="sticky top-0 z-20 flex justify-center border-b border-white/10 bg-brand-chocolate px-8 py-3 sm:justify-start">
        <LogoCriollitas size="sm" />
      </header>
      <header className="flex items-center justify-between border-b border-white/10 px-8 py-6">
        <span className="font-display text-lg text-brand-crema/70">Administración</span>
        <BotonCerrarSesion />
      </header>
      <div className="flex flex-1 flex-col sm:flex-row">
        <AdminNav />
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
```

Nota: dos `<header>` distintos y correcto en HTML (cada uno es una landmark region propia) — el primero es la barra de logo (nueva, `z-20` para quedar por encima del segundo header cuando ambos son sticky y se solapan al hacer scroll), el segundo es el header de rol ya existente ("Administración" + `BotonCerrarSesion`), intacto salvo que ahora queda debajo de la barra de logo. `AdminNav` no se modifica.

- [ ] **Step 2: `pnpm lint && pnpm test && pnpm build`**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: exit 0 en los tres, 162/162 tests.

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/layout.tsx"
git commit -F- <<'MSG'
feat: barra de logo sticky en Admin, sidebar intacto

MSG
```

---

### Task 4: Layout nuevo para Login y PIN

**Files:**
- Create: `app/(auth)/layout.tsx`
- Modify: `app/(auth)/login/page.tsx`
- Modify: `app/(auth)/pin/page.tsx`

**Interfaces:**
- Consumes: `LogoCriollitas` (Task 1), tamaño `"sm"`.

- [ ] **Step 1: Crear `app/(auth)/layout.tsx`**

```typescript
import { LogoCriollitas } from "@/components/ui/LogoCriollitas";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-brand-chocolate">
      <header className="sticky top-0 z-10 flex justify-center border-b border-white/10 bg-brand-chocolate px-8 py-3 sm:justify-start">
        <LogoCriollitas size="sm" />
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Ajustar `app/(auth)/login/page.tsx` — el layout ya aporta `min-h-dvh`, la página solo centra su contenido en el espacio restante**

Reemplazar:

```typescript
    <main className="flex min-h-dvh items-center justify-center p-6">
```

por:

```typescript
    <main className="flex flex-1 items-center justify-center p-6">
```

(El resto del archivo no cambia.)

- [ ] **Step 3: Ajustar `app/(auth)/pin/page.tsx` de la misma forma**

Reemplazar:

```typescript
    <main className="flex min-h-dvh items-center justify-center p-6">
```

por:

```typescript
    <main className="flex flex-1 items-center justify-center p-6">
```

(El resto del archivo no cambia.)

- [ ] **Step 4: `pnpm lint && pnpm test && pnpm build`**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: exit 0 en los tres, 162/162 tests.

- [ ] **Step 5: Commit**

```bash
git add "app/(auth)/layout.tsx" "app/(auth)/login/page.tsx" "app/(auth)/pin/page.tsx"
git commit -F- <<'MSG'
feat: primer layout para login/pin, con barra de logo sticky

MSG
```

---

### Task 5: Verificación manual en `pnpm dev`

**Files:** Ninguno (verificación visual, sin cambios de código).

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Correr la suite completa**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: todo verde.

- [ ] **Step 2: Levantar el servidor de desarrollo**

Run: `pnpm dev`

- [ ] **Step 3: Verificar cada grupo de rutas en desktop y en móvil (DevTools, viewport angosto ~375px)**

- `/login`: logo centrado en móvil, alineado a la izquierda en desktop, visible arriba.
- `/pin`: mismo comportamiento que `/login`.
- Como admin: cualquier página de `/dashboard`, `/menu`, etc. — barra de logo arriba, header "Administración" debajo, sidebar intacto a la izquierda (en desktop) o donde ya estaba en móvil.
- Como cajera: `/pedidos` — logo + navegación en una sola fila que se envuelve en móvil; hacer scroll en una página larga (ej. con varios pedidos) y confirmar que el header se mantiene visible arriba.
- Como vendedora: `/inicio` — mismo comportamiento.
- KDS (`/kds`, como cocina o admin): confirmar que NO aparece ningún logo ni cambio visual.

- [ ] **Step 4: Detener el servidor de desarrollo**

No se requiere commit en esta task — es solo verificación.

---

## Self-Review

**Cobertura del spec:** componente `LogoCriollitas` con dos tamaños (Task 1); integración en Cajera/Vendedora como una sola fila sticky que se envuelve en móvil, mockup Opción A (Task 2); barra de logo separada en Admin sin tocar el sidebar, mockup Opción D (Task 3); primer layout para Login/PIN con la misma barra delgada (Task 4); KDS sin ningún archivo tocado en todo el plan (cumple explícitamente); verificación visual manual de los 6 puntos de acceso (Task 5).

**Placeholders:** ninguno.

**Consistencia de tipos:** `LogoCriollitasProps.size?: "sm" | "md"` es el mismo tipo en la Task 1 (definición) y su uso en las Tasks 2 (`size="md"`), 3 y 4 (`size="sm"`).
