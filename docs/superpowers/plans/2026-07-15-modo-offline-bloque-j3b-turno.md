# Bloque J3b — Turno offline (abrir, cerrar, movimientos de caja): Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la Cajera pueda abrir turno, registrar movimientos de caja y cerrar turno completamente sin internet, en el equipo donde ya inició sesión (con internet o sin ella) — encolando cada acción localmente y reproduciéndola contra Supabase cuando vuelve la conexión (Bloque J3a).

**Architecture:** `abrirTurno`/`registrarMovimiento` de hoy son inserts directos sin cálculo de negocio que proteger, así que el motor offline los reproduce con `supabase.from(...).insert(...)` directo desde el navegador (misma RLS que ya protege al Server Action). `cerrarTurno` ya usa el RPC `cerrar_turno` existente, reproducido igual vía `supabase.rpc(...)`. Un store nuevo (`turnoOfflineStore`) guarda la referencia al turno activo — se llena tanto si se abrió online como offline — para que las acciones subsecuentes (movimiento, cierre) sepan a qué turno pertenecen sin preguntarle al servidor. Una corrección al Bloque J2 hace que un login **online** normal también guarde la identidad local (hoy solo pasaba en login offline), para que el caso más común (Cajera entra con internet, el corte llega a medio turno) funcione.

**Tech Stack:** Next.js 15, TypeScript estricto, Zustand + persist (Bloques J1/J2), Supabase JS (cliente de navegador).

## Global Constraints

- TypeScript estricto, sin `any`.
- Nombres de dominio en español.
- Alias de import `@/` para la raíz.
- Sin RPC nueva en este bloque — `abrir_turno`/`registrar_movimiento` se reproducen con inserts directos; `cerrar_turno` reutiliza el RPC ya existente.
- Alcance acotado: solo los 3 formularios (abrir/movimiento/cerrar) funcionan offline. Las 4 páginas de turno (`/turno/abrir`, `/mi-turno`, `/turno/movimientos`, `/turno/cerrar`) siguen siendo Server Components sin capacidad de refrescar datos sin conexión — fuera de alcance de este bloque, limitación aceptada.
- Componentes de orquestación (efectos de navegador/Supabase) no llevan test unitario dedicado (patrón ya establecido en J1/J2/J3a).
- `pnpm lint && pnpm test && pnpm build` deben quedar verdes antes de dar cualquier task por terminada.

---

### Task 1: Corrección de identidad local en login online + limpieza al cambiar de usuario

**Files:**
- Modify: `components/auth/PinPad.tsx`
- Modify: `components/auth/BotonCerrarSesion.tsx`

**Interfaces:**
- Consumes: `useSesionOfflineStore` (ya existe, Bloque J2); `useTurnoOfflineStore` (Task 2 de este bloque — este archivo se completa DESPUÉS de que exista Task 2, o usa el import ya sabiendo su forma exacta: `{ cerrar: () => void }`, ver Task 2).
- Produces: nada nuevo — corrige comportamiento ya existente.

**Nota de orden**: esta task importa `useTurnoOfflineStore` desde `@/lib/offline/turnoOfflineStore`, que Task 2 crea. Si ejecutas las tasks en orden (1, 2, 3...), haz Task 2 antes de que el build de Task 1 necesite compilar limpio — o simplemente haz Task 2 primero si prefieres; el orden entre Task 1 y Task 2 no tiene dependencia real de código, solo de que ambos archivos existan antes del build final. Si prefieres, ejecuta Task 2 antes que Task 1.

- [ ] **Step 1: Agregar el guardado de identidad local al login online exitoso en `PinPad.tsx`**

El bloque de éxito ONLINE (dentro de `if (respuesta.status === 200)`, después del `try`) es hoy:

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
            useSesionOfflineStore.getState().iniciar({
              usuarioId,
              nombre: usuarioSeleccionado.nombre,
              rol: rolUsuario,
              sedeId: datos.sede_id,
            });
          }
          router.push(rutaPorRol(rolUsuario));
        } catch {
```

(`useSesionOfflineStore` ya está importado en este archivo — se usa en la rama offline existente. No hace falta agregar el import.)

- [ ] **Step 2: Convertir `BotonCerrarSesion.tsx` a componente cliente que limpia las identidades locales**

El archivo completo hoy es:

```typescript
import { cerrarSesion } from "@/app/(auth)/pin/actions";
import { ClayButton } from "@/components/ui/ClayButton";

/** Form con Server Action -- funciona sin JS del lado del cliente. Vive en
 *  el header de cada layout por rol para que cualquiera pueda ceder el
 *  dispositivo a otro miembro del staff sin cerrar sesión completa desde
 *  otro lado. */
export function BotonCerrarSesion() {
  return (
    <form action={cerrarSesion}>
      <ClayButton type="submit" variant="ghost" size="sm">
        Cambiar de usuario
      </ClayButton>
    </form>
  );
}
```

Reemplazar el archivo completo por:

```typescript
"use client";

import { useTransition } from "react";
import { cerrarSesion } from "@/app/(auth)/pin/actions";
import { useSesionOfflineStore } from "@/lib/offline/sesionOfflineStore";
import { useTurnoOfflineStore } from "@/lib/offline/turnoOfflineStore";
import { ClayButton } from "@/components/ui/ClayButton";

/** Limpia las identidades locales del equipo antes de cerrar sesión, para
 *  que la siguiente persona que use este dispositivo compartido no
 *  herede la identidad offline ni el turno local de quien cerró sesión. */
export function BotonCerrarSesion() {
  const [isPending, startTransition] = useTransition();

  return (
    <ClayButton
      type="button"
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={() => {
        useSesionOfflineStore.getState().cerrar();
        useTurnoOfflineStore.getState().cerrar();
        startTransition(() => {
          cerrarSesion();
        });
      }}
    >
      Cambiar de usuario
    </ClayButton>
  );
}
```

- [ ] **Step 3: Verificar tipos, lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores. Si `lib/offline/turnoOfflineStore.ts` todavía no existe (Task 2 no se ha hecho), este build fallará por el import faltante — en ese caso, haz Task 2 primero y vuelve a este Step 3.

- [ ] **Step 4: Commit**

```bash
git add components/auth/PinPad.tsx components/auth/BotonCerrarSesion.tsx
git commit -m "fix: guardar identidad local tambien en login online y limpiarla al cambiar de usuario"
```

---

### Task 2: Store de turno offline

**Files:**
- Create: `lib/offline/turnoOfflineStore.ts`

**Interfaces:**
- Consumes: `zustand`, `zustand/middleware` (ya son dependencias del proyecto).
- Produces:
  ```typescript
  export interface TurnoOffline { turnoId: string }
  export const useTurnoOfflineStore: {
    getState(): { turno: TurnoOffline | null; abrir: (t: TurnoOffline) => void; cerrar: () => void };
  };
  ```
  Task 1 (`BotonCerrarSesion.tsx`) y Tasks 4-6 (los 3 formularios) consumen esto con esta firma exacta.

- [ ] **Step 1: Crear `lib/offline/turnoOfflineStore.ts`**

```typescript
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface TurnoOffline {
  turnoId: string;
}

interface TurnoOfflineState {
  turno: TurnoOffline | null;
  abrir: (turno: TurnoOffline) => void;
  cerrar: () => void;
}

/** Referencia local al turno actualmente abierto (offline u online -- se
 *  llena en ambos casos), para que las acciones offline (registrar un
 *  movimiento, cerrar turno) sepan a qué turno pertenecen sin necesitar
 *  una consulta al servidor. Persistida en localStorage para sobrevivir
 *  una recarga de página sin conexión -- sin test unitario dedicado
 *  (localStorage no existe en el entorno Node de vitest), mismo criterio
 *  que useSesionOfflineStore (Bloque J2). */
export const useTurnoOfflineStore = create<TurnoOfflineState>()(
  persist(
    (set) => ({
      turno: null,
      abrir: (turno) => set({ turno }),
      cerrar: () => set({ turno: null }),
    }),
    { name: "criollitas-turno-offline" },
  ),
);
```

- [ ] **Step 2: Verificar tipos, lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add lib/offline/turnoOfflineStore.ts
git commit -m "feat: store local del turno activo (offline u online)"
```

---

### Task 3: Manejadores de sincronización para turno

**Files:**
- Create: `components/offline/RegistradorManejadoresTurno.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `registrarManejador` de `@/lib/offline/sync` (Bloque J3a); `createClient` de `@/lib/supabase/client` (ya existe).
- Produces: registra en el motor de sincronización cómo reproducir `"abrir_turno"`, `"registrar_movimiento"`, `"cerrar_turno"` — Tasks 4-6 encolan operaciones con esos mismos nombres de `tipo` exactos.

- [ ] **Step 1: Crear `components/offline/RegistradorManejadoresTurno.tsx`**

```typescript
"use client";

import { useEffect } from "react";
import { registrarManejador } from "@/lib/offline/sync";
import { createClient } from "@/lib/supabase/client";

/** Registra en el motor de sincronización (Bloque J3a) cómo reproducir
 *  contra Supabase cada operación de turno encolada offline. Llama
 *  directo a Supabase desde el navegador (mismas políticas RLS que ya
 *  protegen al Server Action equivalente cuando hay conexión -- RLS no
 *  distingue el origen de la petición). Sin test unitario (efectos de
 *  navegador/Supabase). */
export function RegistradorManejadoresTurno() {
  useEffect(() => {
    registrarManejador("abrir_turno", async (payload) => {
      const supabase = createClient();
      const { error } = await supabase.from("turnos_caja").insert({
        id: payload.turnoId as string,
        sede_id: payload.sedeId as string,
        cajera_id: payload.cajeraId as string,
        efectivo_inicial_cop: payload.efectivoInicialCop as number,
      });
      if (error) {
        return {
          ok: false,
          mensaje: error.code === "23505" ? "Ya tienes un turno abierto." : error.message,
        };
      }
      return { ok: true };
    });

    registrarManejador("registrar_movimiento", async (payload) => {
      const supabase = createClient();
      const { error } = await supabase.from("movimientos_caja").insert({
        turno_id: payload.turnoId as string,
        tipo: payload.tipo as string,
        concepto: payload.concepto as string,
        monto_cop: payload.montoCop as number,
      });
      if (error) return { ok: false, mensaje: error.message };
      return { ok: true };
    });

    registrarManejador("cerrar_turno", async (payload) => {
      const supabase = createClient();
      const { error } = await supabase.rpc("cerrar_turno", {
        p_turno_id: payload.turnoId as string,
        p_efectivo_declarado_cop: payload.efectivoDeclaradoCop as number,
      });
      if (error) return { ok: false, mensaje: error.message };
      return { ok: true };
    });
  }, []);

  return null;
}
```

- [ ] **Step 2: Montar en `app/layout.tsx`**

El archivo hoy (tras los Bloques J1/J2) monta `MonitorConectividad`, `RegistradorServiceWorker`, `GuardiaOffline`, `ManejadorReconexion` dentro de `<body>`, antes de `{children}`. Agregar el import y el componente nuevo al mismo nivel:

```typescript
import { MonitorConectividad } from "@/components/offline/MonitorConectividad";
import { RegistradorServiceWorker } from "@/components/offline/RegistradorServiceWorker";
import { GuardiaOffline } from "@/components/offline/GuardiaOffline";
import { ManejadorReconexion } from "@/components/offline/ManejadorReconexion";
import { RegistradorManejadoresTurno } from "@/components/offline/RegistradorManejadoresTurno";
```

Y en el JSX:

```typescript
        <MonitorConectividad />
        <RegistradorServiceWorker />
        <GuardiaOffline />
        <ManejadorReconexion />
        <RegistradorManejadoresTurno />
        {children}
```

(Revisa el archivo real antes de editar — confirma el orden exacto de los imports/componentes ya existentes y agrega los nuevos sin reordenar los que ya están.)

- [ ] **Step 3: Verificar tipos, lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add components/offline/RegistradorManejadoresTurno.tsx app/layout.tsx
git commit -m "feat: manejadores de sincronizacion para abrir/cerrar turno y movimientos"
```

---

### Task 4: `FormularioAbrirTurno.tsx` offline

**Files:**
- Modify: `components/caja/FormularioAbrirTurno.tsx`

**Interfaces:**
- Consumes: `montoDesdePesos` de `@/lib/money`; `useConectividadStore` de `@/lib/offline/conectividadStore` (J1); `useSesionOfflineStore` de `@/lib/offline/sesionOfflineStore` (J2); `useTurnoOfflineStore` de `@/lib/offline/turnoOfflineStore` (Task 2); `encolarOperacion` de `@/lib/offline/cola` (J1/J3a).
- Produces: nada nuevo.

- [ ] **Step 1: Reemplazar el archivo completo**

El archivo hoy es:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayInput } from "@/components/ui/ClayInput";
import { efectivoInicialSchema, type EfectivoInicialInput } from "@/lib/validations/turno";
import { abrirTurno } from "@/app/(cajera)/turno/actions";

export function FormularioAbrirTurno() {
  const router = useRouter();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EfectivoInicialInput>({ resolver: zodResolver(efectivoInicialSchema) });

  const onSubmit = handleSubmit(async (datos) => {
    setErrorGeneral(null);
    const resultado = await abrirTurno(datos);
    if (!resultado.ok) {
      setErrorGeneral(resultado.error.mensaje);
      return;
    }
    router.push("/mi-turno");
  });

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-4" noValidate>
      <ClayInput
        label="Efectivo inicial (pesos)"
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        error={errors.efectivoInicialPesos?.message}
        {...register("efectivoInicialPesos", { valueAsNumber: true })}
      />
      {errorGeneral ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {errorGeneral}
        </p>
      ) : null}
      <ClayButton type="submit" variant="primary" size="lg" disabled={isSubmitting}>
        {isSubmitting ? "Abriendo…" : "Abrir turno"}
      </ClayButton>
    </form>
  );
}
```

Reemplazar por:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayInput } from "@/components/ui/ClayInput";
import { efectivoInicialSchema, type EfectivoInicialInput } from "@/lib/validations/turno";
import { abrirTurno } from "@/app/(cajera)/turno/actions";
import { montoDesdePesos } from "@/lib/money";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { useSesionOfflineStore } from "@/lib/offline/sesionOfflineStore";
import { useTurnoOfflineStore } from "@/lib/offline/turnoOfflineStore";
import { encolarOperacion } from "@/lib/offline/cola";

export function FormularioAbrirTurno() {
  const router = useRouter();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EfectivoInicialInput>({ resolver: zodResolver(efectivoInicialSchema) });

  const onSubmit = handleSubmit(async (datos) => {
    setErrorGeneral(null);

    if (useConectividadStore.getState().estado === "offline") {
      if (useTurnoOfflineStore.getState().turno) {
        setErrorGeneral("Ya tienes un turno abierto.");
        return;
      }
      const sesion = useSesionOfflineStore.getState().sesion;
      if (!sesion) {
        setErrorGeneral(
          "No hay una identidad guardada en este equipo. Conéctate a internet una vez para poder trabajar sin conexión.",
        );
        return;
      }
      const turnoId = crypto.randomUUID();
      await encolarOperacion({
        tipo: "abrir_turno",
        payload: {
          turnoId,
          sedeId: sesion.sedeId,
          cajeraId: sesion.usuarioId,
          efectivoInicialCop: Number(montoDesdePesos(datos.efectivoInicialPesos)),
        },
        creadaEn: new Date().toISOString(),
      });
      useTurnoOfflineStore.getState().abrir({ turnoId });
      router.push("/mi-turno");
      return;
    }

    const resultado = await abrirTurno(datos);
    if (!resultado.ok) {
      setErrorGeneral(resultado.error.mensaje);
      return;
    }
    useTurnoOfflineStore.getState().abrir({ turnoId: resultado.valor.turnoId });
    router.push("/mi-turno");
  });

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-4" noValidate>
      <ClayInput
        label="Efectivo inicial (pesos)"
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        error={errors.efectivoInicialPesos?.message}
        {...register("efectivoInicialPesos", { valueAsNumber: true })}
      />
      {errorGeneral ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {errorGeneral}
        </p>
      ) : null}
      <ClayButton type="submit" variant="primary" size="lg" disabled={isSubmitting}>
        {isSubmitting ? "Abriendo…" : "Abrir turno"}
      </ClayButton>
    </form>
  );
}
```

- [ ] **Step 2: Verificar tipos, lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/caja/FormularioAbrirTurno.tsx
git commit -m "feat: abrir turno offline"
```

---

### Task 5: `FormularioMovimiento.tsx` offline

**Files:**
- Modify: `components/caja/FormularioMovimiento.tsx`

**Interfaces:**
- Consumes: mismos módulos que Task 4 (`montoDesdePesos`, `useConectividadStore`, `useTurnoOfflineStore`, `encolarOperacion`) — NO necesita `useSesionOfflineStore` (el `turnoId` ya viene de `useTurnoOfflineStore`, no hace falta la identidad completa aquí).
- Produces: nada nuevo.

- [ ] **Step 1: Agregar los imports nuevos**

Después de la línea `import { registrarMovimiento } from "@/app/(cajera)/turno/actions";`, agregar:

```typescript
import { montoDesdePesos } from "@/lib/money";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { useTurnoOfflineStore } from "@/lib/offline/turnoOfflineStore";
import { encolarOperacion } from "@/lib/offline/cola";
```

- [ ] **Step 2: Reemplazar la función `onSubmit`**

Hoy es:

```typescript
  const onSubmit = handleSubmit(async (datos) => {
    setErrorGeneral(null);
    const resultado = await registrarMovimiento(datos);
    if (!resultado.ok) {
      setErrorGeneral(resultado.error.mensaje);
      return;
    }
    reset();
    router.refresh();
  });
```

Cambiar a:

```typescript
  const onSubmit = handleSubmit(async (datos) => {
    setErrorGeneral(null);

    if (useConectividadStore.getState().estado === "offline") {
      const turno = useTurnoOfflineStore.getState().turno;
      if (!turno) {
        setErrorGeneral("No tienes un turno abierto.");
        return;
      }
      await encolarOperacion({
        tipo: "registrar_movimiento",
        payload: {
          turnoId: turno.turnoId,
          tipo: datos.tipo,
          concepto: datos.concepto,
          montoCop: Number(montoDesdePesos(datos.montoPesos)),
        },
        creadaEn: new Date().toISOString(),
      });
      reset();
      return;
    }

    const resultado = await registrarMovimiento(datos);
    if (!resultado.ok) {
      setErrorGeneral(resultado.error.mensaje);
      return;
    }
    reset();
    router.refresh();
  });
```

- [ ] **Step 3: Verificar tipos, lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add components/caja/FormularioMovimiento.tsx
git commit -m "feat: registrar movimiento de caja offline"
```

---

### Task 6: `FormularioCerrarTurno.tsx` offline

**Files:**
- Modify: `components/caja/FormularioCerrarTurno.tsx`

**Interfaces:**
- Consumes: mismos módulos que Task 5.
- Produces: nada nuevo — es la pieza final de este bloque.

- [ ] **Step 1: Ajustar el import de `@/lib/money`**

Hoy: `import { formatearCOP, type MontoCOP } from "@/lib/money";`

Cambiar a: `import { formatearCOP, montoDesdePesos, type MontoCOP } from "@/lib/money";`

- [ ] **Step 2: Agregar los imports nuevos**

Después de la línea `import { cerrarTurno } from "@/app/(cajera)/turno/actions";`, agregar:

```typescript
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { useTurnoOfflineStore } from "@/lib/offline/turnoOfflineStore";
import { encolarOperacion } from "@/lib/offline/cola";
```

- [ ] **Step 3: Reemplazar la función `onSubmit`**

Hoy es:

```typescript
  const onSubmit = handleSubmit(async (datos) => {
    setErrorGeneral(null);
    const resultado = await cerrarTurno(datos);
    if (!resultado.ok) {
      setErrorGeneral(resultado.error.mensaje);
      return;
    }
    router.push("/turno/abrir");
  });
```

Cambiar a:

```typescript
  const onSubmit = handleSubmit(async (datos) => {
    setErrorGeneral(null);

    if (useConectividadStore.getState().estado === "offline") {
      const turno = useTurnoOfflineStore.getState().turno;
      if (!turno) {
        setErrorGeneral("No tienes un turno abierto en este equipo.");
        return;
      }
      await encolarOperacion({
        tipo: "cerrar_turno",
        payload: {
          turnoId: turno.turnoId,
          efectivoDeclaradoCop: Number(montoDesdePesos(datos.efectivoDeclaradoPesos)),
        },
        creadaEn: new Date().toISOString(),
      });
      useTurnoOfflineStore.getState().cerrar();
      router.push("/turno/abrir");
      return;
    }

    const resultado = await cerrarTurno(datos);
    if (!resultado.ok) {
      setErrorGeneral(resultado.error.mensaje);
      return;
    }
    useTurnoOfflineStore.getState().cerrar();
    router.push("/turno/abrir");
  });
```

- [ ] **Step 4: Verificar tipos, lint, tests y build**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: todo verde (este es el último paso de código del bloque — corre la suite completa, no solo lint/build).

- [ ] **Step 5: Verificación manual**

Con `pnpm dev`, alternando el modo "Offline" de las DevTools (Network → Offline):

1. Con internet, inicia sesión como Cajera y abre turno normalmente. Confirma en DevTools → Application → Local Storage que aparece `criollitas-turno-offline` con el `turnoId` real.
2. Activa el modo Offline. Ve a Movimientos, registra un retiro. Confirma que no da error y que el formulario se limpia.
3. Ve a Cerrar turno, declara el efectivo contado, confirma. Confirma que navega a `/turno/abrir` sin error y que `criollitas-turno-offline` volvió a `null`.
4. Desactiva el modo Offline. Espera unos segundos (ciclo de reconexión). En el dashboard de Supabase (tabla `movimientos_caja` y el turno recién cerrado en `turnos_caja`), confirma que las operaciones llegaron.

**Nota**: como en los bloques anteriores de esta serie, esta verificación no se pudo hacer en el entorno del subagente que ejecute este plan (sin navegador disponible) — repórtalo como pendiente si aplica, no lo simules.

- [ ] **Step 6: Commit**

```bash
git add components/caja/FormularioCerrarTurno.tsx
git commit -m "feat: cerrar turno offline"
```

---

## Self-Review

- **Cobertura del alcance**: corrección de identidad en login online + limpieza al cambiar de usuario (Task 1) ✓, store de turno local (Task 2) ✓, manejadores de sincronización para las 3 operaciones (Task 3) ✓, los 3 formularios con rama offline (Tasks 4-6) ✓. Fuera de alcance explícito (no tocado por ninguna task): las 4 páginas de turno como Server Components, RPC nueva para abrir turno/movimientos (no hace falta, son inserts directos).
- **Placeholders**: ninguno — cada step trae el código completo.
- **Consistencia de tipos**: `TurnoOffline`/`useTurnoOfflineStore` se define una sola vez en Task 2 y lo consumen Task 1 (`BotonCerrarSesion.tsx`) y Tasks 4-6 sin redeclararlo. Los `tipo` de operación encolados en Tasks 4-6 (`"abrir_turno"`, `"registrar_movimiento"`, `"cerrar_turno"`) coinciden exactamente con los strings que registra Task 3 en `registrarManejador`. Los nombres de campo dentro de cada `payload` (`turnoId`, `sedeId`, `cajeraId`, `efectivoInicialCop`, `tipo`, `concepto`, `montoCop`, `efectivoDeclaradoCop`) coinciden exactamente entre lo que encola cada formulario (Tasks 4-6) y lo que lee cada manejador (Task 3).
