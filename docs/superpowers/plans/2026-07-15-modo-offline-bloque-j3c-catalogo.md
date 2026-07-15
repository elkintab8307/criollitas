# Bloque J3c — Catálogo local: Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mantener actualizada la copia local del menú y las mesas (`catalogoCache`, Bloque J1) mientras hay internet, para que los bloques futuros (J3d crear pedido offline, J3e ver/editar pedido offline, J3f cobrar pedido offline) tengan datos reales para operar sin conexión.

**Architecture:** Una función de orquestación trae categorías/productos/modificadores/mesas de Supabase y las guarda en `catalogoCache` (ya existe desde J1). Un componente cliente montado en el layout raíz dispara ese refresco al cargar la app (si ya hay internet) y cada vez que se detecta que la conexión volvió después de estar offline — sin ninguna frecuencia fija adicional, para no golpear Supabase en cada ciclo del detector de conectividad.

**Tech Stack:** TypeScript estricto, Supabase JS (cliente de navegador), Dexie (Bloque J1).

## Global Constraints

- TypeScript estricto, sin `any`.
- Nombres de dominio en español.
- Alias de import `@/` para la raíz.
- Este bloque NO convierte ninguna pantalla a modo offline — es solo la infraestructura de caché que los bloques futuros van a leer.
- Componentes de orquestación (efectos de navegador/Supabase) no llevan test unitario dedicado (patrón ya establecido en J1/J2/J3a/J3b).
- `pnpm lint && pnpm test && pnpm build` deben quedar verdes antes de dar cualquier task por terminada.

---

### Task 1: Función de refresco del catálogo

**Files:**
- Create: `lib/offline/catalogoRefresh.ts`

**Interfaces:**
- Consumes: `guardarEnCatalogo` de `@/lib/offline/catalogo` (Bloque J1, ya existe); `createClient` de `@/lib/supabase/client` (ya existe).
- Produces:
  ```typescript
  export function refrescarCatalogo(): Promise<void>;
  ```
  Task 2 consume esto con esta firma exacta.

- [ ] **Step 1: Crear `lib/offline/catalogoRefresh.ts`**

```typescript
import { createClient } from "@/lib/supabase/client";
import { guardarEnCatalogo } from "@/lib/offline/catalogo";

/** Refresca la copia local del catálogo (menú y mesas) que los bloques
 *  offline de pedidos usarán para operar sin conexión. Se llama solo
 *  mientras hay internet -- ver components/offline/ActualizadorCatalogo.tsx
 *  para cuándo se dispara. Sin test unitario dedicado (llamadas reales a
 *  Supabase desde el navegador). */
export async function refrescarCatalogo(): Promise<void> {
  const supabase = createClient();

  const [{ data: categorias }, { data: productos }, { data: modificadores }, { data: mesas }] =
    await Promise.all([
      supabase
        .from("categorias")
        .select("id, nombre, orden, activa")
        .eq("activa", true)
        .order("orden", { ascending: true }),
      supabase
        .from("productos")
        .select("id, nombre, descripcion, precio_cop, imagen_url, activo, categoria_id, tiempo_prep_min")
        .eq("activo", true),
      supabase
        .from("modificadores")
        .select("id, producto_id, grupo, nombre, precio_delta_cop, obligatorio, max_seleccion, activo")
        .eq("activo", true),
      supabase
        .from("mesas")
        .select("id, numero, nombre, capacidad, estado, activa")
        .eq("activa", true)
        .order("numero", { ascending: true }),
    ]);

  await guardarEnCatalogo("categorias", categorias ?? []);
  await guardarEnCatalogo("productos", productos ?? []);
  await guardarEnCatalogo("modificadores", modificadores ?? []);
  await guardarEnCatalogo("mesas", mesas ?? []);
}
```

- [ ] **Step 2: Verificar tipos, lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores (el módulo aún no se usa en ninguna parte de la app).

- [ ] **Step 3: Commit**

```bash
git add lib/offline/catalogoRefresh.ts
git commit -m "feat: funcion de refresco del catalogo local"
```

---

### Task 2: Disparar el refresco y montarlo en el layout

**Files:**
- Create: `components/offline/ActualizadorCatalogo.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `refrescarCatalogo` de `@/lib/offline/catalogoRefresh` (Task 1); `useConectividadStore` de `@/lib/offline/conectividadStore` (Bloque J1).
- Produces: nada nuevo — es la pieza final de este bloque.

- [ ] **Step 1: Crear `components/offline/ActualizadorCatalogo.tsx`**

```typescript
"use client";

import { useEffect, useRef } from "react";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { refrescarCatalogo } from "@/lib/offline/catalogoRefresh";

/** Mantiene actualizada la copia local del catálogo (Bloque J3c) mientras
 *  hay internet: la refresca al montar si ya hay conexión, y cada vez que
 *  se detecta que volvió después de estar offline. No se ejecuta con
 *  ninguna frecuencia fija adicional -- evita golpear Supabase a cada
 *  ciclo de ping del detector de conectividad (Bloque J1). Sin test
 *  unitario (efectos de navegador). */
export function ActualizadorCatalogo() {
  const estado = useConectividadStore((s) => s.estado);
  const estadoAnteriorRef = useRef(estado);
  const yaRefrescoAlMontar = useRef(false);

  useEffect(() => {
    const volvioOnline = estadoAnteriorRef.current === "offline" && estado === "online";
    estadoAnteriorRef.current = estado;

    if (estado === "online" && (volvioOnline || !yaRefrescoAlMontar.current)) {
      yaRefrescoAlMontar.current = true;
      refrescarCatalogo();
    }
  }, [estado]);

  return null;
}
```

- [ ] **Step 2: Montar en `app/layout.tsx`**

Revisa el archivo real antes de editar para conocer el orden exacto de los imports/componentes ya existentes (Bloques J1/J2/J3a/J3b montan `MonitorConectividad`, `RegistradorServiceWorker`, `GuardiaOffline`, `ManejadorReconexion`, `RegistradorManejadoresTurno`). Agrega el import nuevo junto a los demás de `@/components/offline/*`, y el componente `<ActualizadorCatalogo />` al mismo nivel dentro de `<body>`, antes de `{children}`, sin reordenar los que ya están.

- [ ] **Step 3: Verificar tipos, lint, tests y build**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: todo verde.

- [ ] **Step 4: Verificación manual**

Con `pnpm dev` y conexión a internet real: abre DevTools → Application → IndexedDB → `criollitas-offline` → `catalogoCache`. Confirma que aparecen 4 filas (`categorias`, `productos`, `modificadores`, `mesas`) con datos reales (no vacíos, si el menú de la sede ya tiene productos cargados).

**Nota**: como en los bloques anteriores de esta serie, esta verificación puede no ser posible en el entorno de quien ejecute este plan (sin navegador disponible) — repórtalo como pendiente si aplica, no lo simules.

- [ ] **Step 5: Commit**

```bash
git add components/offline/ActualizadorCatalogo.tsx app/layout.tsx
git commit -m "feat: actualizador automatico del catalogo local mientras hay internet"
```

---

## Self-Review

- **Cobertura del alcance**: función de refresco de las 4 tablas (Task 1) ✓, disparo automático al cargar y al reconectar (Task 2) ✓. Fuera de alcance explícito (ninguna task lo toca): conversión de pantallas a modo offline, eso es trabajo de J3d/J3e/J3f.
- **Placeholders**: ninguno — cada step trae el código completo.
- **Consistencia de tipos**: `refrescarCatalogo(): Promise<void>` se define una sola vez en Task 1 y lo consume Task 2 sin redeclararlo. Las claves guardadas (`"categorias"`, `"productos"`, `"modificadores"`, `"mesas"`) son las que los bloques futuros deberán usar exactamente igual al leer con `leerDelCatalogo`.
