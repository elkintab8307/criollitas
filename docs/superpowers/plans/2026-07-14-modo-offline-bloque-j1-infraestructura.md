# Bloque J1 — Infraestructura offline base: Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sentar la infraestructura mínima para que el sistema pueda operar offline: una base de datos local en el navegador (IndexedDB vía Dexie) con las 4 tablas que necesitarán los bloques siguientes, un detector confiable de conectividad, y un Service Worker que permita que la aplicación cargue sin internet.

**Architecture:** Cuatro tablas Dexie (`colaSync`, `catalogoCache`, `identidadLocal`, `informesCache`) definidas en un único módulo de esquema, con funciones delgadas de lectura/escritura por tabla en módulos separados. Un detector de conectividad con su lógica de decisión pura y separada (testeable) de la orquestación real (ping HTTP + eventos del navegador, no testeada, mismo criterio que otros wrappers delgados del proyecto). Un Service Worker mínimo hecho a mano (sin librerías tipo `next-pwa` — el proyecto usa Turbopack, soporte incierto en esas librerías) que cachea el shell de la app.

**Tech Stack:** Next.js 15 App Router, TypeScript estricto, Dexie (nueva dependencia), Zustand (ya usado en el proyecto, `lib/pedido/carritoStore.ts`), Service Worker nativo del navegador.

## Global Constraints

- TypeScript estricto, sin `any` (CLAUDE.md §12).
- Nombres de dominio en español (`colaSync`, `catalogoCache`, etc. como identificadores de tabla; funciones y tipos en español).
- Alias de import `@/` para la raíz.
- Wrappers delgados sobre APIs del navegador (Dexie, `fetch`, Service Worker) no llevan test unitario dedicado — mismo criterio ya establecido en `lib/reportes/exportar.ts` (`exportarCSV`/`exportarXLSX`): solo se testea la lógica pura que no depende de esas APIs.
- Este bloque es **solo infraestructura**: no encola operaciones reales (abrir turno, cobrar, etc.), no cachea datos reales del catálogo, no verifica PIN localmente, no sincroniza nada todavía. Eso es trabajo de los bloques J2-J5 (fuera de alcance aquí).
- `pnpm lint && pnpm test && pnpm build` deben quedar verdes antes de dar cualquier task por terminada.

---

### Task 1: Dependencia `dexie` y esquema de la base de datos local

**Files:**
- Modify: `package.json` (agrega `dexie`)
- Create: `lib/offline/db.ts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces:
  ```typescript
  export interface OperacionCola {
    id?: number;
    tipo: string;
    payload: Record<string, unknown>;
    creadaEn: string; // ISO string
    sincronizada: boolean;
  }
  export interface EntradaCatalogo {
    clave: string;
    datos: unknown;
    actualizadaEn: string; // ISO string
  }
  export interface IdentidadLocal {
    usuarioId: string;
    nombre: string;
    rol: "cajera" | "admin";
    sedeId: string;
    pinHash: string;
    refreshToken: string;
    actualizadaEn: string; // ISO string
  }
  export interface InformeCache {
    clave: string;
    datos: unknown;
    descargadoEn: string; // ISO string
  }
  export const baseDatosOffline: Dexie & {
    colaSync: Table<OperacionCola, number>;
    catalogoCache: Table<EntradaCatalogo, string>;
    identidadLocal: Table<IdentidadLocal, string>;
    informesCache: Table<InformeCache, string>;
  };
  ```
  Los módulos de la Task 2 (`cola.ts`, `catalogo.ts`, `identidad.ts`, `informes.ts`) importan `baseDatosOffline` y los 4 tipos de aquí.

- [ ] **Step 1: Agregar la dependencia**

Run: `pnpm add dexie`
Expected: agrega `dexie` a `dependencies` en `package.json` y actualiza `pnpm-lock.yaml`.

- [ ] **Step 2: Crear el esquema**

Archivo completo `lib/offline/db.ts`:

```typescript
import Dexie, { type Table } from "dexie";

/** Una operación (abrir turno, cobrar, etc.) pendiente de subir a Supabase.
 *  El contenido real de `tipo`/`payload` lo definen los bloques que
 *  encolan operaciones (J3/J4) -- aquí solo vive el esquema de la tabla. */
export interface OperacionCola {
  id?: number;
  tipo: string;
  payload: Record<string, unknown>;
  creadaEn: string;
  sincronizada: boolean;
}

/** Copia local de un recurso de solo lectura (productos, categorías,
 *  modificadores, mesas) para operar sin conexión. `clave` identifica qué
 *  recurso es (ej. "productos", "mesas"); el refresco real es trabajo de
 *  un bloque posterior. */
export interface EntradaCatalogo {
  clave: string;
  datos: unknown;
  actualizadaEn: string;
}

/** Credencial local de Cajera o Admin para poder iniciar sesión sin
 *  conexión en este equipo. El cacheo real al iniciar sesión con internet
 *  es trabajo del Bloque J2. */
export interface IdentidadLocal {
  usuarioId: string;
  nombre: string;
  rol: "cajera" | "admin";
  sedeId: string;
  pinHash: string;
  refreshToken: string;
  actualizadaEn: string;
}

/** Última versión conocida de un reporte, para que Admin pueda revisarlo
 *  sin conexión. El uso real es trabajo del Bloque J5. */
export interface InformeCache {
  clave: string;
  datos: unknown;
  descargadoEn: string;
}

class BaseDatosOffline extends Dexie {
  colaSync!: Table<OperacionCola, number>;
  catalogoCache!: Table<EntradaCatalogo, string>;
  identidadLocal!: Table<IdentidadLocal, string>;
  informesCache!: Table<InformeCache, string>;

  constructor() {
    super("criollitas-offline");
    this.version(1).stores({
      colaSync: "++id, creadaEn, sincronizada",
      catalogoCache: "clave",
      identidadLocal: "usuarioId",
      informesCache: "clave",
    });
  }
}

/** Instancia única de la base de datos local (IndexedDB vía Dexie).
 *  Sin test unitario -- Dexie requiere IndexedDB real, no disponible en el
 *  entorno Node de vitest (mismo criterio que lib/reportes/exportar.ts). */
export const baseDatosOffline = new BaseDatosOffline();
```

- [ ] **Step 3: Verificar tipos, lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores (el módulo aún no se usa en ninguna parte de la app).

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml lib/offline/db.ts
git commit -m "feat: esquema de base de datos local offline (Dexie)"
```

---

### Task 2: Funciones de lectura/escritura por tabla

**Files:**
- Create: `lib/offline/cola.ts`
- Create: `lib/offline/catalogo.ts`
- Create: `lib/offline/identidad.ts`
- Create: `lib/offline/informes.ts`

**Interfaces:**
- Consumes: `baseDatosOffline`, `OperacionCola`, `EntradaCatalogo`, `IdentidadLocal`, `InformeCache` de `@/lib/offline/db` (Task 1).
- Produces:
  ```typescript
  // lib/offline/cola.ts
  export function encolarOperacion(op: Omit<OperacionCola, "id" | "sincronizada">): Promise<number>;
  export function listarPendientes(): Promise<OperacionCola[]>;
  export function marcarSincronizada(id: number): Promise<void>;

  // lib/offline/catalogo.ts
  export function guardarEnCatalogo(clave: string, datos: unknown): Promise<void>;
  export function leerDelCatalogo(clave: string): Promise<EntradaCatalogo | undefined>;

  // lib/offline/identidad.ts
  export function guardarIdentidad(identidad: Omit<IdentidadLocal, "actualizadaEn">): Promise<void>;
  export function leerIdentidad(usuarioId: string): Promise<IdentidadLocal | undefined>;

  // lib/offline/informes.ts
  export function guardarInforme(clave: string, datos: unknown): Promise<void>;
  export function leerInforme(clave: string): Promise<InformeCache | undefined>;
  ```
  Los bloques J2-J5 consumen estas funciones exactas en vez de tocar `baseDatosOffline` directamente.

- [ ] **Step 1: Crear `lib/offline/cola.ts`**

```typescript
import { baseDatosOffline, type OperacionCola } from "@/lib/offline/db";

/** Wrappers delgados sobre Dexie -- sin test unitario dedicado, mismo
 *  criterio que lib/reportes/exportar.ts (requieren IndexedDB real). */

export async function encolarOperacion(
  op: Omit<OperacionCola, "id" | "sincronizada">,
): Promise<number> {
  return baseDatosOffline.colaSync.add({ ...op, sincronizada: false });
}

export async function listarPendientes(): Promise<OperacionCola[]> {
  return baseDatosOffline.colaSync.where("sincronizada").equals(0).sortBy("creadaEn");
}

export async function marcarSincronizada(id: number): Promise<void> {
  await baseDatosOffline.colaSync.update(id, { sincronizada: true });
}
```

- [ ] **Step 2: Crear `lib/offline/catalogo.ts`**

```typescript
import { baseDatosOffline, type EntradaCatalogo } from "@/lib/offline/db";

export async function guardarEnCatalogo(clave: string, datos: unknown): Promise<void> {
  await baseDatosOffline.catalogoCache.put({ clave, datos, actualizadaEn: new Date().toISOString() });
}

export async function leerDelCatalogo(clave: string): Promise<EntradaCatalogo | undefined> {
  return baseDatosOffline.catalogoCache.get(clave);
}
```

- [ ] **Step 3: Crear `lib/offline/identidad.ts`**

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

- [ ] **Step 4: Crear `lib/offline/informes.ts`**

```typescript
import { baseDatosOffline, type InformeCache } from "@/lib/offline/db";

export async function guardarInforme(clave: string, datos: unknown): Promise<void> {
  await baseDatosOffline.informesCache.put({ clave, datos, descargadoEn: new Date().toISOString() });
}

export async function leerInforme(clave: string): Promise<InformeCache | undefined> {
  return baseDatosOffline.informesCache.get(clave);
}
```

- [ ] **Step 5: Verificar tipos, lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add lib/offline/cola.ts lib/offline/catalogo.ts lib/offline/identidad.ts lib/offline/informes.ts
git commit -m "feat: funciones de lectura/escritura de las tablas offline"
```

---

### Task 3: Detector de conectividad (lógica pura + store)

**Files:**
- Create: `lib/offline/conectividad.ts`
- Test: `tests/unit/offline-conectividad.test.ts`
- Create: `lib/offline/conectividadStore.ts`
- Test: `tests/unit/offline-conectividad-store.test.ts`
- Create: `lib/offline/ping.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces:
  ```typescript
  // lib/offline/conectividad.ts
  export type EstadoConectividad = "online" | "offline";
  export interface ResultadoPing { exito: boolean; enMs: number }
  export function evaluarConectividad(
    navegadorOnline: boolean,
    ultimoPing: ResultadoPing | null,
  ): EstadoConectividad;

  // lib/offline/conectividadStore.ts
  export const useConectividadStore: {
    getState(): {
      estado: EstadoConectividad;
      ultimoPing: ResultadoPing | null;
      registrarNavegador: (online: boolean) => void;
      registrarPing: (resultado: ResultadoPing) => void;
    };
  }; // hook zustand, se usa igual que useCarritoStore

  // lib/offline/ping.ts
  export function hacerPing(): Promise<ResultadoPing>;
  ```
  Task 4 usa `useConectividadStore` y `hacerPing` para orquestar el monitoreo real en un componente cliente.

- [ ] **Step 1: Escribir el test de la lógica pura**

Archivo completo `tests/unit/offline-conectividad.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { evaluarConectividad } from "@/lib/offline/conectividad";

describe("evaluarConectividad", () => {
  it("sin señal de red es offline, sin importar el ping", () => {
    expect(evaluarConectividad(false, null)).toBe("offline");
    expect(evaluarConectividad(false, { exito: true, enMs: 50 })).toBe("offline");
  });

  it("con señal de red y sin ping todavía, es online (optimista)", () => {
    expect(evaluarConectividad(true, null)).toBe("online");
  });

  it("con señal de red y último ping exitoso, es online", () => {
    expect(evaluarConectividad(true, { exito: true, enMs: 80 })).toBe("online");
  });

  it("con señal de red pero último ping fallido, es offline", () => {
    expect(evaluarConectividad(true, { exito: false, enMs: 3000 })).toBe("offline");
  });
});
```

- [ ] **Step 2: Ejecutar el test y confirmar que falla**

Run: `pnpm test -- offline-conectividad.test.ts`
Expected: FAIL con "Cannot find module '@/lib/offline/conectividad'" (el archivo todavía no existe).

- [ ] **Step 3: Implementar `lib/offline/conectividad.ts`**

```typescript
export type EstadoConectividad = "online" | "offline";

export interface ResultadoPing {
  exito: boolean;
  enMs: number;
}

/** Decide el estado de conectividad combinando la señal de red del
 *  navegador (`navigator.onLine`, solo indica si hay interfaz de red, no
 *  si de verdad hay internet) con el resultado del último ping activo a
 *  Supabase. Sin señal de red, offline siempre. Con señal de red y sin
 *  ping todavía, se asume online hasta el primer resultado (evita mostrar
 *  "offline" en el instante en que carga la app). */
export function evaluarConectividad(
  navegadorOnline: boolean,
  ultimoPing: ResultadoPing | null,
): EstadoConectividad {
  if (!navegadorOnline) return "offline";
  if (ultimoPing === null) return "online";
  return ultimoPing.exito ? "online" : "offline";
}
```

- [ ] **Step 4: Ejecutar el test y confirmar que pasa**

Run: `pnpm test -- offline-conectividad.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Escribir el test del store**

Archivo completo `tests/unit/offline-conectividad-store.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { useConectividadStore } from "@/lib/offline/conectividadStore";

describe("useConectividadStore", () => {
  beforeEach(() => {
    useConectividadStore.setState({ estado: "online", ultimoPing: null });
  });

  it("arranca en online sin ping todavía", () => {
    expect(useConectividadStore.getState().estado).toBe("online");
  });

  it("registrar navegador offline pone el estado en offline", () => {
    useConectividadStore.getState().registrarNavegador(false);
    expect(useConectividadStore.getState().estado).toBe("offline");
  });

  it("un ping fallido con navegador online pone el estado en offline", () => {
    useConectividadStore.getState().registrarNavegador(true);
    useConectividadStore.getState().registrarPing({ exito: false, enMs: 3000 });
    expect(useConectividadStore.getState().estado).toBe("offline");
  });

  it("un ping exitoso después de uno fallido vuelve a online", () => {
    useConectividadStore.getState().registrarNavegador(true);
    useConectividadStore.getState().registrarPing({ exito: false, enMs: 3000 });
    useConectividadStore.getState().registrarPing({ exito: true, enMs: 60 });
    expect(useConectividadStore.getState().estado).toBe("online");
  });
});
```

- [ ] **Step 6: Ejecutar el test y confirmar que falla**

Run: `pnpm test -- offline-conectividad-store.test.ts`
Expected: FAIL con "Cannot find module '@/lib/offline/conectividadStore'".

- [ ] **Step 7: Implementar `lib/offline/conectividadStore.ts`**

```typescript
"use client";

import { create } from "zustand";
import { evaluarConectividad, type EstadoConectividad, type ResultadoPing } from "@/lib/offline/conectividad";

interface ConectividadState {
  estado: EstadoConectividad;
  ultimoPing: ResultadoPing | null;
  registrarNavegador: (online: boolean) => void;
  registrarPing: (resultado: ResultadoPing) => void;
}

/** Estado global de conectividad, estilo useCarritoStore
 *  (lib/pedido/carritoStore.ts). La orquestación real (leer
 *  navigator.onLine, hacer ping periódico) vive en un componente cliente
 *  aparte (Task 4) -- este store no toca ninguna API del navegador
 *  directamente, por eso es testeable igual que carritoStore. */
export const useConectividadStore = create<ConectividadState>((set, get) => ({
  estado: "online",
  ultimoPing: null,
  registrarNavegador: (online) => {
    set({ estado: evaluarConectividad(online, get().ultimoPing) });
  },
  registrarPing: (resultado) => {
    set((state) => {
      const navegadorOnline = state.estado !== "offline" || resultado.exito;
      return { ultimoPing: resultado, estado: evaluarConectividad(navegadorOnline, resultado) };
    });
  },
}));
```

**Nota de implementación**: `registrarPing` necesita saber si el navegador tiene señal de red al momento del ping, pero el store no la guarda como campo aparte (solo el `estado` resultante). La línea `navegadorOnline = state.estado !== "offline" || resultado.exito` es una forma indirecta de no perder la señal de "sin red" ya conocida; si el test del Step 5 falla con este approach, ajusta el store para guardar explícitamente un campo `navegadorOnline: boolean` en el estado (además de `estado`/`ultimoPing`) y úsalo directamente en ambos métodos — es la alternativa más simple y explícita si la de arriba no pasa los 4 tests tal cual.

- [ ] **Step 8: Ejecutar el test y confirmar que pasa**

Run: `pnpm test -- offline-conectividad-store.test.ts`
Expected: PASS (4 tests). Si falla, aplica el ajuste descrito en la nota del Step 7 (campo `navegadorOnline` explícito) y vuelve a correr.

- [ ] **Step 9: Crear `lib/offline/ping.ts`**

```typescript
import type { ResultadoPing } from "@/lib/offline/conectividad";

const TIMEOUT_MS = 3000;

/** Ping liviano a Supabase para confirmar que hay internet real, no solo
 *  señal de red -- cualquier respuesta (incluso 404/401) prueba que el
 *  camino de red está vivo, así que no depende de un endpoint específico
 *  que responda 200. Sin test unitario (fetch/AbortController de
 *  navegador no aportan valor mockeados), mismo criterio que otros
 *  wrappers delgados del proyecto. */
export async function hacerPing(): Promise<ResultadoPing> {
  const inicio = Date.now();
  const controlador = new AbortController();
  const timeoutId = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL!, {
      method: "HEAD",
      signal: controlador.signal,
    });
    return { exito: true, enMs: Date.now() - inicio };
  } catch {
    return { exito: false, enMs: Date.now() - inicio };
  } finally {
    clearTimeout(timeoutId);
  }
}
```

- [ ] **Step 10: Correr toda la suite y verificar lint/build**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: todo verde, incluyendo los 8 tests nuevos (4 de `evaluarConectividad` + 4 del store).

- [ ] **Step 11: Commit**

```bash
git add lib/offline/conectividad.ts lib/offline/conectividadStore.ts lib/offline/ping.ts tests/unit/offline-conectividad.test.ts tests/unit/offline-conectividad-store.test.ts
git commit -m "feat: detector de conectividad (logica pura + store)"
```

---

### Task 4: Monitor de conectividad, Service Worker mínimo y verificación manual

**Files:**
- Create: `components/offline/MonitorConectividad.tsx`
- Create: `public/sw.js`
- Create: `components/offline/RegistradorServiceWorker.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `useConectividadStore` (Task 3), `hacerPing` (Task 3).
- Produces: nada nuevo para tasks futuras de este bloque — es la pieza final. Los bloques J2-J5 sí van a leer `useConectividadStore.getState().estado` para decidir si operar online u offline.

- [ ] **Step 1: Crear `components/offline/MonitorConectividad.tsx`**

```typescript
"use client";

import { useEffect } from "react";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { hacerPing } from "@/lib/offline/ping";

const INTERVALO_PING_MS = 15_000;

/** Monta el monitoreo real de conectividad: escucha los eventos
 *  online/offline del navegador y hace ping periódico a Supabase. No
 *  renderiza nada visible -- el indicador para el usuario es trabajo del
 *  Bloque J5. Sin test unitario (efectos de navegador), verificado
 *  manualmente en el Step 5. */
export function MonitorConectividad() {
  useEffect(() => {
    const store = useConectividadStore.getState();
    store.registrarNavegador(navigator.onLine);

    const alCambiarNavegador = () => useConectividadStore.getState().registrarNavegador(navigator.onLine);
    window.addEventListener("online", alCambiarNavegador);
    window.addEventListener("offline", alCambiarNavegador);

    const intervalo = setInterval(async () => {
      const resultado = await hacerPing();
      useConectividadStore.getState().registrarPing(resultado);
    }, INTERVALO_PING_MS);

    return () => {
      window.removeEventListener("online", alCambiarNavegador);
      window.removeEventListener("offline", alCambiarNavegador);
      clearInterval(intervalo);
    };
  }, []);

  return null;
}
```

- [ ] **Step 2: Crear el Service Worker mínimo `public/sw.js`**

```javascript
const CACHE_NAME = "criollitas-shell-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cacheada = await cache.match(event.request);
      if (cacheada) {
        // cache-first: sirve la copia guardada, y de paso refresca en
        // segundo plano si hay red (no bloquea la respuesta al usuario).
        fetch(event.request)
          .then((respuestaRed) => cache.put(event.request, respuestaRed))
          .catch(() => {});
        return cacheada;
      }
      try {
        const respuestaRed = await fetch(event.request);
        cache.put(event.request, respuestaRed.clone());
        return respuestaRed;
      } catch (error) {
        throw error;
      }
    }),
  );
});
```

- [ ] **Step 3: Crear `components/offline/RegistradorServiceWorker.tsx`**

```typescript
"use client";

import { useEffect } from "react";

/** Registra el Service Worker la primera vez que el sitio carga con
 *  internet, para que quede disponible sin conexión más adelante. Sin
 *  test unitario (API de Service Worker del navegador), verificado
 *  manualmente en el Step 5. */
export function RegistradorServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Sin conexión o navegador sin soporte -- la app sigue funcionando
      // en modo normal, simplemente sin respaldo offline esta vez.
    });
  }, []);

  return null;
}
```

- [ ] **Step 4: Montar ambos componentes en el layout raíz**

En `app/layout.tsx`, agregar los imports y montar los dos componentes dentro de `<body>`, antes de `{children}`:

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

- [ ] **Step 5: Verificar lint, tests y build**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: todo verde.

- [ ] **Step 6: Verificación manual del Service Worker**

El Service Worker se comporta de forma más predecible en producción que en `next dev --turbopack` (HMR puede interferir con el cacheo). Verificar así:

Run: `pnpm build && pnpm start`

Con el navegador en `http://localhost:3000`:
1. Abrir DevTools → pestaña **Application** → **Service Workers**: confirmar que aparece registrado y en estado "activated and is running".
2. Pestaña **Network** → activar el checkbox **Offline** (o seleccionar "Offline" en el desplegable de throttling).
3. Recargar la página (F5): la app debe seguir cargando (shell servido desde el caché del Service Worker), en vez de mostrar el error "sin conexión" del navegador.
4. Desactivar el modo Offline de las DevTools, recargar de nuevo: confirmar que vuelve a funcionar con normalidad.
5. Abrir la pestaña **Application** → **Storage** → **IndexedDB**: confirmar que aparece la base `criollitas-offline` con las 4 tablas vacías (`colaSync`, `catalogoCache`, `identidadLocal`, `informesCache`) — prueba de que el esquema de la Task 1 se aplicó correctamente en el navegador real.

- [ ] **Step 7: Commit**

```bash
git add components/offline/MonitorConectividad.tsx components/offline/RegistradorServiceWorker.tsx public/sw.js app/layout.tsx
git commit -m "feat: service worker minimo y monitor de conectividad"
```

---

## Self-Review

- **Cobertura del spec**: esquema de las 4 tablas (Task 1) ✓, funciones básicas de lectura/escritura por tabla (Task 2) ✓, detector de conectividad combinando `navigator.onLine` + ping, expuesto para componentes React vía store (Task 3) ✓, Service Worker mínimo hecho a mano + registro desde el cliente (Task 4) ✓. Explícitamente fuera de alcance de este bloque (según el spec): contenido real de la cola, refresco real del catálogo, cacheo real de identidad al iniciar sesión, verificación de PIN offline, sincronización, vista de informes, indicador visual — todo eso queda para J2-J5, no hay tasks aquí que lo toquen por error.
- **Placeholders**: ninguno — cada step trae el código completo.
- **Consistencia de tipos**: `OperacionCola`, `EntradaCatalogo`, `IdentidadLocal`, `InformeCache` se definen una sola vez en Task 1 y se importan sin redeclarar en Tasks 2-4. `EstadoConectividad`/`ResultadoPing` se definen en Task 3 y los reutilizan `conectividadStore.ts`, `ping.ts` y `MonitorConectividad.tsx` (Task 4) con los mismos nombres.
