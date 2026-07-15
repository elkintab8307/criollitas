# Bloque J2 — Autenticación local (Cajera y Admin): Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Cajera y Admin puedan iniciar sesión por PIN completamente sin internet en el equipo del local, y que la app decida en el propio navegador (sin middleware.ts, que no puede correr sin conexión) si esa sesión offline puede acceder a la ruta actual — restaurando una sesión real de Supabase automáticamente en cuanto vuelve la conexión.

**Architecture:** La Edge Function `login-pin` empieza a devolver `pin_hash`/`sede_id` en su respuesta de éxito, que el navegador cachea localmente (IndexedDB, Bloque J1) junto con el `refresh_token`. Cuando el detector de conectividad (Bloque J1) confirma que no hay internet, `/pin` verifica el PIN contra ese hash cacheado con `bcryptjs` en vez de llamar a la nube, y un componente cliente nuevo (`GuardiaOffline`) reutiliza las mismas reglas de acceso por rol que ya usa `middleware.ts` (`lib/auth/roles.ts`, sin duplicarlas) para decidir qué rutas puede visitar esa sesión offline. Al reconectar, otro componente (`ManejadorReconexion`) usa el `refresh_token` cacheado para restaurar una sesión real y devolver el control a `middleware.ts`.

**Tech Stack:** Next.js 15 App Router, TypeScript estricto, Dexie (Bloque J1), Zustand + `zustand/middleware` (persist), `bcryptjs` (ya dependencia), Supabase Edge Functions (Deno).

## Global Constraints

- TypeScript estricto, sin `any`.
- Nombres de dominio en español.
- Alias de import `@/` para la raíz.
- Wrappers delgados sobre APIs de navegador/Dexie/Edge Functions no llevan test unitario dedicado (precedente: `lib/reportes/exportar.ts`, Bloque J1) — solo se testea la lógica pura que no depende de esas APIs.
- El `pin_hash` **nunca** se expone vía una política RLS nueva sobre `usuarios` — solo viaja como campo adicional en la respuesta ya-exclusiva de un login exitoso por PIN, hacia el propio dispositivo de ese usuario (decisión de seguridad confirmada con el usuario).
- Solo se cachea identidad local para `rol === "cajera" || rol === "admin"` — Vendedora y Cocina no tienen respaldo offline.
- `pnpm lint && pnpm test && pnpm build` deben quedar verdes antes de dar cualquier task por terminada. La Edge Function se verifica aparte (no forma parte de `pnpm build`), con `supabase functions deploy login-pin` y una prueba manual.

---

### Task 1: Edge Function extendida + tabla de intentos fallidos offline

**Files:**
- Modify: `supabase/functions/login-pin/index.ts`
- Modify: `lib/offline/db.ts`
- Create: `lib/offline/intentosPin.ts`

**Interfaces:**
- Consumes: nada nuevo (usa `baseDatosOffline` ya existente del Bloque J1).
- Produces:
  ```typescript
  // lib/offline/db.ts
  export interface IntentoPin {
    id?: number;
    usuarioId: string;
    intentoEn: string; // ISO string
  }
  // baseDatosOffline.intentosPin: Table<IntentoPin, number>

  // lib/offline/intentosPin.ts
  export function registrarIntentoFallido(usuarioId: string): Promise<void>;
  export function listarIntentosRecientes(usuarioId: string): Promise<Date[]>;
  export function limpiarIntentos(usuarioId: string): Promise<void>;
  ```
  La Edge Function extendida produce dos campos nuevos (`pin_hash`, `sede_id`) en su respuesta 200, que Task 4 (PinPad.tsx) consume. Task 2 consume `IntentoPin`/las tres funciones de arriba.

- [ ] **Step 1: Extender la query y la respuesta de éxito de la Edge Function**

En `supabase/functions/login-pin/index.ts`, la query de verificación de PIN (línea 74-78) es hoy:

```typescript
  const { data: usuario } = await admin
    .from("usuarios")
    .select("id, pin_hash, activo")
    .eq("id", usuario_id)
    .single();
```

Cambiar a:

```typescript
  const { data: usuario } = await admin
    .from("usuarios")
    .select("id, pin_hash, activo, sede_id")
    .eq("id", usuario_id)
    .single();
```

Y la respuesta de éxito (líneas 113-116) es hoy:

```typescript
  return json(200, {
    access_token: session.session.access_token,
    refresh_token: session.session.refresh_token,
  });
```

Cambiar a:

```typescript
  return json(200, {
    access_token: session.session.access_token,
    refresh_token: session.session.refresh_token,
    pin_hash: usuario!.pin_hash,
    sede_id: usuario!.sede_id,
  });
```

(`usuario!` es seguro aquí: si `usuario` fuera `null`, `valido` habría sido `false` y la función ya habría retornado 401 antes de llegar a este punto.)

- [ ] **Step 2: Desplegar la Edge Function y verificar manualmente**

Run: `supabase functions deploy login-pin`
Expected: despliegue exitoso, sin errores de compilación Deno.

Verificación manual (con un usuario cajera/admin real de prueba, o uno temporal creado y borrado después — nunca contra datos reales de producción): hacer login por PIN desde `/pin` con internet, confirmar en la respuesta de red (DevTools → Network → la petición a `/api/auth/pin`) que el JSON de respuesta ahora incluye `pin_hash` y `sede_id` además de `access_token`/`refresh_token`.

- [ ] **Step 3: Agregar la tabla `intentosPin` al esquema (versión 2)**

En `lib/offline/db.ts`, agregar la interfaz nueva junto a las demás (después de `InformeCache`):

```typescript
/** Marca de tiempo de un intento de PIN offline fallido, para reconstruir
 *  localmente el mismo límite de 5 intentos / 5 minutos que ya aplica el
 *  servidor (lib/auth/pin.ts) cuando hay conexión. */
export interface IntentoPin {
  id?: number;
  usuarioId: string;
  intentoEn: string;
}
```

Agregar el campo a la clase `BaseDatosOffline`:

```typescript
class BaseDatosOffline extends Dexie {
  colaSync!: Table<OperacionCola, number>;
  catalogoCache!: Table<EntradaCatalogo, string>;
  identidadLocal!: Table<IdentidadLocal, string>;
  informesCache!: Table<InformeCache, string>;
  intentosPin!: Table<IntentoPin, number>;

  constructor() {
    super("criollitas-offline");
    this.version(1).stores({
      colaSync: "++id, creadaEn",
      catalogoCache: "clave",
      identidadLocal: "usuarioId",
      informesCache: "clave",
    });
    this.version(2).stores({
      intentosPin: "++id, usuarioId, intentoEn",
    });
  }
}
```

(Dexie conserva automáticamente las tablas de la versión 1 sin necesidad de repetirlas en la versión 2 — solo se declara la tabla nueva.)

- [ ] **Step 4: Crear `lib/offline/intentosPin.ts`**

```typescript
import { baseDatosOffline } from "@/lib/offline/db";

/** Wrappers delgados sobre Dexie -- sin test unitario dedicado, mismo
 *  criterio que lib/offline/cola.ts (requieren IndexedDB real). */

export async function registrarIntentoFallido(usuarioId: string): Promise<void> {
  await baseDatosOffline.intentosPin.add({ usuarioId, intentoEn: new Date().toISOString() });
}

export async function listarIntentosRecientes(usuarioId: string): Promise<Date[]> {
  const intentos = await baseDatosOffline.intentosPin.where("usuarioId").equals(usuarioId).toArray();
  return intentos.map((i) => new Date(i.intentoEn));
}

export async function limpiarIntentos(usuarioId: string): Promise<void> {
  await baseDatosOffline.intentosPin.where("usuarioId").equals(usuarioId).delete();
}
```

- [ ] **Step 5: Verificar tipos, lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores (los módulos nuevos aún no se usan en ninguna pantalla).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/login-pin/index.ts lib/offline/db.ts lib/offline/intentosPin.ts
git commit -m "feat: edge function extendida y tabla de intentos de PIN offline"
```

---

### Task 2: Verificación de PIN local (núcleo puro con TDD + orquestación)

**Files:**
- Create: `lib/offline/pinLocal.ts`
- Test: `tests/unit/offline-pin-local.test.ts`
- Modify: `lib/offline/identidad.ts`

**Interfaces:**
- Consumes: `evaluarRateLimit` de `@/lib/auth/pin` (ya existe); `leerIdentidad` de `@/lib/offline/identidad`; `IdentidadLocal` de `@/lib/offline/db`; `registrarIntentoFallido`/`listarIntentosRecientes`/`limpiarIntentos` de `@/lib/offline/intentosPin` (Task 1).
- Produces:
  ```typescript
  // lib/offline/pinLocal.ts
  export type ResultadoPinLocal =
    | { tipo: "sin_credencial_local" }
    | { tipo: "bloqueado"; segundosRestantes: number }
    | { tipo: "incorrecto" }
    | { tipo: "correcto"; identidad: IdentidadLocal };
  export function decidirResultadoPin(
    identidad: IdentidadLocal | undefined,
    coincideHash: boolean,
    rateLimit: { bloqueado: boolean; segundosRestantes: number },
  ): ResultadoPinLocal;
  export function verificarPinLocal(usuarioId: string, pin: string): Promise<ResultadoPinLocal>;

  // lib/offline/identidad.ts (función nueva agregada)
  export function listarIdentidades(): Promise<IdentidadLocal[]>;
  ```
  Task 4 (PinPad.tsx, page.tsx) consume `verificarPinLocal`, `ResultadoPinLocal` y `listarIdentidades` con estas firmas exactas.

- [ ] **Step 1: Escribir el test de la lógica pura**

Archivo completo `tests/unit/offline-pin-local.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { decidirResultadoPin } from "@/lib/offline/pinLocal";
import type { IdentidadLocal } from "@/lib/offline/db";

const identidad: IdentidadLocal = {
  usuarioId: "u1",
  nombre: "Ana",
  rol: "cajera",
  sedeId: "s1",
  pinHash: "hash",
  refreshToken: "token",
  actualizadaEn: new Date().toISOString(),
};

describe("decidirResultadoPin", () => {
  it("sin identidad cacheada -> sin_credencial_local", () => {
    expect(decidirResultadoPin(undefined, true, { bloqueado: false, segundosRestantes: 0 })).toEqual({
      tipo: "sin_credencial_local",
    });
  });

  it("bloqueado por intentos -> bloqueado con segundos restantes", () => {
    expect(decidirResultadoPin(identidad, true, { bloqueado: true, segundosRestantes: 42 })).toEqual({
      tipo: "bloqueado",
      segundosRestantes: 42,
    });
  });

  it("hash no coincide -> incorrecto", () => {
    expect(decidirResultadoPin(identidad, false, { bloqueado: false, segundosRestantes: 0 })).toEqual({
      tipo: "incorrecto",
    });
  });

  it("hash coincide y sin bloqueo -> correcto con la identidad", () => {
    expect(decidirResultadoPin(identidad, true, { bloqueado: false, segundosRestantes: 0 })).toEqual({
      tipo: "correcto",
      identidad,
    });
  });
});
```

- [ ] **Step 2: Ejecutar el test y confirmar que falla**

Run: `pnpm test -- offline-pin-local.test.ts`
Expected: FAIL con "Cannot find module '@/lib/offline/pinLocal'".

- [ ] **Step 3: Implementar `lib/offline/pinLocal.ts`**

```typescript
import bcrypt from "bcryptjs";
import { evaluarRateLimit } from "@/lib/auth/pin";
import type { IdentidadLocal } from "@/lib/offline/db";
import { leerIdentidad } from "@/lib/offline/identidad";
import {
  limpiarIntentos,
  listarIntentosRecientes,
  registrarIntentoFallido,
} from "@/lib/offline/intentosPin";

export type ResultadoPinLocal =
  | { tipo: "sin_credencial_local" }
  | { tipo: "bloqueado"; segundosRestantes: number }
  | { tipo: "incorrecto" }
  | { tipo: "correcto"; identidad: IdentidadLocal };

/** Núcleo puro: decide el resultado de un intento de PIN offline a partir
 *  de datos ya calculados (identidad cacheada, si el hash coincide, y el
 *  estado del límite de intentos) -- sin tocar IndexedDB ni bcrypt
 *  directamente, para poder testearlo sin dependencias de navegador. */
export function decidirResultadoPin(
  identidad: IdentidadLocal | undefined,
  coincideHash: boolean,
  rateLimit: { bloqueado: boolean; segundosRestantes: number },
): ResultadoPinLocal {
  if (!identidad) return { tipo: "sin_credencial_local" };
  if (rateLimit.bloqueado) return { tipo: "bloqueado", segundosRestantes: rateLimit.segundosRestantes };
  if (!coincideHash) return { tipo: "incorrecto" };
  return { tipo: "correcto", identidad };
}

/** Orquestación: junta IndexedDB (identidad + intentos) y bcryptjs para
 *  verificar un PIN completamente offline. Sin test unitario dedicado
 *  (requiere IndexedDB real) -- la lógica de decisión que sí importa vive
 *  en decidirResultadoPin, ya testeada arriba. */
export async function verificarPinLocal(usuarioId: string, pin: string): Promise<ResultadoPinLocal> {
  const identidad = await leerIdentidad(usuarioId);
  const fallos = await listarIntentosRecientes(usuarioId);
  const rateLimit = evaluarRateLimit(fallos, new Date());
  const coincideHash =
    identidad && !rateLimit.bloqueado ? await bcrypt.compare(pin, identidad.pinHash) : false;
  const resultado = decidirResultadoPin(identidad, coincideHash, rateLimit);

  if (resultado.tipo === "incorrecto") await registrarIntentoFallido(usuarioId);
  if (resultado.tipo === "correcto") await limpiarIntentos(usuarioId);

  return resultado;
}
```

- [ ] **Step 4: Ejecutar el test y confirmar que pasa**

Run: `pnpm test -- offline-pin-local.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Agregar `listarIdentidades` a `lib/offline/identidad.ts`**

El archivo hoy es:

```typescript
import { baseDatosOffline, type IdentidadLocal } from "@/lib/offline/db";

export async function guardarIdentidad(
  identidad: Omit<IdentidadLocal, "actualizadaEn">,
): Promise<void> {
  await baseDatosOffline.identidadLocal.put({ ...identidad, actualizadaEn: new Date().toISOString() });
}

export async function leerIdentidad(usuarioId: string): Promise<IdentidadLocal | undefined> {
  return baseDatosOffline.identidadLocal.get(usuarioId);
}
```

Agregar al final:

```typescript

export async function listarIdentidades(): Promise<IdentidadLocal[]> {
  return baseDatosOffline.identidadLocal.toArray();
}
```

- [ ] **Step 6: Verificar tipos, lint, tests y build**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: todo verde, incluyendo los 4 tests nuevos.

- [ ] **Step 7: Commit**

```bash
git add lib/offline/pinLocal.ts tests/unit/offline-pin-local.test.ts lib/offline/identidad.ts
git commit -m "feat: verificacion de PIN local con TDD"
```

---

### Task 3: Sesión offline y guardia de rutas (núcleo puro con TDD + componentes)

**Files:**
- Create: `lib/offline/sesionOfflineStore.ts`
- Create: `lib/offline/guardiaOffline.ts`
- Test: `tests/unit/offline-guardia.test.ts`
- Create: `components/offline/GuardiaOffline.tsx`
- Create: `components/offline/ManejadorReconexion.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `esRutaPublica`/`resolverAccesoRuta` de `@/lib/auth/roles` (ya existen, sin cambios); `useConectividadStore` de `@/lib/offline/conectividadStore` (Bloque J1); `leerIdentidad` de `@/lib/offline/identidad`; `marcarPinValidado` de `@/app/(auth)/pin/actions` (ya existe).
- Produces:
  ```typescript
  // lib/offline/sesionOfflineStore.ts
  export interface SesionOffline { usuarioId: string; nombre: string; rol: "cajera" | "admin"; sedeId: string }
  export const useSesionOfflineStore: { getState(): { sesion: SesionOffline | null; iniciar: (s: SesionOffline) => void; cerrar: () => void } };

  // lib/offline/guardiaOffline.ts
  export type DecisionGuardia = { tipo: "quedarse" } | { tipo: "redirigir"; destino: string };
  export function decidirRedireccionOffline(pathname: string, sesion: SesionOffline | null): DecisionGuardia;
  ```
  Task 4 (PinPad.tsx) consume `useSesionOfflineStore` y `SesionOffline` con esta firma exacta.

- [ ] **Step 1: Crear `lib/offline/sesionOfflineStore.ts`**

```typescript
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SesionOffline {
  usuarioId: string;
  nombre: string;
  rol: "cajera" | "admin";
  sedeId: string;
}

interface SesionOfflineState {
  sesion: SesionOffline | null;
  iniciar: (sesion: SesionOffline) => void;
  cerrar: () => void;
}

/** Sesión activa mientras se navega offline (distinta de la sesión real de
 *  Supabase, que no existe en este momento). Persistida en localStorage
 *  para sobrevivir a una recarga de página sin conexión -- sin test
 *  unitario dedicado (localStorage no existe en el entorno Node de
 *  vitest), mismo criterio que otros wrappers de navegador del proyecto. */
export const useSesionOfflineStore = create<SesionOfflineState>()(
  persist(
    (set) => ({
      sesion: null,
      iniciar: (sesion) => set({ sesion }),
      cerrar: () => set({ sesion: null }),
    }),
    { name: "criollitas-sesion-offline" },
  ),
);
```

- [ ] **Step 2: Escribir el test de la lógica pura de la guardia**

Archivo completo `tests/unit/offline-guardia.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { decidirRedireccionOffline } from "@/lib/offline/guardiaOffline";
import type { SesionOffline } from "@/lib/offline/sesionOfflineStore";

const sesionCajera: SesionOffline = { usuarioId: "u1", nombre: "Ana", rol: "cajera", sedeId: "s1" };
const sesionAdmin: SesionOffline = { usuarioId: "u2", nombre: "Beto", rol: "admin", sedeId: "s1" };

describe("decidirRedireccionOffline", () => {
  it("ruta pública siempre se queda, con o sin sesión", () => {
    expect(decidirRedireccionOffline("/pin", null)).toEqual({ tipo: "quedarse" });
    expect(decidirRedireccionOffline("/login", sesionCajera)).toEqual({ tipo: "quedarse" });
  });

  it("ruta protegida sin sesión offline -> redirige a /pin", () => {
    expect(decidirRedireccionOffline("/pedidos", null)).toEqual({ tipo: "redirigir", destino: "/pin" });
  });

  it("cajera en su propia ruta -> se queda", () => {
    expect(decidirRedireccionOffline("/pedidos", sesionCajera)).toEqual({ tipo: "quedarse" });
  });

  it("cajera intentando entrar a ruta de admin -> redirige a su ruta base", () => {
    expect(decidirRedireccionOffline("/reportes/ventas", sesionCajera)).toEqual({
      tipo: "redirigir",
      destino: "/pedidos",
    });
  });

  it("admin en su propia ruta -> se queda", () => {
    expect(decidirRedireccionOffline("/reportes/ventas", sesionAdmin)).toEqual({ tipo: "quedarse" });
  });
});
```

- [ ] **Step 3: Ejecutar el test y confirmar que falla**

Run: `pnpm test -- offline-guardia.test.ts`
Expected: FAIL con "Cannot find module '@/lib/offline/guardiaOffline'".

- [ ] **Step 4: Implementar `lib/offline/guardiaOffline.ts`**

```typescript
import { esRutaPublica, resolverAccesoRuta } from "@/lib/auth/roles";
import type { SesionOffline } from "@/lib/offline/sesionOfflineStore";

export type DecisionGuardia = { tipo: "quedarse" } | { tipo: "redirigir"; destino: string };

/** Núcleo puro: decide si, estando offline, la ruta actual requiere
 *  redirigir a /pin (sin sesión offline activa) o a la ruta base del rol
 *  (sesión offline de un rol sin acceso a esta ruta) -- reutiliza las
 *  mismas reglas de acceso que ya aplica middleware.ts cuando hay
 *  conexión (esRutaPublica/resolverAccesoRuta), sin duplicarlas. */
export function decidirRedireccionOffline(
  pathname: string,
  sesion: SesionOffline | null,
): DecisionGuardia {
  if (esRutaPublica(pathname)) return { tipo: "quedarse" };
  if (!sesion) return { tipo: "redirigir", destino: "/pin" };
  const decision = resolverAccesoRuta(sesion.rol, pathname);
  return decision.tipo === "permitido"
    ? { tipo: "quedarse" }
    : { tipo: "redirigir", destino: decision.destino };
}
```

- [ ] **Step 5: Ejecutar el test y confirmar que pasa**

Run: `pnpm test -- offline-guardia.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Crear `components/offline/GuardiaOffline.tsx`**

```typescript
"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { useSesionOfflineStore } from "@/lib/offline/sesionOfflineStore";
import { decidirRedireccionOffline } from "@/lib/offline/guardiaOffline";

/** Mientras haya conexión, middleware.ts sigue siendo la única autoridad
 *  de acceso -- este componente no hace nada. Solo actúa cuando el
 *  detector de conectividad confirma que no hay internet (Bloque J1),
 *  momento en el que middleware.ts no puede ejecutarse en absoluto (el
 *  navegador no alcanza a Vercel). Sin test unitario (efectos de
 *  navegador/router); la lógica de decisión que importa vive en
 *  decidirRedireccionOffline, ya testeada. */
export function GuardiaOffline() {
  const pathname = usePathname();
  const router = useRouter();
  const estado = useConectividadStore((s) => s.estado);
  const sesion = useSesionOfflineStore((s) => s.sesion);

  useEffect(() => {
    if (estado !== "offline") return;
    const decision = decidirRedireccionOffline(pathname, sesion);
    if (decision.tipo === "redirigir") router.replace(decision.destino);
  }, [pathname, estado, sesion, router]);

  return null;
}
```

- [ ] **Step 7: Crear `components/offline/ManejadorReconexion.tsx`**

```typescript
"use client";

import { useEffect, useRef } from "react";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { useSesionOfflineStore } from "@/lib/offline/sesionOfflineStore";
import { leerIdentidad } from "@/lib/offline/identidad";
import { createClient } from "@/lib/supabase/client";
import { marcarPinValidado } from "@/app/(auth)/pin/actions";

/** Cuando vuelve la conexión tras haber operado offline, intenta
 *  restaurar una sesión real de Supabase con el refresh_token cacheado
 *  (Bloque J1/J2) y devolver el flujo al camino normal (cookie
 *  pin_validado vía middleware.ts). Si el refresh_token ya venció (caso
 *  raro, equipo sin uso prolongado), no hace nada más -- el usuario
 *  reingresa normalmente la próxima vez que el middleware lo mande a
 *  /login o /pin. Sin test unitario (efectos de navegador/Supabase). */
export function ManejadorReconexion() {
  const estado = useConectividadStore((s) => s.estado);
  const estadoAnteriorRef = useRef(estado);

  useEffect(() => {
    const volvioOnline = estadoAnteriorRef.current === "offline" && estado === "online";
    estadoAnteriorRef.current = estado;
    if (!volvioOnline) return;

    const sesion = useSesionOfflineStore.getState().sesion;
    if (!sesion) return;

    (async () => {
      const identidad = await leerIdentidad(sesion.usuarioId);
      if (!identidad) return;
      const supabase = createClient();
      const { error } = await supabase.auth.refreshSession({ refresh_token: identidad.refreshToken });
      if (error) return;
      await marcarPinValidado();
      useSesionOfflineStore.getState().cerrar();
    })();
  }, [estado]);

  return null;
}
```

- [ ] **Step 8: Montar ambos componentes en el layout raíz**

`app/layout.tsx` hoy (tras el Bloque J1):

```typescript
import type { Metadata } from "next";
import { Fredoka, Inter, JetBrains_Mono } from "next/font/google";
import { MonitorConectividad } from "@/components/offline/MonitorConectividad";
import { RegistradorServiceWorker } from "@/components/offline/RegistradorServiceWorker";
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
        <MonitorConectividad />
        <RegistradorServiceWorker />
        {children}
      </body>
    </html>
  );
}
```

Cambiar los imports (agregar dos) y el cuerpo del `<body>`:

```typescript
import type { Metadata } from "next";
import { Fredoka, Inter, JetBrains_Mono } from "next/font/google";
import { MonitorConectividad } from "@/components/offline/MonitorConectividad";
import { RegistradorServiceWorker } from "@/components/offline/RegistradorServiceWorker";
import { GuardiaOffline } from "@/components/offline/GuardiaOffline";
import { ManejadorReconexion } from "@/components/offline/ManejadorReconexion";
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
        <MonitorConectividad />
        <RegistradorServiceWorker />
        <GuardiaOffline />
        <ManejadorReconexion />
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 9: Verificar tipos, lint, tests y build**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: todo verde, incluyendo los 5 tests nuevos de `decidirRedireccionOffline`.

- [ ] **Step 10: Commit**

```bash
git add lib/offline/sesionOfflineStore.ts lib/offline/guardiaOffline.ts tests/unit/offline-guardia.test.ts components/offline/GuardiaOffline.tsx components/offline/ManejadorReconexion.tsx app/layout.tsx
git commit -m "feat: sesion offline y guardia de rutas sin servidor"
```

---

### Task 4: Login por PIN offline (página `/pin` y `PinPad`)

**Files:**
- Modify: `app/(auth)/pin/page.tsx`
- Modify: `components/auth/PinPad.tsx`

**Interfaces:**
- Consumes: `listarIdentidades` de `@/lib/offline/identidad` (Task 2); `verificarPinLocal`/`ResultadoPinLocal` de `@/lib/offline/pinLocal` (Task 2); `useSesionOfflineStore`/`SesionOffline` de `@/lib/offline/sesionOfflineStore` (Task 3); `useConectividadStore` de `@/lib/offline/conectividadStore` (Bloque J1); `guardarIdentidad` de `@/lib/offline/identidad` (Bloque J1).
- Produces: nada nuevo — es la pieza final que conecta todo lo anterior a la UI real.

- [ ] **Step 1: Convertir `app/(auth)/pin/page.tsx` de Server Component a Client Component**

El archivo hoy es:

```typescript
import { PinPad, type UsuarioPin } from "@/components/auth/PinPad";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

const SEDE_ID = process.env.NEXT_PUBLIC_SEDE_ID ?? SEDE_DEFAULT_ID;

export default async function PinPage() {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/login-pin/usuarios?sede_id=${SEDE_ID}`,
    {
      cache: "no-store",
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
    },
  );
  const usuarios: UsuarioPin[] = res.ok ? await res.json() : [];
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <PinPad usuarios={usuarios} />
    </main>
  );
}
```

Reemplazar el archivo completo por:

```typescript
"use client";

import { useEffect, useState } from "react";
import { PinPad, type UsuarioPin } from "@/components/auth/PinPad";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";
import { listarIdentidades } from "@/lib/offline/identidad";

const SEDE_ID = process.env.NEXT_PUBLIC_SEDE_ID ?? SEDE_DEFAULT_ID;

export default function PinPage() {
  const [usuarios, setUsuarios] = useState<UsuarioPin[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;

    async function cargar() {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/login-pin/usuarios?sede_id=${SEDE_ID}`,
          { cache: "no-store", headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } },
        );
        if (!res.ok) throw new Error("respuesta no ok");
        const datos: UsuarioPin[] = await res.json();
        if (!cancelado) setUsuarios(datos);
      } catch {
        // Sin conexión (o el servidor no respondió): usar la lista
        // cacheada localmente -- solo contiene Cajera/Admin, los únicos
        // roles con respaldo offline (Bloque J2).
        const identidades = await listarIdentidades();
        if (!cancelado) {
          setUsuarios(
            identidades.map((i) => ({
              id: i.usuarioId,
              nombre: i.nombre,
              avatar_url: null,
              rol: i.rol,
            })),
          );
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    }
    cargar();
    return () => {
      cancelado = true;
    };
  }, []);

  if (cargando) return null;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <PinPad usuarios={usuarios} />
    </main>
  );
}
```

- [ ] **Step 2: Cachear identidad tras un login online exitoso en `PinPad.tsx`**

Agregar el import nuevo junto a los ya existentes (después de `import { marcarPinValidado } from "@/app/(auth)/pin/actions";`):

```typescript
import { guardarIdentidad } from "@/lib/offline/identidad";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { verificarPinLocal } from "@/lib/offline/pinLocal";
import { useSesionOfflineStore } from "@/lib/offline/sesionOfflineStore";
```

Dentro de `confirmarPin`, el bloque de éxito (`if (respuesta.status === 200)`) tiene hoy:

```typescript
        try {
          await marcarPinValidado();
          if (usuarioEnCursoRef.current !== usuarioId) return;
          router.push(rutaPorRol(rolUsuario));
        } catch {
```

Cambiar a:

```typescript
        try {
          await marcarPinValidado();
          if (usuarioEnCursoRef.current !== usuarioId) return;
          if (rolUsuario === "cajera" || rolUsuario === "admin") {
            await guardarIdentidad({
              usuarioId,
              nombre: usuarioSeleccionado.nombre,
              rol: rolUsuario,
              sedeId: datos.sede_id,
              pinHash: datos.pin_hash,
              refreshToken: datos.refresh_token,
            });
          }
          router.push(rutaPorRol(rolUsuario));
        } catch {
```

- [ ] **Step 3: Agregar la rama offline al inicio de `confirmarPin`**

`confirmarPin` empieza hoy así:

```typescript
  async function confirmarPin() {
    if (!usuarioSeleccionado || pin.length < PIN_MIN || enviando || segundosRestantes > 0) return;
    const usuarioId = usuarioSeleccionado.id;
    const rolUsuario = usuarioSeleccionado.rol;
    setEnviando(true);
    setError(null);
    try {
      const respuesta = await fetch("/api/auth/pin", {
```

Insertar la rama offline entre `setError(null);` y el `try` existente:

```typescript
  async function confirmarPin() {
    if (!usuarioSeleccionado || pin.length < PIN_MIN || enviando || segundosRestantes > 0) return;
    const usuarioId = usuarioSeleccionado.id;
    const rolUsuario = usuarioSeleccionado.rol;
    setEnviando(true);
    setError(null);

    if (useConectividadStore.getState().estado === "offline") {
      const resultado = await verificarPinLocal(usuarioId, pin);
      if (usuarioEnCursoRef.current !== usuarioId) return;
      if (resultado.tipo === "sin_credencial_local") {
        setError("No hay una entrada guardada para este usuario en este equipo.");
        setPin("");
        setEnviando(false);
        return;
      }
      if (resultado.tipo === "bloqueado") {
        setError(`Demasiados intentos. Espera ${resultado.segundosRestantes} segundos.`);
        setPin("");
        iniciarBloqueo(resultado.segundosRestantes);
        setEnviando(false);
        return;
      }
      if (resultado.tipo === "incorrecto") {
        setError("PIN incorrecto. Intenta de nuevo.");
        setPin("");
        setEnviando(false);
        return;
      }
      // resultado.tipo === "correcto": solo se cachea identidad para
      // cajera/admin (Step 2), así que rolUsuario solo puede ser uno de
      // esos dos en este punto.
      useSesionOfflineStore.getState().iniciar({
        usuarioId,
        nombre: usuarioSeleccionado.nombre,
        rol: rolUsuario as "cajera" | "admin",
        sedeId: resultado.identidad.sedeId,
      });
      router.push(rutaPorRol(rolUsuario));
      return;
    }

    try {
      const respuesta = await fetch("/api/auth/pin", {
```

- [ ] **Step 4: Verificar tipos, lint, tests y build**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: todo verde.

- [ ] **Step 5: Verificación manual end-to-end**

Con `pnpm dev` y `supabase functions deploy login-pin` ya aplicado (Task 1):

1. Iniciar sesión por PIN con internet, como Cajera o Admin. Confirmar en DevTools → Application → IndexedDB → `criollitas-offline` → `identidadLocal` que quedó guardada una fila para ese usuario.
2. Cerrar sesión, activar el modo "Offline" de las DevTools (Network → Offline).
3. Recargar `/pin`: debe mostrar la lista de usuarios cacheados (sin necesitar red).
4. Entrar con el mismo usuario y el mismo PIN: debe navegar a la ruta base de su rol sin ningún error de red.
5. Estando aún en modo offline, navegar manualmente a una ruta de otro rol (ej. si entraste como Cajera, ir a `/reportes/ventas`): debe redirigir de vuelta a `/pedidos`.
6. Desactivar el modo Offline de las DevTools: en unos segundos (ciclo de ping del Bloque J1, cada 15s) debe restaurarse una sesión real — confirmar en Application → Cookies que aparece `pin_validado`, y que `useSesionOfflineStore` (visible en React DevTools o revisando `localStorage["criollitas-sesion-offline"]`) volvió a `sesion: null`.

- [ ] **Step 6: Commit**

```bash
git add "app/(auth)/pin/page.tsx" components/auth/PinPad.tsx
git commit -m "feat: login por PIN offline y guardia de rutas conectados a la UI"
```

---

## Self-Review

- **Cobertura del spec**: cacheo de credenciales al iniciar sesión online (Task 2 produce `guardarIdentidad`, Task 4 lo conecta) ✓, verificación de PIN local con bcryptjs (Task 2) ✓, límite de intentos reconstruido localmente (Task 1 + Task 2, reutiliza `evaluarRateLimit` existente) ✓, sin necesidad de sesión válida de Supabase mientras dura el corte (Task 3, `useSesionOfflineStore` en vez de una sesión real) ✓, restauración de sesión real al volver la conexión vía `refresh_token` (Task 3, `ManejadorReconexion`) ✓, caso raro de refresh_token vencido documentado como límite aceptado (comentario en `ManejadorReconexion.tsx`) ✓.
- **Placeholders**: ninguno — cada step trae el código completo.
- **Consistencia de tipos**: `ResultadoPinLocal` se define una sola vez en Task 2 y lo consume Task 4 sin redeclararlo. `SesionOffline` se define una sola vez en Task 3 y lo consumen `guardiaOffline.ts` (Task 3) y `PinPad.tsx` (Task 4) con el mismo shape. `IntentoPin`/`baseDatosOffline.intentosPin` se define en Task 1 y lo consume `intentosPin.ts` (Task 1) y transitivamente `pinLocal.ts` (Task 2).
