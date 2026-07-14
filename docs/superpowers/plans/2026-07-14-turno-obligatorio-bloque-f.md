# Bloque F — Dinero base obligatorio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la Cajera no pueda usar ninguna ruta suya (ni siquiera tomar pedidos) hasta declarar el dinero base del día, salvo `/turno/abrir` y `/mi-turno`.

**Architecture:** Cookie `turno_abierto`, mismo patrón exacto que la cookie `pin_validado` ya existente — fijada por `abrirTurno()`, limpiada por `cerrarTurno()`, chequeada en `middleware.ts` justo después del chequeo de `pinValidado` y antes de `resolverAccesoRuta`.

**Tech Stack:** Next.js Server Actions (`cookies()` de `next/headers`), middleware de Next.js.

## Global Constraints

- El bloqueo aplica a TODAS las rutas de cajera (incluidas `/inicio`, `/pedido`, `/mis-pedidos` del Bloque E) — no solo a las rutas específicas de caja.
- Excepciones: `/turno/abrir` y `/mi-turno` nunca redirigen, con o sin turno abierto.
- Cookie con los mismos parámetros exactos que `pin_validado`: `httpOnly: true`, `sameSite: "lax"`, `path: "/"`, `maxAge: 60 * 60 * 12`.
- Sin consultas nuevas a base de datos en el middleware.
- `pnpm lint && pnpm test && pnpm build` deben quedar en verde al final de cada tarea. 157 tests en `main` a la fecha de este plan.
- Windows: `git commit -F <tempfile>` en vez de heredocs. Trailer: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: `abrirTurno`/`cerrarTurno` fijan y limpian la cookie `turno_abierto`

**Files:**
- Modify: `app/(cajera)/turno/actions.ts`

**Interfaces:**
- Produces: cookie `turno_abierto` fijada a `"1"` al abrir turno con éxito, eliminada al cerrar turno con éxito — consumida por el middleware en la Task 2.

- [ ] **Step 1: Agregar el import de `cookies`**

En `app/(cajera)/turno/actions.ts`, agregar junto a los imports existentes:

```typescript
import { cookies } from "next/headers";
```

- [ ] **Step 2: Fijar la cookie en `abrirTurno`, justo antes del `return ok(...)` final**

Reemplazar:

```typescript
  if (!data) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos abrir el turno. Intenta de nuevo." });
  }
  revalidatePath("/mi-turno");
  return ok({ turnoId: data.id });
}
```

por:

```typescript
  if (!data) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos abrir el turno. Intenta de nuevo." });
  }
  const cookieStore = await cookies();
  cookieStore.set("turno_abierto", "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  revalidatePath("/mi-turno");
  return ok({ turnoId: data.id });
}
```

- [ ] **Step 3: Limpiar la cookie en `cerrarTurno`, justo antes del `return ok(null)` final**

Reemplazar:

```typescript
  const { error } = await supabase.rpc("cerrar_turno", {
    p_turno_id: turno.id,
    p_efectivo_declarado_cop: Number(montoDesdePesos(parsed.data.efectivoDeclaradoPesos)),
  });
  if (error) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos cerrar el turno. Intenta de nuevo." });
  }
  revalidatePath("/mi-turno");
  return ok(null);
}
```

por:

```typescript
  const { error } = await supabase.rpc("cerrar_turno", {
    p_turno_id: turno.id,
    p_efectivo_declarado_cop: Number(montoDesdePesos(parsed.data.efectivoDeclaradoPesos)),
  });
  if (error) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos cerrar el turno. Intenta de nuevo." });
  }
  const cookieStore = await cookies();
  cookieStore.delete("turno_abierto");
  revalidatePath("/mi-turno");
  return ok(null);
}
```

- [ ] **Step 4: `pnpm lint && pnpm test && pnpm build`**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: exit 0 en los tres, 157/157 tests.

- [ ] **Step 5: Commit**

```bash
git add "app/(cajera)/turno/actions.ts"
git commit -F- <<'MSG'
feat: abrirTurno y cerrarTurno fijan/limpian la cookie turno_abierto

MSG
```

---

### Task 2: Middleware bloquea a la cajera sin turno abierto

**Files:**
- Modify: `middleware.ts`

**Interfaces:**
- Consumes: cookie `turno_abierto` (Task 1).

- [ ] **Step 1: Agregar el chequeo en `middleware.ts`**

Reemplazar:

```typescript
  const pinValidado = request.cookies.get("pin_validado")?.value === "1";
  // Se valida el claim contra los roles conocidos: un valor corrupto o
  // legado (ej. "gerente") se trata como sesión sin rol, nunca se castea
  // a ciegas (evita llegar a rutaPorRol() con un rol inexistente).
  // Se lee de app_metadata (no user_metadata): solo el service role puede
  // escribirlo, así que el propio usuario no puede autopromoverse.
  const rol = normalizarRol(user.app_metadata?.rol);

  if (!pinValidado && !esPublica) {
    return NextResponse.redirect(new URL("/pin", request.url));
  }
  if (esPublica) return response;

  const decision = resolverAccesoRuta(rol, ruta);
```

por:

```typescript
  const pinValidado = request.cookies.get("pin_validado")?.value === "1";
  // Se valida el claim contra los roles conocidos: un valor corrupto o
  // legado (ej. "gerente") se trata como sesión sin rol, nunca se castea
  // a ciegas (evita llegar a rutaPorRol() con un rol inexistente).
  // Se lee de app_metadata (no user_metadata): solo el service role puede
  // escribirlo, así que el propio usuario no puede autopromoverse.
  const rol = normalizarRol(user.app_metadata?.rol);

  if (!pinValidado && !esPublica) {
    return NextResponse.redirect(new URL("/pin", request.url));
  }
  if (esPublica) return response;

  // Bloque F: la cajera debe declarar el dinero base (abrir turno) antes de
  // usar cualquier otra ruta suya -- incluidas /inicio, /pedido, /mis-pedidos
  // del Bloque E. turno_abierto es una cookie (mismo patrón que
  // pin_validado), no una consulta a base de datos en cada request: si se
  // pierde mientras sí hay un turno abierto real, /turno/abrir ya se
  // auto-redirige a /mi-turno al detectarlo, y las Server Actions de caja
  // validan un turno abierto real en cada llamada de todas formas.
  const turnoAbierto = request.cookies.get("turno_abierto")?.value === "1";
  const rutaExentaDeTurno = ruta === "/turno/abrir" || ruta === "/mi-turno" || ruta.startsWith("/mi-turno/");
  if (rol === "cajera" && !turnoAbierto && !rutaExentaDeTurno) {
    return NextResponse.redirect(new URL("/turno/abrir", request.url));
  }

  const decision = resolverAccesoRuta(rol, ruta);
```

- [ ] **Step 2: `pnpm lint && pnpm test && pnpm build`**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: exit 0 en los tres, 157/157 tests.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -F- <<'MSG'
feat: bloquea a la cajera sin turno abierto en todas sus rutas

MSG
```

---

### Task 3: Verificación en vivo end-to-end

**Files:** Ninguno (verificación manual con navegador/curl contra el proyecto Supabase cloud).

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Correr la suite completa**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: todo verde.

- [ ] **Step 2: Crear una cajera de prueba temporal**

Mismo mecanismo ya usado en bloques anteriores (usuario en `auth.users` + fila en `public.usuarios` + sesión vía `generate_link`/`verify`).

- [ ] **Step 3: Verificación con `pnpm dev` y navegador (el middleware no es probable de verificar solo por API — usa cookies de navegación real)**

Con `pnpm dev` corriendo, iniciar sesión como la cajera de prueba (login + PIN) y, ANTES de abrir turno, intentar navegar a `/pedidos`, `/inicio`, `/pedido/nuevo`, `/mis-pedidos`, `/cobrar/algo` — confirmar que todas redirigen a `/turno/abrir`. Confirmar que `/turno/abrir` y `/mi-turno` sí cargan directamente.

- [ ] **Step 4: Abrir turno y confirmar que el bloqueo se levanta**

Declarar el efectivo inicial en `/turno/abrir` → confirmar redirección a `/mi-turno` → navegar a `/pedidos`, `/inicio`, `/mis-pedidos` → todas deben cargar sin redirigir.

- [ ] **Step 5: Cerrar turno y confirmar que el bloqueo vuelve**

Desde `/mi-turno`, cerrar el turno → navegar de nuevo a `/pedidos` → debe redirigir otra vez a `/turno/abrir`.

- [ ] **Step 6: Limpieza de datos de prueba**

Borrar el turno de prueba y el usuario de prueba (`auth.users` + `public.usuarios`). Confirmar con `select` que no queda ningún residuo.

- [ ] **Step 7: Actualizar CLAUDE.md**

Reconciliar CLAUDE.md §2.4 (Arqueo y cierre de caja) con una nota breve: la Cajera no puede usar ninguna otra ruta hasta declarar el efectivo inicial (cookie `turno_abierto`, bloque F).

- [ ] **Step 8: Commit final de documentación**

```bash
git add CLAUDE.md
git commit -F- <<'MSG'
docs: reconcilia CLAUDE.md con el turno obligatorio del Bloque F

MSG
```

---

## Self-Review

**Cobertura del spec:** cookie fijada/limpiada en las dos Server Actions ya existentes (Task 1), chequeo de middleware con las excepciones correctas (Task 2), verificación en vivo de los 5 escenarios del spec — bloqueo antes de abrir, rutas exentas, bloqueo se levanta al abrir, bloqueo vuelve al cerrar (Task 3).

**Placeholders:** ninguno.

**Consistencia de tipos:** ninguna interfaz nueva — se reutilizan `Result`/`DomainError` ya existentes en `turno/actions.ts` sin cambios de firma; el middleware no introduce tipos nuevos.
