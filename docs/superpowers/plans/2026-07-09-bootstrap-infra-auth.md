# Bootstrap Criollitas OS (Bloques 1 y 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar corriendo la base del POS Criollitas: Next.js 15 + sistema Claymorphism + login email/password + pantalla PIN con Edge Function, contra el proyecto Supabase cloud **deliarepas**.

**Architecture:** App Next.js 15 (App Router, RSC-first) en la raíz del repo; Supabase cloud vinculado con CLI (migraciones `supabase db push`); Edge Function Deno `login-pin` emite sesiones vía magic link + `verifyOtp`; middleware raíz enruta por rol leído del JWT.

**Tech Stack:** Next.js 15, TypeScript estricto, Tailwind v4, cva, react-hook-form + zod, @supabase/ssr + supabase-js, vitest, bcryptjs (Edge Function usa `hash.bcrypt` de Deno o `bcryptjs` npm), date-fns v4 + @date-fns/tz.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-09-bootstrap-infra-auth-design.md`. CLAUDE.md manda sobre todo.
- TypeScript: `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`. Nunca `any`.
- Dinero: `bigint` de centavos COP. Nunca `number`. Formato `$ 12.500` (es-CO, sin decimales).
- Fechas: siempre `America/Bogota`, locale `es-CO`.
- Todo texto visible al usuario en español de Colombia.
- Dominio en español, infraestructura en inglés. Componentes PascalCase.
- Server Components por defecto; `"use client"` solo con interactividad.
- Commits: Conventional Commits en español, con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- TDD: lógica de negocio siempre test primero (vitest). Correr `pnpm lint && pnpm test && pnpm build` antes de dar por terminado.
- Secretos solo en `.env.local` (git-ignored). Service Role Key jamás al cliente.
- Supabase project ref: `btiejgeljpwsqwckuocs` · URL `https://btiejgeljpwsqwckuocs.supabase.co`. Claves reales: las tiene el usuario en el chat / dashboard; el ejecutor las recibe ya puestas en `.env.local` (Task 1).
- Package manager: `pnpm`. Node ≥ 20.

---

### Task 1: Scaffold Next.js 15 + configuración base

**Files:**
- Create: todo el scaffold Next.js en la raíz (`app/`, `package.json`, `tsconfig.json`, `next.config.ts`, etc.)
- Create: `.env.local`, `.env.example`, `.prettierrc`, `.gitignore` (ajuste)

**Interfaces:**
- Produces: proyecto compilable (`pnpm build`), alias `@/*` a la raíz, scripts pnpm estándar.

- [ ] **Step 1: Scaffold en directorio temporal y mover a la raíz**

```powershell
$tmp = "C:\Users\Hogar\AppData\Local\Temp\criollitas-scaffold"
pnpm create next-app@15 $tmp --ts --eslint --tailwind --app --no-src-dir --import-alias "@/*" --use-pnpm --turbopack --yes
# Mover contenido (sin sobrescribir CLAUDE.md/docs/.git, que no existen en el scaffold)
Get-ChildItem -Force $tmp | Where-Object { $_.Name -notin @('.git') } | Move-Item -Destination C:\PROYECTOS\CRIOLLITAS
Remove-Item -Recurse -Force $tmp
```

- [ ] **Step 2: Endurecer tsconfig.json**

En `tsconfig.json` → `compilerOptions`, asegurar:

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "noImplicitOverride": true
}
```

- [ ] **Step 3: Prettier + scripts**

Crear `.prettierrc`:

```json
{ "semi": true, "singleQuote": false, "trailingComma": "all", "printWidth": 100 }
```

`pnpm add -D prettier eslint-config-prettier` y en `eslint.config.mjs` agregar `prettier` al final de los extends. En `package.json` → scripts, agregar: `"format": "prettier --write ."`.

- [ ] **Step 4: Variables de entorno**

Crear `.env.example` (commiteado):

```
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
PRINT_BRIDGE_URL=http://192.168.x.x:7070
PRINT_BRIDGE_TOKEN=
NEXT_PUBLIC_APP_TZ=America/Bogota
NEXT_PUBLIC_APP_LOCALE=es-CO
NEXT_PUBLIC_APP_CURRENCY=COP
```

Crear `.env.local` (NO commitear) con los valores reales: URL `https://btiejgeljpwsqwckuocs.supabase.co`, la anon key legacy JWT y la service_role key legacy JWT que entregó el usuario. Verificar que `.gitignore` contiene `.env*` con excepción `!.env.example` (si el scaffold usa `.env*.local`, dejarlo y añadir `.env` si falta).

- [ ] **Step 5: Verificar build y commit**

Run: `pnpm lint; pnpm build`
Expected: ambos exit 0.

```powershell
git add -A; git commit -m @'
feat: scaffold Next.js 15 con TypeScript estricto y tooling base

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

Verificar con `git status` que `.env.local` NO quedó commiteado.

---

### Task 2: Tokens Claymorphism + fuentes

**Files:**
- Modify: `app/globals.css`, `app/layout.tsx`
- Delete: `app/page.tsx` contenido demo (reemplazar por placeholder)

**Interfaces:**
- Produces: variables CSS `--brand-*`, `--clay-shadow-*`, `--radius-*`, `--font-*` y utilidades Tailwind `bg-brand-chocolate`, `shadow-clay-md`, `rounded-clay-md`, `font-display`, etc. Variables de fuente `--font-fredoka`, `--font-inter`, `--font-jetbrains`.

- [ ] **Step 1: Escribir `app/globals.css`**

Contenido completo (Tailwind v4 + tokens de CLAUDE.md §8.1/§8.2 — copiar los bloques `:root` LITERALES de CLAUDE.md §8.1 y §8.2, son la fuente de verdad):

```css
@import "tailwindcss";

:root {
  /* ... bloque completo de CLAUDE.md §8.1: colores marca, semánticos, sombras clay ... */
  /* ... bloque de §8.2: radios ... */
  --font-display: var(--font-fredoka), system-ui, sans-serif;
  --font-body: var(--font-inter), system-ui, sans-serif;
  --font-mono: var(--font-jetbrains), ui-monospace, monospace;
}

@theme inline {
  --color-brand-chocolate: var(--brand-chocolate);
  --color-brand-chocolate-2: var(--brand-chocolate-2);
  --color-brand-chocolate-3: var(--brand-chocolate-3);
  --color-brand-mostaza: var(--brand-mostaza);
  --color-brand-mostaza-2: var(--brand-mostaza-2);
  --color-brand-mostaza-3: var(--brand-mostaza-3);
  --color-brand-crema: var(--brand-crema);
  --color-brand-crema-2: var(--brand-crema-2);
  --color-brand-crema-3: var(--brand-crema-3);
  --color-brand-verde: var(--brand-verde);
  --color-brand-verde-2: var(--brand-verde-2);
  --color-brand-tomate: var(--brand-tomate);
  --color-brand-tomate-2: var(--brand-tomate-2);
  --color-surface: var(--surface);
  --color-surface-elevated: var(--surface-elevated);
  --color-surface-sunken: var(--surface-sunken);
  --color-text-primary: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-inverse: var(--text-inverse);
  --shadow-clay-sm: var(--clay-shadow-sm);
  --shadow-clay-md: var(--clay-shadow-md);
  --shadow-clay-lg: var(--clay-shadow-lg);
  --shadow-clay-pressed: var(--clay-shadow-pressed);
  --shadow-clay-dark-md: var(--clay-shadow-dark-md);
  --radius-clay-sm: var(--radius-sm);
  --radius-clay-md: var(--radius-md);
  --radius-clay-lg: var(--radius-lg);
  --radius-clay-xl: var(--radius-xl);
  --font-display: var(--font-display);
  --font-body: var(--font-body);
  --font-mono: var(--font-mono);
}

body {
  background: var(--brand-chocolate);
  color: var(--text-inverse);
  font-family: var(--font-body);
}
```

- [ ] **Step 2: Fuentes en `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Fredoka, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const fredoka = Fredoka({ subsets: ["latin"], variable: "--font-fredoka" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "Criollitas OS",
  description: "POS de comandas y caja — Criollitas, Arepas Rellenas",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO">
      <body className={`${fredoka.variable} ${inter.variable} ${jetbrains.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
```

Reemplazar `app/page.tsx` por un placeholder mínimo con la marca (h1 "Criollitas OS" en `font-display text-brand-mostaza`).

- [ ] **Step 3: Verificar y commit**

Run: `pnpm build` → exit 0. Levantar `pnpm dev`, abrir `http://localhost:3000`, confirmar fondo chocolate y fuente Fredoka en el título.

```powershell
git add -A; git commit -m @'
feat: tokens Claymorphism Criollitas y fuentes de marca

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 3: `lib/money.ts` con TDD (instala vitest)

**Files:**
- Create: `lib/money.ts`, `tests/unit/money.test.ts`, `vitest.config.ts`

**Interfaces:**
- Produces: tipo `MontoCOP = bigint`; funciones `montoDesdePesos(pesos: number): MontoCOP` (solo enteros), `sumar(...m: MontoCOP[]): MontoCOP`, `multiplicar(m: MontoCOP, cantidad: number): MontoCOP`, `formatearCOP(m: MontoCOP): string` → `"$ 12.500"`, `parsearCOP(s: string): MontoCOP | null`.

- [ ] **Step 1: Instalar vitest y configurar**

```powershell
pnpm add -D vitest
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: { include: ["tests/unit/**/*.test.ts"] },
});
```

En `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 2: Escribir tests que fallan (`tests/unit/money.test.ts`)**

```ts
import { describe, expect, it } from "vitest";
import { formatearCOP, montoDesdePesos, multiplicar, parsearCOP, sumar } from "@/lib/money";

describe("money", () => {
  it("crea montos desde pesos enteros", () => {
    expect(montoDesdePesos(12500)).toBe(1250000n);
  });
  it("rechaza pesos no enteros", () => {
    expect(() => montoDesdePesos(12.5)).toThrow();
  });
  it("suma montos", () => {
    expect(sumar(1250000n, 350000n)).toBe(1600000n);
  });
  it("multiplica por cantidad entera", () => {
    expect(multiplicar(1250000n, 3)).toBe(3750000n);
  });
  it("rechaza cantidad no entera", () => {
    expect(() => multiplicar(1250000n, 1.5)).toThrow();
  });
  it("formatea es-CO sin decimales con miles de punto", () => {
    expect(formatearCOP(1250000n)).toBe("$ 12.500");
    expect(formatearCOP(0n)).toBe("$ 0");
  });
  it("formatea montos grandes", () => {
    expect(formatearCOP(999999999900n)).toBe("$ 9.999.999.999");
  });
  it("formatea negativos (reversiones)", () => {
    expect(formatearCOP(-1250000n)).toBe("-$ 12.500");
  });
  it("parsea el formato de vuelta", () => {
    expect(parsearCOP("$ 12.500")).toBe(1250000n);
    expect(parsearCOP("12.500")).toBe(1250000n);
    expect(parsearCOP("abc")).toBeNull();
  });
});
```

- [ ] **Step 3: Verificar que fallan**

Run: `pnpm test`
Expected: FAIL — `Cannot find module '@/lib/money'` (o similar).

- [ ] **Step 4: Implementar `lib/money.ts`**

```ts
/** Montos en centavos de peso colombiano. Nunca usar number para dinero. */
export type MontoCOP = bigint;

export function montoDesdePesos(pesos: number): MontoCOP {
  if (!Number.isInteger(pesos)) {
    throw new RangeError("Los pesos deben ser un entero; usa centavos para fracciones");
  }
  return BigInt(pesos) * 100n;
}

export function sumar(...montos: MontoCOP[]): MontoCOP {
  return montos.reduce((acc, m) => acc + m, 0n);
}

export function multiplicar(monto: MontoCOP, cantidad: number): MontoCOP {
  if (!Number.isInteger(cantidad)) {
    throw new RangeError("La cantidad debe ser un entero");
  }
  return monto * BigInt(cantidad);
}

export function formatearCOP(monto: MontoCOP): string {
  const negativo = monto < 0n;
  const abs = negativo ? -monto : monto;
  const pesos = abs / 100n;
  const miles = pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negativo ? "-" : ""}$ ${miles}`;
}

export function parsearCOP(texto: string): MontoCOP | null {
  const limpio = texto.replace(/[$\s.]/g, "");
  if (!/^-?\d+$/.test(limpio)) return null;
  return BigInt(limpio) * 100n;
}
```

- [ ] **Step 5: Verificar que pasan y commit**

Run: `pnpm test` → PASS (9 tests).

```powershell
git add -A; git commit -m @'
feat: helpers de moneda COP con bigint de centavos (TDD)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 4: `lib/dates.ts` con TDD

**Files:**
- Create: `lib/dates.ts`, `tests/unit/dates.test.ts`

**Interfaces:**
- Produces: `TZ_BOGOTA = "America/Bogota"`; `ahoraBogota(): Date` (TZDate); `formatearFecha(d: Date, patron?: string): string` (locale es-CO, TZ Bogotá, patrón default `d 'de' MMMM 'de' yyyy, h:mm a`); `formatearHora(d: Date): string`.

- [ ] **Step 1: Instalar date-fns v4 + @date-fns/tz**

```powershell
pnpm add date-fns @date-fns/tz
```

- [ ] **Step 2: Tests que fallan (`tests/unit/dates.test.ts`)**

```ts
import { describe, expect, it } from "vitest";
import { formatearFecha, formatearHora, TZ_BOGOTA } from "@/lib/dates";

describe("dates", () => {
  // 2026-07-09T20:30:00Z === 15:30 en Bogotá (UTC-5)
  const instante = new Date("2026-07-09T20:30:00Z");

  it("expone la zona fija", () => {
    expect(TZ_BOGOTA).toBe("America/Bogota");
  });
  it("formatea en zona Bogotá sin importar la TZ de la máquina", () => {
    expect(formatearHora(instante)).toBe("3:30 p. m.");
  });
  it("formatea fecha larga en español", () => {
    expect(formatearFecha(instante)).toBe("9 de julio de 2026, 3:30 p. m.");
  });
});
```

- [ ] **Step 3: Verificar FAIL** — Run: `pnpm test` → `Cannot find module '@/lib/dates'`.

- [ ] **Step 4: Implementar `lib/dates.ts`**

```ts
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export const TZ_BOGOTA = "America/Bogota";

export function ahoraBogota(): Date {
  return new TZDate(Date.now(), TZ_BOGOTA);
}

export function formatearFecha(fecha: Date, patron = "d 'de' MMMM 'de' yyyy, h:mm a"): string {
  return format(new TZDate(fecha.getTime(), TZ_BOGOTA), patron, { locale: es });
}

export function formatearHora(fecha: Date): string {
  return formatearFecha(fecha, "h:mm a");
}
```

Nota: si el assert exacto de "p. m." difiere por versión de date-fns, ajustar el string esperado del test al output real UNA vez verificado que la hora sea `3:30` (la zona es lo que se prueba, no el estilo tipográfico del locale).

- [ ] **Step 5: PASS + commit**

Run: `pnpm test` → PASS.

```powershell
git add -A; git commit -m @'
feat: helpers de fechas con zona America/Bogota fija (TDD)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 5: Componentes ClayButton, ClayCard, ClayInput + página /design

**Files:**
- Create: `components/ui/ClayButton.tsx`, `components/ui/ClayCard.tsx`, `components/ui/ClayInput.tsx`, `lib/cn.ts`, `app/design/page.tsx`

**Interfaces:**
- Consumes: tokens/utilidades de Task 2.
- Produces: `<ClayButton variant size />`, `<ClayCard variant />`, `<ClayInput label error />` — exports nombrados. `cn(...inputs: ClassValue[]): string`.

- [ ] **Step 1: Instalar cva + clsx + tailwind-merge y crear `lib/cn.ts`**

```powershell
pnpm add class-variance-authority clsx tailwind-merge lucide-react
```

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: `components/ui/ClayButton.tsx`**

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const clayButton = cva(
  [
    "inline-flex items-center justify-center gap-2 font-display font-semibold",
    "rounded-clay-md shadow-clay-sm transition-all duration-150 select-none",
    "hover:shadow-clay-md active:shadow-clay-pressed active:translate-y-px",
    "focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2",
    "disabled:opacity-50 disabled:saturate-50 disabled:pointer-events-none",
  ],
  {
    variants: {
      variant: {
        primary: "bg-brand-mostaza text-brand-chocolate hover:bg-brand-mostaza-2 active:bg-brand-mostaza-3",
        secondary: "bg-brand-crema text-brand-chocolate hover:bg-brand-crema-2",
        ghost: "bg-transparent text-brand-crema shadow-none hover:bg-brand-chocolate-2",
        destructive: "bg-brand-tomate text-brand-crema hover:bg-brand-tomate-2",
        success: "bg-brand-verde text-brand-chocolate hover:bg-brand-verde-2",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-12 px-6 text-base",
        lg: "h-14 px-8 text-lg",
        xl: "h-16 px-10 text-xl",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ClayButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof clayButton> {}

export function ClayButton({ className, variant, size, ...props }: ClayButtonProps) {
  return <button className={cn(clayButton({ variant, size }), className)} {...props} />;
}
```

- [ ] **Step 3: `components/ui/ClayCard.tsx`**

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const clayCard = cva("rounded-clay-lg p-6 text-text-primary", {
  variants: {
    variant: {
      default: "bg-brand-crema shadow-clay-md",
      elevated: "bg-surface-elevated shadow-clay-lg",
      flat: "bg-brand-crema border border-(--border-soft)",
      sunken: "bg-surface-sunken shadow-clay-pressed",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface ClayCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof clayCard> {}

export function ClayCard({ className, variant, ...props }: ClayCardProps) {
  return <div className={cn(clayCard({ variant }), className)} {...props} />;
}
```

- [ ] **Step 4: `components/ui/ClayInput.tsx`**

```tsx
"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

export interface ClayInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function ClayInput({ label, error, className, id, ...props }: ClayInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="font-display text-sm font-medium text-text-primary">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "h-12 rounded-clay-md bg-surface-sunken px-4 text-base text-text-primary",
          "shadow-clay-pressed placeholder:text-text-secondary/60",
          "focus-visible:outline-3 focus-visible:outline-brand-mostaza",
          error && "outline-2 outline-brand-tomate",
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={errorId} className="text-sm text-brand-tomate-2">{error}</p>
      ) : null}
    </div>
  );
}
```

Nota: `ClayInput` va dentro de un contenedor crema (ClayCard); sus colores asumen superficie clara.

- [ ] **Step 5: Página de verificación `app/design/page.tsx`**

Server Component que renderiza: las 5 variantes × 4 tamaños de ClayButton (más disabled), las 4 variantes de ClayCard, ClayInput normal y con error, y una franja con los swatches de color de marca. Título con `font-display`. Grid responsive sobre fondo chocolate.

- [ ] **Step 6: Verificación visual + commit**

Run: `pnpm dev`, abrir `http://localhost:3000/design`. Chequear contra CLAUDE.md §8.3: hover eleva sombra, pressed hunde, focus outline mostaza 3px, contraste AA (texto chocolate sobre mostaza, crema sobre chocolate; nunca crema sobre mostaza). Luego `pnpm lint; pnpm build` → exit 0.

```powershell
git add -A; git commit -m @'
feat: componentes base Claymorphism (ClayButton, ClayCard, ClayInput) y página /design

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 6: Clientes Supabase + vínculo con el proyecto cloud

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/middleware.ts`, `supabase/config.toml` (lo genera el CLI)

**Interfaces:**
- Produces: `createClient()` (browser), `createServerSupabase()` (RSC/Server Actions, async), `updateSession(request: NextRequest): Promise<NextResponse>`.

- [ ] **Step 1: Instalar SDK y vincular proyecto**

```powershell
pnpm add @supabase/supabase-js @supabase/ssr
$env:SUPABASE_ACCESS_TOKEN = "<sbp_... del usuario>"
supabase init          # crea supabase/ (decir No a los helpers de VS Code/IntelliJ)
supabase link --project-ref btiejgeljpwsqwckuocs
```

Expected: `Finished supabase link.` (usa el access token; la contraseña de DB no es necesaria para link/push con token).

- [ ] **Step 2: `lib/supabase/client.ts`**

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 3: `lib/supabase/server.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Llamado desde un Server Component: el middleware refresca la sesión.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 4: `lib/supabase/middleware.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );
  await supabase.auth.getUser(); // refresca tokens si expiraron
  return response;
}
```

(El enrutamiento por rol se agrega en Task 12; aquí solo refresh.)

- [ ] **Step 5: Build + commit**

Run: `pnpm lint; pnpm build` → exit 0.

```powershell
git add -A; git commit -m @'
feat: clientes Supabase (browser, server, middleware) y vínculo con proyecto cloud

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 7: Migración 0001 — sedes, usuarios, pin_intentos, RLS + seed + tipos

**Files:**
- Create: `supabase/migrations/0001_auth_base.sql`, `supabase/seed.sql`, `lib/supabase/types.ts` (generado)

**Interfaces:**
- Produces: tablas `public.sedes`, `public.usuarios`, `public.pin_intentos`; enum `public.rol_usuario`; funciones `public.current_sede_id()`, `public.current_rol()`. Tipos TS generados en `lib/supabase/types.ts` (`Database`).
- Nota: las funciones van en schema `public` (no `auth` — Supabase cloud no permite crear funciones en `auth`). CLAUDE.md §6.2 las llama `auth.current_*`; se registra en la reconciliación (Task 13).

- [ ] **Step 1: Escribir `supabase/migrations/0001_auth_base.sql`**

```sql
-- Enum de roles
create type public.rol_usuario as enum ('admin', 'cajera', 'vendedora', 'cocina');

-- Sedes
create table public.sedes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  direccion text,
  telefono text,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);

-- Usuarios (perfil operativo sobre auth.users)
create table public.usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  sede_id uuid not null references public.sedes (id),
  nombre text not null,
  rol public.rol_usuario not null,
  pin_hash text,
  activo boolean not null default true,
  avatar_url text,
  creado_en timestamptz not null default now()
);

-- Intentos de PIN (rate limit). Solo service role la toca.
create table public.pin_intentos (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  exito boolean not null,
  creado_en timestamptz not null default now()
);
create index pin_intentos_usuario_reciente
  on public.pin_intentos (usuario_id, creado_en desc);

-- Helpers de JWT
create or replace function public.current_rol() returns text
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb
         -> 'user_metadata' ->> 'rol'
$$;

create or replace function public.current_sede_id() returns uuid
language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb
          -> 'user_metadata' ->> 'sede_id')::uuid
$$;

-- RLS
alter table public.sedes enable row level security;
alter table public.usuarios enable row level security;
alter table public.pin_intentos enable row level security;

-- sedes: leer la propia sede; escribir solo admin de esa sede
create policy sedes_select on public.sedes
  for select to authenticated
  using (id = public.current_sede_id());
create policy sedes_admin_all on public.sedes
  for all to authenticated
  using (public.current_rol() = 'admin' and id = public.current_sede_id())
  with check (public.current_rol() = 'admin' and id = public.current_sede_id());

-- usuarios: cada quien su fila; admin ve/gestiona su sede. pin_hash nunca via API:
revoke select (pin_hash) on public.usuarios from anon, authenticated;
create policy usuarios_self_select on public.usuarios
  for select to authenticated
  using (id = auth.uid());
create policy usuarios_admin_select on public.usuarios
  for select to authenticated
  using (public.current_rol() = 'admin' and sede_id = public.current_sede_id());
create policy usuarios_admin_write on public.usuarios
  for all to authenticated
  using (public.current_rol() = 'admin' and sede_id = public.current_sede_id())
  with check (public.current_rol() = 'admin' and sede_id = public.current_sede_id());

-- pin_intentos: ninguna policy => solo service role accede.
```

- [ ] **Step 2: Aplicar al cloud**

Run: `supabase db push`
Expected: `Applying migration 0001_auth_base.sql... Finished supabase db push.`

- [ ] **Step 3: Seed idempotente vía SQL (usuario admin real)**

Como no hay entorno local, el seed se aplica una vez con el Management API o `supabase db push`-style script. Crear `supabase/seed.sql` (documental, para futuros entornos) y ejecutar su contenido contra cloud con:

```powershell
# Crea el usuario auth por Admin API (idempotente si ya existe: responde 422, ignorar)
$h = @{ Authorization = "Bearer <SERVICE_ROLE_KEY>"; apikey = "<SERVICE_ROLE_KEY>"; "Content-Type" = "application/json" }
$body = @{ email = "jonathantabares@gmail.com"; password = "Criollitas2026!Cambiar"; email_confirm = $true;
           user_metadata = @{ nombre = "Jonathan (Admin)" } } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "https://btiejgeljpwsqwckuocs.supabase.co/auth/v1/admin/users" -Headers $h -Body $body
```

Luego, en SQL (vía `supabase db push` de una migración `0002_seed_inicial.sql` o el SQL editor por Management API `POST /v1/projects/{ref}/database/query`):

```sql
insert into public.sedes (id, nombre, direccion, telefono)
values ('00000000-0000-4000-8000-000000000001', 'Criollitas Armenia', 'Armenia, Quindío', '3212127100')
on conflict (id) do nothing;

insert into public.usuarios (id, sede_id, nombre, rol, pin_hash, activo)
select u.id, '00000000-0000-4000-8000-000000000001', 'Jonathan (Admin)', 'admin',
       null, true
from auth.users u where u.email = 'jonathantabares@gmail.com'
on conflict (id) do nothing;

-- Copiar rol/sede al JWT metadata (lo que leen current_rol/current_sede_id)
update auth.users u
set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object('rol', 'admin', 'sede_id', '00000000-0000-4000-8000-000000000001', 'nombre', 'Jonathan (Admin)')
where u.email = 'jonathantabares@gmail.com';
```

El `pin_hash` se setea en Task 9 Step 5 (bcrypt del PIN de prueba `2468`), cuando exista el helper.

- [ ] **Step 4: Generar tipos**

Run: `supabase gen types typescript --linked > lib/supabase/types.ts`
Expected: archivo con `export type Database = { public: { Tables: { sedes: ...` . Tipar los clientes: en `client.ts`/`server.ts`/`middleware.ts` usar `createBrowserClient<Database>` / `createServerClient<Database>`.

- [ ] **Step 5: Verificar RLS y commit**

Verificación rápida por REST: con la **anon key** sin sesión, `GET https://btiejgeljpwsqwckuocs.supabase.co/rest/v1/usuarios?select=id` debe devolver `[]` (RLS bloquea); con **service_role** devuelve la fila del admin.

```powershell
git add -A; git commit -m @'
feat: migración base de auth (sedes, usuarios, pin_intentos) con RLS y seed inicial

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 8: Esquemas Zod de auth con TDD

**Files:**
- Create: `lib/validations/auth.ts`, `tests/unit/validations-auth.test.ts`

**Interfaces:**
- Produces: `loginSchema` (`{ email: string; password: string }`), `pinSchema` (`{ usuarioId: string uuid; pin: string }` con PIN de 4-6 dígitos), tipos `LoginInput = z.infer<typeof loginSchema>`, `PinInput = z.infer<typeof pinSchema>`. Mensajes de error en español.

- [ ] **Step 1: Instalar deps de formularios**

```powershell
pnpm add zod react-hook-form @hookform/resolvers
```

- [ ] **Step 2: Tests que fallan (`tests/unit/validations-auth.test.ts`)**

```ts
import { describe, expect, it } from "vitest";
import { loginSchema, pinSchema } from "@/lib/validations/auth";

describe("loginSchema", () => {
  it("acepta credenciales válidas", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "secreta123" }).success).toBe(true);
  });
  it("rechaza email inválido con mensaje en español", () => {
    const r = loginSchema.safeParse({ email: "no-es-email", password: "secreta123" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("Ingresa un correo válido");
  });
  it("rechaza password corta", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "123" }).success).toBe(false);
  });
});

describe("pinSchema", () => {
  const usuarioId = "3f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b";
  it("acepta PIN de 4 a 6 dígitos", () => {
    expect(pinSchema.safeParse({ usuarioId, pin: "2468" }).success).toBe(true);
    expect(pinSchema.safeParse({ usuarioId, pin: "246810" }).success).toBe(true);
  });
  it("rechaza PIN con letras, corto o largo", () => {
    expect(pinSchema.safeParse({ usuarioId, pin: "24a8" }).success).toBe(false);
    expect(pinSchema.safeParse({ usuarioId, pin: "123" }).success).toBe(false);
    expect(pinSchema.safeParse({ usuarioId, pin: "1234567" }).success).toBe(false);
  });
  it("rechaza usuarioId que no es uuid", () => {
    expect(pinSchema.safeParse({ usuarioId: "1", pin: "2468" }).success).toBe(false);
  });
});
```

- [ ] **Step 3: Verificar FAIL** — Run: `pnpm test` → módulo no encontrado.

- [ ] **Step 4: Implementar `lib/validations/auth.ts`**

```ts
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Ingresa un correo válido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const pinSchema = z.object({
  usuarioId: z.string().uuid("Usuario inválido"),
  pin: z.string().regex(/^\d{4,6}$/, "El PIN debe tener entre 4 y 6 dígitos"),
});
export type PinInput = z.infer<typeof pinSchema>;
```

- [ ] **Step 5: PASS + commit**

Run: `pnpm test` → PASS.

```powershell
git add -A; git commit -m @'
feat: esquemas Zod de login y PIN con mensajes en español (TDD)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 9: Lógica de rate limit (pura) con TDD + hash del PIN del seed

**Files:**
- Create: `lib/auth/pin.ts`, `tests/unit/rate-limit.test.ts`

**Interfaces:**
- Produces: `evaluarRateLimit(fallos: Date[], ahora: Date): { bloqueado: boolean; segundosRestantes: number }` — regla: 5+ fallos dentro de los últimos 5 minutos → bloqueado hasta que el fallo más antiguo de la ventana cumpla 5 min. Constantes `MAX_INTENTOS = 5`, `VENTANA_MS = 5 * 60_000`. (Función pura: la Edge Function pasa los timestamps leídos de `pin_intentos`.)

- [ ] **Step 1: Tests que fallan (`tests/unit/rate-limit.test.ts`)**

```ts
import { describe, expect, it } from "vitest";
import { evaluarRateLimit } from "@/lib/auth/pin";

const ahora = new Date("2026-07-09T15:00:00Z");
const hace = (seg: number) => new Date(ahora.getTime() - seg * 1000);

describe("evaluarRateLimit", () => {
  it("sin fallos no bloquea", () => {
    expect(evaluarRateLimit([], ahora)).toEqual({ bloqueado: false, segundosRestantes: 0 });
  });
  it("4 fallos recientes no bloquean", () => {
    const fallos = [hace(10), hace(20), hace(30), hace(40)];
    expect(evaluarRateLimit(fallos, ahora).bloqueado).toBe(false);
  });
  it("5 fallos dentro de 5 minutos bloquean", () => {
    const fallos = [hace(10), hace(60), hace(120), hace(180), hace(240)];
    const r = evaluarRateLimit(fallos, ahora);
    expect(r.bloqueado).toBe(true);
    expect(r.segundosRestantes).toBe(60); // el más antiguo (240s) sale de la ventana en 60s
  });
  it("fallos viejos fuera de la ventana no cuentan", () => {
    const fallos = [hace(301), hace(400), hace(500), hace(600), hace(700)];
    expect(evaluarRateLimit(fallos, ahora).bloqueado).toBe(false);
  });
});
```

- [ ] **Step 2: Verificar FAIL** — Run: `pnpm test` → módulo no encontrado.

- [ ] **Step 3: Implementar `lib/auth/pin.ts`**

```ts
export const MAX_INTENTOS = 5;
export const VENTANA_MS = 5 * 60_000;

export function evaluarRateLimit(
  fallos: Date[],
  ahora: Date,
): { bloqueado: boolean; segundosRestantes: number } {
  const enVentana = fallos
    .filter((f) => ahora.getTime() - f.getTime() < VENTANA_MS)
    .sort((a, b) => a.getTime() - b.getTime());
  if (enVentana.length < MAX_INTENTOS) {
    return { bloqueado: false, segundosRestantes: 0 };
  }
  const masAntiguo = enVentana[0];
  const liberaEn = masAntiguo!.getTime() + VENTANA_MS - ahora.getTime();
  return { bloqueado: true, segundosRestantes: Math.ceil(liberaEn / 1000) };
}
```

- [ ] **Step 4: PASS + commit parcial**

Run: `pnpm test` → PASS.

- [ ] **Step 5: Setear pin_hash del admin del seed**

```powershell
pnpm add bcryptjs
node -e "const b=require('bcryptjs'); console.log(b.hashSync('2468', 10))"
```

Con el hash resultante, ejecutar contra cloud (Management API `POST /v1/projects/btiejgeljpwsqwckuocs/database/query` con el access token):

```sql
update public.usuarios set pin_hash = '<HASH_BCRYPT>' where nombre = 'Jonathan (Admin)';
```

```powershell
git add -A; git commit -m @'
feat: lógica pura de rate limit de PIN (TDD) y PIN inicial del admin

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 10: Edge Function `login-pin` + route handler proxy

**Files:**
- Create: `supabase/functions/login-pin/index.ts`, `app/api/auth/pin/route.ts`

**Interfaces:**
- Consumes: `pin_intentos`, `usuarios.pin_hash`, regla de Task 9 (reimplementada inline en Deno — copiar la función, no importar del repo Next).
- Produces: `POST /functions/v1/login-pin` body `{ usuario_id: string, pin: string }` → 200 `{ access_token, refresh_token }` | 401 `{ error: "PIN incorrecto" }` | 429 `{ error, segundos_restantes }` | 400. También `GET /functions/v1/login-pin/usuarios?sede_id=<uuid>` → `[{ id, nombre, avatar_url, rol }]` (lista para la pantalla PIN, sin pin_hash). Route `POST /api/auth/pin` reenvía a la función.

- [ ] **Step 1: Escribir `supabase/functions/login-pin/index.ts`**

```ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { compareSync } from "npm:bcryptjs@2";

const MAX_INTENTOS = 5;
const VENTANA_MS = 5 * 60_000;

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Lista de usuarios para la pantalla PIN (sin pin_hash)
  if (req.method === "GET" && url.pathname.endsWith("/usuarios")) {
    const sedeId = url.searchParams.get("sede_id");
    if (!sedeId) return json(400, { error: "Falta sede_id" });
    const { data, error } = await admin
      .from("usuarios")
      .select("id, nombre, avatar_url, rol")
      .eq("sede_id", sedeId)
      .eq("activo", true)
      .order("nombre");
    if (error) return json(500, { error: "No se pudo cargar la lista de usuarios" });
    return json(200, data);
  }

  if (req.method !== "POST") return json(405, { error: "Método no permitido" });

  const { usuario_id, pin } = await req.json().catch(() => ({}));
  if (typeof usuario_id !== "string" || !/^\d{4,6}$/.test(String(pin))) {
    return json(400, { error: "Solicitud inválida" });
  }

  // Rate limit: fallos de los últimos 5 minutos
  const desde = new Date(Date.now() - VENTANA_MS).toISOString();
  const { data: fallos } = await admin
    .from("pin_intentos")
    .select("creado_en")
    .eq("usuario_id", usuario_id)
    .eq("exito", false)
    .gte("creado_en", desde)
    .order("creado_en", { ascending: true });

  if ((fallos ?? []).length >= MAX_INTENTOS) {
    const masAntiguo = new Date(fallos![0]!.creado_en).getTime();
    const segundos = Math.ceil((masAntiguo + VENTANA_MS - Date.now()) / 1000);
    return json(429, {
      error: "Demasiados intentos. Espera un momento e inténtalo de nuevo.",
      segundos_restantes: Math.max(segundos, 1),
    });
  }

  // Verificar PIN
  const { data: usuario } = await admin
    .from("usuarios")
    .select("id, pin_hash, activo")
    .eq("id", usuario_id)
    .single();

  const valido =
    !!usuario && usuario.activo && !!usuario.pin_hash && compareSync(String(pin), usuario.pin_hash);

  await admin.from("pin_intentos").insert({ usuario_id, exito: valido });
  if (!valido) return json(401, { error: "PIN incorrecto" });

  // Emitir sesión: magic link consumido server-side
  const { data: au } = await admin.auth.admin.getUserById(usuario_id);
  const email = au?.user?.email;
  if (!email) return json(500, { error: "Usuario sin correo asociado" });

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError || !link?.properties?.hashed_token) {
    return json(500, { error: "No se pudo iniciar la sesión" });
  }

  const { data: session, error: otpError } = await admin.auth.verifyOtp({
    type: "email",
    token_hash: link.properties.hashed_token,
  });
  if (otpError || !session.session) {
    return json(500, { error: "No se pudo iniciar la sesión" });
  }

  return json(200, {
    access_token: session.session.access_token,
    refresh_token: session.session.refresh_token,
  });
});
```

- [ ] **Step 2: Desplegar**

```powershell
supabase functions deploy login-pin --no-verify-jwt
```

Expected: `Deployed Function login-pin`. (`--no-verify-jwt` porque se llama antes de tener sesión; la función usa service role internamente y no expone datos sensibles.)

- [ ] **Step 3: Probar contra cloud**

```powershell
$body = '{"usuario_id":"<UUID_ADMIN>","pin":"2468"}'
Invoke-RestMethod -Method Post -Uri "https://btiejgeljpwsqwckuocs.supabase.co/functions/v1/login-pin" -ContentType "application/json" -Body $body
```

Expected: JSON con `access_token` y `refresh_token`. Probar también PIN malo → 401, y 5 PINs malos seguidos → 429 con `segundos_restantes`.

- [ ] **Step 4: Route handler `app/api/auth/pin/route.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { pinSchema } from "@/lib/validations/auth";

export async function POST(request: NextRequest) {
  const raw = await request.json().catch(() => null);
  const parsed = pinSchema.safeParse({ usuarioId: raw?.usuario_id, pin: raw?.pin });
  if (!parsed.success) {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
  const upstream = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/login-pin`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario_id: parsed.data.usuarioId, pin: parsed.data.pin }),
    },
  );
  return NextResponse.json(await upstream.json(), { status: upstream.status });
}
```

- [ ] **Step 5: Lint/build + commit**

Run: `pnpm lint; pnpm build` → exit 0.

```powershell
git add -A; git commit -m @'
feat: Edge Function login-pin con rate limit y emisión de sesión

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 11: Página `/login` (email + password)

**Files:**
- Create: `app/(auth)/login/page.tsx`, `components/auth/LoginForm.tsx`

**Interfaces:**
- Consumes: `createClient()` (Task 6), `loginSchema` (Task 8), `ClayCard/ClayInput/ClayButton` (Task 5).
- Produces: ruta `/login`; tras login exitoso redirige a `/pin`.

- [ ] **Step 1: `app/(auth)/login/page.tsx`** (Server Component)

```tsx
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md">
        <h1 className="mb-8 text-center font-display text-4xl font-semibold text-brand-mostaza">
          Criollitas OS
        </h1>
        <LoginForm />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: `components/auth/LoginForm.tsx`** (Client Component)

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { createClient } from "@/lib/supabase/client";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayCard } from "@/components/ui/ClayCard";
import { ClayInput } from "@/components/ui/ClayInput";

export function LoginForm() {
  const router = useRouter();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (datos) => {
    setErrorGeneral(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword(datos);
    if (error) {
      setErrorGeneral("Correo o contraseña incorrectos. Verifica e intenta de nuevo.");
      return;
    }
    router.push("/pin");
    router.refresh();
  });

  return (
    <ClayCard>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <ClayInput
          label="Correo electrónico"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <ClayInput
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password")}
        />
        {errorGeneral ? <p className="text-sm text-brand-tomate">{errorGeneral}</p> : null}
        <ClayButton type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Ingresando…" : "Ingresar"}
        </ClayButton>
      </form>
    </ClayCard>
  );
}
```

Nota: `ClayInput` usa `React.forwardRef`-compatible spread; si `register` exige ref, ajustar `ClayInput` para reenviar ref (`React.forwardRef`) — hacerlo en este task si el build lo pide.

- [ ] **Step 3: Prueba manual + commit**

`pnpm dev` → `/login` con el admin del seed (`jonathantabares@gmail.com` / `Criollitas2026!Cambiar`) redirige a `/pin` (aunque `/pin` aún sea 404, la redirección ocurre). Credencial mala muestra el error en español. `pnpm lint; pnpm build` → exit 0.

```powershell
git add -A; git commit -m @'
feat: página de login con email y contraseña

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 12: Página `/pin` + cookie de validación

**Files:**
- Create: `app/(auth)/pin/page.tsx`, `components/auth/PinPad.tsx`, `app/(auth)/pin/actions.ts`

**Interfaces:**
- Consumes: `GET /functions/v1/login-pin/usuarios` (Task 10), `POST /api/auth/pin` (Task 10), `createClient()` browser, componentes Clay.
- Produces: ruta `/pin`; Server Action `marcarPinValidado(): Promise<void>` que setea cookie httpOnly `pin_validado=1` (path `/`, sameSite lax, maxAge 12h); tras PIN ok el cliente hace `setSession` y navega a la ruta base del rol: admin→`/dashboard`, cajera→`/pedidos`, vendedora→`/inicio`, cocina→`/kds`.

- [ ] **Step 1: `app/(auth)/pin/actions.ts`**

```ts
"use server";

import { cookies } from "next/headers";

export async function marcarPinValidado(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set("pin_validado", "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}
```

- [ ] **Step 2: `app/(auth)/pin/page.tsx`** (Server Component)

Carga la lista de usuarios de la sede llamando a la Edge Function desde el servidor. La sede del dispositivo: por ahora la única sede del seed; obtenerla con el client server + service? No: usar `fetch` a `/functions/v1/login-pin/usuarios?sede_id=00000000-0000-4000-8000-000000000001` (constante `SEDE_DEFAULT_ID` en `lib/auth/roles.ts`; parametrizable por env `NEXT_PUBLIC_SEDE_ID` con ese default). Renderiza `<PinPad usuarios={usuarios} />`.

```tsx
import { PinPad, type UsuarioPin } from "@/components/auth/PinPad";

export const dynamic = "force-dynamic";

const SEDE_ID = process.env.NEXT_PUBLIC_SEDE_ID ?? "00000000-0000-4000-8000-000000000001";

export default async function PinPage() {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/login-pin/usuarios?sede_id=${SEDE_ID}`,
    { cache: "no-store" },
  );
  const usuarios: UsuarioPin[] = res.ok ? await res.json() : [];
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <PinPad usuarios={usuarios} />
    </main>
  );
}
```

- [ ] **Step 3: `components/auth/PinPad.tsx`** (Client Component)

Estados: `usuarioSeleccionado`, `pin` (string), `error`, `enviando`. UI en dos pasos dentro de un `ClayCard`:
1. Grilla de usuarios (botones ≥48px, avatar con inicial + nombre, rol como subtítulo).
2. Teclado numérico 0-9, borrar y "Entrar" (`ClayButton` xl), puntos que muestran dígitos ingresados, botón "Cambiar de usuario".

Al confirmar: `POST /api/auth/pin`; si 200 → `createClient().auth.setSession({ access_token, refresh_token })`, `await marcarPinValidado()`, y `router.push(rutaPorRol(usuario.rol))`; si 401 → "PIN incorrecto" y limpiar; si 429 → mostrar "Demasiados intentos. Espera N segundos." y deshabilitar el teclado ese tiempo.

Agregar a `.env.example` (y a `.env.local` con el mismo valor): `NEXT_PUBLIC_SEDE_ID=00000000-0000-4000-8000-000000000001`.

`rutaPorRol` vive en `lib/auth/roles.ts`:

```ts
export type Rol = "admin" | "cajera" | "vendedora" | "cocina";

export const RUTA_BASE_POR_ROL: Record<Rol, string> = {
  admin: "/dashboard",
  cajera: "/pedidos",
  vendedora: "/inicio",
  cocina: "/kds",
};

export function rutaPorRol(rol: Rol): string {
  return RUTA_BASE_POR_ROL[rol];
}

export const SEDE_DEFAULT_ID = "00000000-0000-4000-8000-000000000001";
```

- [ ] **Step 4: Prueba manual + commit**

`pnpm dev` → `/pin`: aparece el admin, PIN `2468` entra y redirige a `/dashboard` (404 por ahora — se crea en Task 13). PIN malo → error. 5 fallos → contador de bloqueo. `pnpm lint; pnpm build` → exit 0.

```powershell
git add -A; git commit -m @'
feat: pantalla de selección de usuario y PIN con teclado numérico

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 13: Middleware por rol + layouts esqueleto

**Files:**
- Create: `middleware.ts` (raíz), `app/(admin)/layout.tsx`, `app/(admin)/dashboard/page.tsx`, `app/(cajera)/layout.tsx`, `app/(cajera)/pedidos/page.tsx`, `app/(vendedora)/layout.tsx`, `app/(vendedora)/inicio/page.tsx`, `app/(cocina)/kds/page.tsx`

**Interfaces:**
- Consumes: `updateSession` (Task 6), `RUTA_BASE_POR_ROL`/`rutaPorRol` (Task 12), cookie `pin_validado` (Task 12).
- Produces: enrutamiento completo por rol según CLAUDE.md §9.

- [ ] **Step 1: `middleware.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { rutaPorRol, type Rol } from "@/lib/auth/roles";

const RUTAS_PUBLICAS = ["/login", "/pin", "/design"];

const PREFIJOS_POR_ROL: Array<{ prefijo: string; roles: Rol[] }> = [
  { prefijo: "/dashboard", roles: ["admin"] },
  { prefijo: "/menu", roles: ["admin"] },
  { prefijo: "/usuarios", roles: ["admin"] },
  { prefijo: "/sedes", roles: ["admin"] },
  { prefijo: "/reportes", roles: ["admin"] },
  { prefijo: "/auditoria", roles: ["admin"] },
  { prefijo: "/pedidos", roles: ["cajera"] },
  { prefijo: "/cobrar", roles: ["cajera"] },
  { prefijo: "/turno", roles: ["cajera"] },
  { prefijo: "/mi-turno", roles: ["cajera"] },
  { prefijo: "/inicio", roles: ["vendedora"] },
  { prefijo: "/pedido", roles: ["vendedora"] },
  { prefijo: "/mesas", roles: ["vendedora"] },
  { prefijo: "/kds", roles: ["cocina", "admin"] },
];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ruta = request.nextUrl.pathname;
  const esPublica = RUTAS_PUBLICAS.some((p) => ruta === p || ruta.startsWith(`${p}/`));

  if (!user) {
    return esPublica ? response : NextResponse.redirect(new URL("/login", request.url));
  }

  const pinValidado = request.cookies.get("pin_validado")?.value === "1";
  const rol = (user.user_metadata?.rol ?? null) as Rol | null;

  if (!pinValidado && !esPublica) {
    return NextResponse.redirect(new URL("/pin", request.url));
  }
  if (esPublica || !rol) return response;

  const regla = PREFIJOS_POR_ROL.find((r) => ruta === r.prefijo || ruta.startsWith(`${r.prefijo}/`));
  if (regla && !regla.roles.includes(rol)) {
    return NextResponse.redirect(new URL(rutaPorRol(rol), request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

Nota: se inline-a la lógica de `updateSession` porque el middleware además necesita `user`; `lib/supabase/middleware.ts` queda para reuso futuro o se elimina si no se usa (decidir al implementar; no dejar código muerto).

- [ ] **Step 2: Layouts y páginas esqueleto**

Cada layout de rol: fondo chocolate, encabezado con nombre de la sección en `font-display`, y `{children}`. Cada página placeholder: `<h1>` con el nombre y un `<p>` "Disponible en el próximo bloque." Ejemplo `app/(admin)/dashboard/page.tsx`:

```tsx
export default function DashboardPage() {
  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Panel de administración</h1>
      <p className="mt-2 text-brand-crema/80">Disponible en el próximo bloque.</p>
    </main>
  );
}
```

(Repetir patrón para `/pedidos` "Pedidos por cobrar", `/inicio` "Nuevo pedido", `/kds` "Cocina".)

- [ ] **Step 3: Verificación del flujo completo**

1. Sin sesión → cualquier ruta redirige a `/login`. 2. Login ok → `/pin`. 3. PIN ok (admin) → `/dashboard` renderiza. 4. Admin intenta `/pedidos` → redirigido a `/dashboard`. 5. Borrar cookie `pin_validado` → ruta privada redirige a `/pin`.

Run: `pnpm lint; pnpm test; pnpm build` → todo verde.

- [ ] **Step 4: Commit**

```powershell
git add -A; git commit -m @'
feat: middleware de enrutamiento por rol y layouts esqueleto

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 14: Reconciliación CLAUDE.md + verificación final

**Files:**
- Modify: `CLAUDE.md` (§3 stack, §6.2, §8.1, §14, §15)

**Interfaces:**
- Consumes: decisiones del spec `docs/superpowers/specs/2026-07-09-bootstrap-infra-auth-design.md` §2.

- [ ] **Step 1: Edits de reconciliación en CLAUDE.md**

1. §8.1: reemplazar "expuestos a Tailwind vía `tailwind.config.ts` (`theme.extend.colors`)" por "expuestos a Tailwind v4 vía `@theme inline` en `app/globals.css`".
2. §6.2: `auth.current_sede_id()`/`auth.current_rol()` → `public.current_sede_id()`/`public.current_rol()` (cloud no permite crear funciones en schema `auth`).
3. §14: eliminar `SUPABASE_JWT_SECRET` (la sesión PIN se emite con magic link + verifyOtp, no firmando JWT). Agregar `NEXT_PUBLIC_SEDE_ID`.
4. §15: nota bajo los comandos: "Sin Docker local, el flujo actual es `supabase link` + `supabase db push` contra el proyecto cloud deliarepas".
5. §3 fila Dinero: precisar que se optó por helpers propios (`lib/money.ts`, bigint de centavos).

- [ ] **Step 2: Verificación final completa**

Run: `pnpm lint; pnpm test; pnpm build` → verde. Recorrer una vez el flujo login → pin → dashboard en `pnpm dev`.

- [ ] **Step 3: Commit final**

```powershell
git add -A; git commit -m @'
docs: reconciliar CLAUDE.md con decisiones del bootstrap (Tailwind v4, funciones public, sesión PIN)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

## Notas para el ejecutor

- Las claves reales (anon, service_role, access token `sbp_…`) están en `.env.local` desde Task 1; si falta alguna, pedirla al usuario — NUNCA commitearlas ni imprimirlas en logs.
- Si `supabase db push` pide contraseña de base de datos, pedírsela al usuario (no está en el chat).
- Cualquier assert de formato regional (Task 4) se ajusta al output real de la librería, verificando que la hora/zona sea la correcta; documentar el ajuste en el commit.
- Al terminar todo: recordar al usuario rotar las claves compartidas por chat.

