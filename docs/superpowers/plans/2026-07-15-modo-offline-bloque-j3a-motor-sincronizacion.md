# Bloque J3a — Motor de sincronización genérico: Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el motor genérico que reproduce, en orden, la cola de operaciones offline contra Supabase cuando vuelve la conexión — sin saber todavía qué operaciones concretas existen (eso lo registran los sub-bloques futuros: J3b turno, J3c pedidos, J3d cobro).

**Architecture:** Un registro (`Map`) de "manejadores" por tipo de operación, poblado por quien encole operaciones reales; un núcleo puro (`decidirAccionSync`) que decide si una operación quedó sincronizada o fallida, testeado con TDD; y una orquestación delgada (`sincronizarPendientes`) que recorre la cola y aplica esa decisión. Se conecta al `ManejadorReconexion` del Bloque J2, que ya detecta la transición offline→online y restaura la sesión real — justo después de eso es el momento correcto para reproducir la cola.

**Tech Stack:** TypeScript estricto, Dexie (Bloque J1), mismo patrón núcleo-puro/orquestación ya usado en `lib/offline/conectividad.ts` y `lib/offline/pinLocal.ts`.

## Global Constraints

- TypeScript estricto, sin `any`.
- Nombres de dominio en español.
- Alias de import `@/` para la raíz.
- Wrappers delgados sobre Dexie no llevan test unitario dedicado (precedente: `lib/offline/cola.ts`, Bloque J1).
- Este bloque NO encola ninguna operación real ni crea ningún RPC nuevo — es solo el motor. Eso es trabajo de J3b/J3c/J3d.
- `pnpm lint && pnpm test && pnpm build` deben quedar verdes antes de dar cualquier task por terminada.

---

### Task 1: Estado de tres valores en `cola_sync`

**Files:**
- Modify: `lib/offline/db.ts`
- Modify: `lib/offline/cola.ts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces:
  ```typescript
  export interface OperacionCola {
    id?: number;
    tipo: string;
    payload: Record<string, unknown>;
    creadaEn: string;
    estado: "pendiente" | "sincronizada" | "fallida";
    errorMensaje?: string;
  }
  export function encolarOperacion(op: Omit<OperacionCola, "id" | "estado" | "errorMensaje">): Promise<number>;
  export function listarPendientes(): Promise<OperacionCola[]>;
  export function marcarSincronizada(id: number): Promise<void>;
  export function marcarFallida(id: number, mensaje: string): Promise<void>;
  ```
  Task 2 consume `OperacionCola`, `listarPendientes`, `marcarSincronizada`, `marcarFallida` con estas firmas exactas.

- [ ] **Step 1: Cambiar la interfaz `OperacionCola` en `lib/offline/db.ts`**

El bloque es hoy:

```typescript
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
```

Cambiar a:

```typescript
/** Una operación (abrir turno, cobrar, etc.) pendiente de subir a Supabase.
 *  El contenido real de `tipo`/`payload` lo definen los bloques que
 *  encolan operaciones (J3b/J3c/J3d) -- aquí solo vive el esquema de la
 *  tabla. `estado` distingue "todavía no se intentó" de "falló de verdad,
 *  necesita revisión" -- antes era un booleano que no podía representar
 *  esa diferencia. */
export interface OperacionCola {
  id?: number;
  tipo: string;
  payload: Record<string, unknown>;
  creadaEn: string;
  estado: "pendiente" | "sincronizada" | "fallida";
  errorMensaje?: string;
}
```

El esquema Dexie (`this.version(1).stores({...})`, dentro del constructor de `BaseDatosOffline`) **no cambia** — `estado`/`errorMensaje` no están indexados, así que este cambio de forma no requiere una versión nueva del esquema.

- [ ] **Step 2: Reescribir `lib/offline/cola.ts`**

Archivo completo:

```typescript
import { baseDatosOffline, type OperacionCola } from "@/lib/offline/db";

/** Wrappers delgados sobre Dexie -- sin test unitario dedicado, mismo
 *  criterio que lib/reportes/exportar.ts (requieren IndexedDB real). */

export async function encolarOperacion(
  op: Omit<OperacionCola, "id" | "estado" | "errorMensaje">,
): Promise<number> {
  return baseDatosOffline.colaSync.add({ ...op, estado: "pendiente" });
}

export async function listarPendientes(): Promise<OperacionCola[]> {
  const todas = await baseDatosOffline.colaSync.orderBy("creadaEn").toArray();
  return todas.filter((op) => op.estado === "pendiente");
}

export async function marcarSincronizada(id: number): Promise<void> {
  await baseDatosOffline.colaSync.update(id, { estado: "sincronizada" });
}

export async function marcarFallida(id: number, mensaje: string): Promise<void> {
  await baseDatosOffline.colaSync.update(id, { estado: "fallida", errorMensaje: mensaje });
}
```

- [ ] **Step 3: Verificar tipos, lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add lib/offline/db.ts lib/offline/cola.ts
git commit -m "feat: estado de tres valores en la cola offline (pendiente/sincronizada/fallida)"
```

---

### Task 2: Motor de sincronización (núcleo puro con TDD + orquestación)

**Files:**
- Create: `lib/offline/sync.ts`
- Test: `tests/unit/offline-sync.test.ts`

**Interfaces:**
- Consumes: `OperacionCola`, `listarPendientes`, `marcarSincronizada`, `marcarFallida` de `@/lib/offline/cola` (Task 1).
- Produces:
  ```typescript
  export type ResultadoManejador = { ok: true } | { ok: false; mensaje: string };
  export type ManejadorOperacion = (payload: Record<string, unknown>) => Promise<ResultadoManejador>;
  export type AccionSync = { tipo: "sincronizada" } | { tipo: "fallida"; mensaje: string };
  export function decidirAccionSync(
    manejadorExiste: boolean,
    resultado: ResultadoManejador | undefined,
  ): AccionSync;
  export function registrarManejador(tipo: string, manejador: ManejadorOperacion): void;
  export interface ResultadoSincronizacion { sincronizadas: number; fallidas: number }
  export function sincronizarPendientes(): Promise<ResultadoSincronizacion>;
  ```
  Task 3 consume `sincronizarPendientes` con esta firma exacta. Los bloques futuros (J3b/J3c/J3d) consumirán `registrarManejador`/`ManejadorOperacion`.

- [ ] **Step 1: Escribir el test de la lógica pura**

Archivo completo `tests/unit/offline-sync.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { decidirAccionSync } from "@/lib/offline/sync";

describe("decidirAccionSync", () => {
  it("sin manejador registrado -> fallida", () => {
    expect(decidirAccionSync(false, undefined)).toEqual({
      tipo: "fallida",
      mensaje: "No hay un manejador registrado para este tipo de operación.",
    });
  });

  it("manejador exitoso -> sincronizada", () => {
    expect(decidirAccionSync(true, { ok: true })).toEqual({ tipo: "sincronizada" });
  });

  it("manejador fallido -> fallida con el mensaje del manejador", () => {
    expect(decidirAccionSync(true, { ok: false, mensaje: "cupo insuficiente" })).toEqual({
      tipo: "fallida",
      mensaje: "cupo insuficiente",
    });
  });

  it("manejador existe pero sin resultado -> fallida con mensaje genérico", () => {
    expect(decidirAccionSync(true, undefined)).toEqual({
      tipo: "fallida",
      mensaje: "Error desconocido.",
    });
  });
});
```

- [ ] **Step 2: Ejecutar el test y confirmar que falla**

Run: `pnpm test -- offline-sync.test.ts`
Expected: FAIL con "Cannot find module '@/lib/offline/sync'".

- [ ] **Step 3: Implementar `lib/offline/sync.ts`**

```typescript
import { listarPendientes, marcarFallida, marcarSincronizada } from "@/lib/offline/cola";

export type ResultadoManejador = { ok: true } | { ok: false; mensaje: string };
export type ManejadorOperacion = (payload: Record<string, unknown>) => Promise<ResultadoManejador>;

export type AccionSync = { tipo: "sincronizada" } | { tipo: "fallida"; mensaje: string };

/** Núcleo puro: decide qué hacer con una operación después de intentarla
 *  (o de confirmar que no hay manejador registrado para su tipo) -- sin
 *  tocar IndexedDB, para poder testearlo sin dependencias. */
export function decidirAccionSync(
  manejadorExiste: boolean,
  resultado: ResultadoManejador | undefined,
): AccionSync {
  if (!manejadorExiste) {
    return { tipo: "fallida", mensaje: "No hay un manejador registrado para este tipo de operación." };
  }
  if (resultado?.ok) return { tipo: "sincronizada" };
  return { tipo: "fallida", mensaje: resultado?.ok === false ? resultado.mensaje : "Error desconocido." };
}

const manejadores = new Map<string, ManejadorOperacion>();

/** Registra la función que sabe reproducir un tipo de operación contra
 *  Supabase (ej. "abrir_turno" -> llamar al RPC correspondiente). La
 *  registran los bloques que encolan operaciones reales (J3b/J3c/J3d). */
export function registrarManejador(tipo: string, manejador: ManejadorOperacion): void {
  manejadores.set(tipo, manejador);
}

export interface ResultadoSincronizacion {
  sincronizadas: number;
  fallidas: number;
}

/** Orquestación: reproduce toda la cola pendiente, en orden, contra
 *  Supabase. Sin test unitario dedicado (requiere IndexedDB real) -- la
 *  lógica de decisión que importa vive en decidirAccionSync, ya testeada
 *  arriba. */
export async function sincronizarPendientes(): Promise<ResultadoSincronizacion> {
  const pendientes = await listarPendientes();
  let sincronizadas = 0;
  let fallidas = 0;
  for (const op of pendientes) {
    const manejador = manejadores.get(op.tipo);
    const resultado = manejador ? await manejador(op.payload) : undefined;
    const accion = decidirAccionSync(!!manejador, resultado);
    if (accion.tipo === "sincronizada") {
      await marcarSincronizada(op.id!);
      sincronizadas++;
    } else {
      await marcarFallida(op.id!, accion.mensaje);
      fallidas++;
    }
  }
  return { sincronizadas, fallidas };
}
```

- [ ] **Step 4: Ejecutar el test y confirmar que pasa**

Run: `pnpm test -- offline-sync.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Verificar tipos, lint, tests y build**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: todo verde.

- [ ] **Step 6: Commit**

```bash
git add lib/offline/sync.ts tests/unit/offline-sync.test.ts
git commit -m "feat: motor de sincronizacion generico (nucleo puro con TDD)"
```

---

### Task 3: Conectar el motor a la reconexión

**Files:**
- Modify: `components/offline/ManejadorReconexion.tsx`

**Interfaces:**
- Consumes: `sincronizarPendientes` de `@/lib/offline/sync` (Task 2).
- Produces: nada nuevo — es la pieza final de este sub-bloque.

- [ ] **Step 1: Agregar la llamada a `sincronizarPendientes` en `ManejadorReconexion.tsx`**

El archivo completo hoy es:

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

Reemplazar el archivo completo por:

```typescript
"use client";

import { useEffect, useRef } from "react";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { useSesionOfflineStore } from "@/lib/offline/sesionOfflineStore";
import { leerIdentidad } from "@/lib/offline/identidad";
import { createClient } from "@/lib/supabase/client";
import { marcarPinValidado } from "@/app/(auth)/pin/actions";
import { sincronizarPendientes } from "@/lib/offline/sync";

/** Cuando vuelve la conexión tras haber operado offline, intenta
 *  restaurar una sesión real de Supabase con el refresh_token cacheado
 *  (Bloque J1/J2), reproduce la cola de operaciones pendientes (Bloque
 *  J3a) una vez la sesión real está activa, y devuelve el flujo al camino
 *  normal (cookie pin_validado vía middleware.ts). Si el refresh_token ya
 *  venció (caso raro, equipo sin uso prolongado), no hace nada más -- el
 *  usuario reingresa normalmente la próxima vez que el middleware lo
 *  mande a /login o /pin. Sin test unitario (efectos de navegador/
 *  Supabase). */
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
      await sincronizarPendientes();
      useSesionOfflineStore.getState().cerrar();
    })();
  }, [estado]);

  return null;
}
```

- [ ] **Step 2: Verificar tipos, lint, tests y build**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: todo verde.

- [ ] **Step 3: Commit**

```bash
git add components/offline/ManejadorReconexion.tsx
git commit -m "feat: conectar el motor de sincronizacion a la reconexion"
```

---

## Self-Review

- **Cobertura del alcance**: estado de tres valores en `cola_sync` (Task 1) ✓, núcleo puro de decisión con TDD (Task 2) ✓, registro de manejadores y orquestación de reproducción (Task 2) ✓, conexión a la transición offline→online ya existente (Task 3) ✓. Explícitamente fuera de alcance (documentado en el diseño, no en una task): sincronizar si el navegador se cerró durante el corte y se reabre ya conectado; orden de actualización de código vs. cola vacía (Service Worker). Ninguna task las toca por error.
- **Placeholders**: ninguno — cada step trae el código completo.
- **Consistencia de tipos**: `OperacionCola` se redefine una sola vez en Task 1 y la consumen `cola.ts` (Task 1) y `sync.ts` (Task 2, indirectamente vía `listarPendientes`/`marcarSincronizada`/`marcarFallida`) sin redeclararla. `ResultadoManejador`/`ManejadorOperacion`/`AccionSync` se definen una sola vez en Task 2.
