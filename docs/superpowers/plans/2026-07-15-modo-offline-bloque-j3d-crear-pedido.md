# Bloque J3d — Crear pedido offline: Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la Cajera pueda crear un pedido nuevo completo (mesa, domicilio o para llevar, con todos sus productos) sin internet, usando el catálogo local (Bloque J3c) — sentando la base de datos local (`pedidosLocales`) que los bloques siguientes (J3e ver/editar, J3f cobrar) usarán para completar el flujo.

**Architecture:** Un pedido creado offline recibe un identificador generado en el propio equipo (`crypto.randomUUID()`) que se usa tanto en una copia local completa (Dexie, tabla nueva `pedidosLocales`) como en la operación encolada para sincronizar. Como la sincronización corre ya reconectado (dentro de `ManejadorReconexion`, después de restaurar la sesión real), el motor de sincronización llama directamente a la Server Action `crearPedidoConItems` que ya existe — sin duplicar su lógica de recálculo de precios en el servidor — extendida con un parámetro opcional para que Postgres inserte la fila con el mismo id ya usado localmente.

**Tech Stack:** Next.js 15, TypeScript estricto, Dexie (Bloques J1/J3a), Supabase JS.

## Global Constraints

- TypeScript estricto, sin `any`.
- Nombres de dominio en español.
- Alias de import `@/` para la raíz.
- Sin RPC nueva — la sincronización reutiliza la Server Action `crearPedidoConItems` ya existente, extendida con un parámetro opcional retrocompatible.
- Wrappers delgados sobre Dexie/Supabase no llevan test unitario dedicado (patrón ya establecido en J1/J2/J3a/J3b/J3c).
- `calcularTotalesPedido` (`lib/pedido/totales.ts`) ya existe y ya está testeada — no se reimplementa.
- Este bloque NO convierte `/pedido/[pedidoId]` (la pantalla de detalle) — eso es trabajo del Bloque J3e. Navegar ahí después de crear un pedido offline puede verse roto hasta que ese bloque esté listo; es un estado intermedio esperado.
- `pnpm lint && pnpm test && pnpm build` deben quedar verdes antes de dar cualquier task por terminada.

---

### Task 1: Esquema Dexie (versión 3) y CRUD de pedidos locales

**Files:**
- Modify: `lib/offline/db.ts`
- Create: `lib/offline/pedidosLocales.ts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces:
  ```typescript
  export interface ItemPedidoLocal {
    productoId: string;
    nombre: string;
    cantidad: number;
    precioUnitCop: number;
    modificadores: { modificadorId: string; nombre: string; precioDeltaCop: number }[];
    nota: string | null;
  }
  export interface PedidoLocal {
    pedidoId: string;
    origen: { canal: "mesa"; mesaId: string } | { canal: "domicilio"; clienteId: string } | { canal: "llevar" };
    items: ItemPedidoLocal[];
    estado: "abierto" | "cobrado";
    sedeId: string;
    vendedoraId: string;
    creadoEn: string;
  }
  export function crearPedidoLocal(pedido: PedidoLocal): Promise<void>;
  export function leerPedidoLocal(pedidoId: string): Promise<PedidoLocal | undefined>;
  export function agregarItemsPedidoLocal(pedidoId: string, items: ItemPedidoLocal[]): Promise<void>;
  export function marcarPedidoLocalCobrado(pedidoId: string): Promise<void>;
  ```
  Task 5 consume `crearPedidoLocal`/`PedidoLocal`/`ItemPedidoLocal` con estas firmas exactas. `agregarItemsPedidoLocal`/`marcarPedidoLocalCobrado` no se usan todavía en este bloque — quedan listas para los Bloques J3e/J3f.

- [ ] **Step 1: Agregar los tipos e interfaces nuevas a `lib/offline/db.ts`**

Agregar después de la interfaz `IntentoPin` (antes de `class BaseDatosOffline`):

```typescript
/** Un ítem dentro de un pedido guardado localmente -- espejo simplificado
 *  de `pedido_items` (sin `id` propio, se referencian solo por posición
 *  en el arreglo; este proyecto no permite editar/quitar un ítem ya
 *  confirmado ni online ni offline, solo agregar más). */
export interface ItemPedidoLocal {
  productoId: string;
  nombre: string;
  cantidad: number;
  precioUnitCop: number;
  modificadores: { modificadorId: string; nombre: string; precioDeltaCop: number }[];
  nota: string | null;
}

/** Copia local completa de un pedido creado y/o modificado sin conexión
 *  -- no solo la intención de crearlo (eso vive en `colaSync`), sino su
 *  contenido real, para que las pantallas de detalle y cobro (Bloques
 *  J3e/J3f) puedan mostrarlo y seguir operando sobre él sin depender del
 *  servidor. `pedidoId` es el mismo identificador que se usará como `id`
 *  real en Supabase al sincronizar (ver crearPedidoConItems, Task 2). */
export interface PedidoLocal {
  pedidoId: string;
  origen: { canal: "mesa"; mesaId: string } | { canal: "domicilio"; clienteId: string } | { canal: "llevar" };
  items: ItemPedidoLocal[];
  estado: "abierto" | "cobrado";
  sedeId: string;
  vendedoraId: string;
  creadoEn: string;
}
```

- [ ] **Step 2: Agregar la tabla a la clase y la versión 3 del esquema**

`BaseDatosOffline` hoy es:

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

Cambiar a:

```typescript
class BaseDatosOffline extends Dexie {
  colaSync!: Table<OperacionCola, number>;
  catalogoCache!: Table<EntradaCatalogo, string>;
  identidadLocal!: Table<IdentidadLocal, string>;
  informesCache!: Table<InformeCache, string>;
  intentosPin!: Table<IntentoPin, number>;
  pedidosLocales!: Table<PedidoLocal, string>;

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
    this.version(3).stores({
      pedidosLocales: "pedidoId",
    });
  }
}
```

- [ ] **Step 3: Crear `lib/offline/pedidosLocales.ts`**

```typescript
import { baseDatosOffline, type ItemPedidoLocal, type PedidoLocal } from "@/lib/offline/db";

/** Wrappers delgados sobre Dexie -- sin test unitario dedicado, mismo
 *  criterio que lib/offline/cola.ts (requieren IndexedDB real). */

export async function crearPedidoLocal(pedido: PedidoLocal): Promise<void> {
  await baseDatosOffline.pedidosLocales.put(pedido);
}

export async function leerPedidoLocal(pedidoId: string): Promise<PedidoLocal | undefined> {
  return baseDatosOffline.pedidosLocales.get(pedidoId);
}

export async function agregarItemsPedidoLocal(pedidoId: string, items: ItemPedidoLocal[]): Promise<void> {
  const pedido = await baseDatosOffline.pedidosLocales.get(pedidoId);
  if (!pedido) return;
  await baseDatosOffline.pedidosLocales.put({ ...pedido, items: [...pedido.items, ...items] });
}

export async function marcarPedidoLocalCobrado(pedidoId: string): Promise<void> {
  const pedido = await baseDatosOffline.pedidosLocales.get(pedidoId);
  if (!pedido) return;
  await baseDatosOffline.pedidosLocales.put({ ...pedido, estado: "cobrado" });
}
```

- [ ] **Step 4: Verificar tipos, lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add lib/offline/db.ts lib/offline/pedidosLocales.ts
git commit -m "feat: esquema y CRUD de pedidos locales (Dexie v3)"
```

---

### Task 2: `crearPedidoConItems` acepta un id explícito opcional

**Files:**
- Modify: `app/(vendedora)/pedido/actions.ts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `crearPedidoConItems(origen: OrigenPedido, input: EnviarPedidoInput, idExplicito?: string): Promise<Result<{ pedidoId: string }, DomainError>>` — Task 3 (manejador de sincronización) y Task 5 (`CarritoNuevo.tsx`) consumen esta firma extendida.

- [ ] **Step 1: Extender la firma y el insert**

En `app/(vendedora)/pedido/actions.ts`, la declaración de la función es hoy:

```typescript
export async function crearPedidoConItems(
  origen: OrigenPedido,
  input: EnviarPedidoInput,
): Promise<Result<{ pedidoId: string }, DomainError>> {
```

Cambiar a:

```typescript
export async function crearPedidoConItems(
  origen: OrigenPedido,
  input: EnviarPedidoInput,
  idExplicito?: string,
): Promise<Result<{ pedidoId: string }, DomainError>> {
```

Más abajo en la misma función, el `.insert()` es hoy:

```typescript
  const numeroCorto = await calcularSiguienteNumero(supabase, ctx.valor.sedeId);
  const { data: pedido, error: errorPedido } = await supabase
    .from("pedidos")
    .insert({
      sede_id: ctx.valor.sedeId,
      numero_corto: numeroCorto,
      canal: origen.canal,
      mesa_id: origen.canal === "mesa" ? origen.mesaId : null,
      cliente_id: origen.canal === "domicilio" ? origen.clienteId : null,
      vendedora_id: ctx.valor.vendedoraId,
    })
    .select("id")
    .single();
```

Cambiar a:

```typescript
  const numeroCorto = await calcularSiguienteNumero(supabase, ctx.valor.sedeId);
  const { data: pedido, error: errorPedido } = await supabase
    .from("pedidos")
    .insert({
      ...(idExplicito ? { id: idExplicito } : {}),
      sede_id: ctx.valor.sedeId,
      numero_corto: numeroCorto,
      canal: origen.canal,
      mesa_id: origen.canal === "mesa" ? origen.mesaId : null,
      cliente_id: origen.canal === "domicilio" ? origen.clienteId : null,
      vendedora_id: ctx.valor.vendedoraId,
    })
    .select("id")
    .single();
```

Nada más en el archivo cambia — el resto de la función (validaciones de mesa/domicilio, la llamada a `confirmarItemsPedido`, `limpiarPedidoVacio`) queda exactamente igual, y las demás funciones del archivo (`confirmarItemsPedido`, `cancelarPedido`) no se tocan.

- [ ] **Step 2: Verificar tipos, lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores. `CarritoNuevo.tsx` (Task 5) todavía no pasa el tercer argumento — el parámetro opcional no rompe ninguna llamada existente.

- [ ] **Step 3: Commit**

```bash
git add "app/(vendedora)/pedido/actions.ts"
git commit -m "feat: crearPedidoConItems acepta un id explicito opcional"
```

---

### Task 3: Manejador de sincronización para pedidos

**Files:**
- Create: `components/offline/RegistradorManejadoresPedido.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `registrarManejador` de `@/lib/offline/sync` (Bloque J3a); `crearPedidoConItems`/`OrigenPedido` de `@/app/(vendedora)/pedido/actions` (Task 2, firma extendida); `EnviarPedidoInput` de `@/lib/validations/pedido`.
- Produces: registra en el motor de sincronización cómo reproducir `"crear_pedido_con_items"` — Task 5 encola operaciones con ese mismo nombre de `tipo` exacto. Este archivo lo extenderán los Bloques J3e/J3f con más manejadores de pedido (mismo patrón que `RegistradorManejadoresTurno.tsx`, Bloque J3b).

- [ ] **Step 1: Crear `components/offline/RegistradorManejadoresPedido.tsx`**

```typescript
"use client";

import { useEffect } from "react";
import { registrarManejador } from "@/lib/offline/sync";
import { crearPedidoConItems, type OrigenPedido } from "@/app/(vendedora)/pedido/actions";
import type { EnviarPedidoInput } from "@/lib/validations/pedido";

/** Registra en el motor de sincronización (Bloque J3a) cómo reproducir
 *  contra Supabase cada operación de pedido encolada offline. A
 *  diferencia de los manejadores de turno (Bloque J3b), que insertan
 *  directo porque no hay cálculo de negocio que proteger, este llama a
 *  la Server Action real (`crearPedidoConItems`) -- la sincronización
 *  corre ya reconectado, así que la misma lógica de recálculo de
 *  precios en el servidor que protege el camino online aplica igual
 *  aquí, sin duplicarla. Sin test unitario (efectos de navegador/
 *  Server Action). */
export function RegistradorManejadoresPedido() {
  useEffect(() => {
    registrarManejador("crear_pedido_con_items", async (payload) => {
      const resultado = await crearPedidoConItems(
        payload.origen as OrigenPedido,
        { items: payload.items as EnviarPedidoInput["items"] },
        payload.pedidoId as string,
      );
      if (!resultado.ok) return { ok: false, mensaje: resultado.error.mensaje };
      return { ok: true };
    });
  }, []);

  return null;
}
```

- [ ] **Step 2: Montar en `app/layout.tsx`**

Revisa el archivo real antes de editar para conocer el orden exacto de los imports/componentes ya existentes (Bloques J1/J2/J3a/J3b/J3c). Agrega el import nuevo junto a los demás de `@/components/offline/*`, y `<RegistradorManejadoresPedido />` al mismo nivel dentro de `<body>`, antes de `{children}`, sin reordenar los que ya están.

- [ ] **Step 3: Verificar tipos, lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add components/offline/RegistradorManejadoresPedido.tsx app/layout.tsx
git commit -m "feat: manejador de sincronizacion para crear pedido offline"
```

---

### Task 4: Convertir `/pedido/nuevo` a Client Component con respaldo del catálogo local

**Files:**
- Modify: `app/(vendedora)/pedido/nuevo/page.tsx`

**Interfaces:**
- Consumes: `leerDelCatalogo` de `@/lib/offline/catalogo` (Bloque J1, poblado por J3c); `createClient` de `@/lib/supabase/client`; `PedidoNuevoEditor` (ya existe, sin cambios en sus props).
- Produces: nada nuevo para otras tasks — pieza de UI final de este flujo de creación (junto con Task 5).

- [ ] **Step 1: Reemplazar el archivo completo**

El archivo hoy es un Server Component:

```typescript
import { createServerSupabase } from "@/lib/supabase/server";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";
import { PedidoNuevoEditor } from "@/components/pedido/PedidoNuevoEditor";
import type { CategoriaFila, ModificadorFila, ProductoFila } from "@/components/menu/types";
import type { OrigenPedido } from "@/app/(vendedora)/pedido/actions";

interface PageProps {
  searchParams: Promise<{ mesaId?: string; canal?: string; clienteId?: string }>;
}

export default async function PedidoNuevoPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabase();

  let origen: OrigenPedido;
  let tituloOrigen = "Nuevo pedido";

  if (params.mesaId) {
    const { data: mesaFila } = await supabase.from("mesas").select("numero").eq("id", params.mesaId).single();
    origen = { canal: "mesa", mesaId: params.mesaId };
    tituloOrigen = mesaFila ? `Mesa ${mesaFila.numero}` : "Mesa";
  } else if (params.canal === "domicilio" && params.clienteId) {
    const { data: clienteFila } = await supabase
      .from("clientes_domicilio")
      .select("nombre")
      .eq("id", params.clienteId)
      .single();
    origen = { canal: "domicilio", clienteId: params.clienteId };
    tituloOrigen = clienteFila ? clienteFila.nombre : "Domicilio";
  } else {
    origen = { canal: "llevar" };
    tituloOrigen = "Para llevar";
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const sedeId = (user?.app_metadata?.sede_id as string | undefined) ?? SEDE_DEFAULT_ID;
  const { data: sedeFila } = await supabase.from("sedes").select("usa_cocina").eq("id", sedeId).maybeSingle();
  const usaCocina = sedeFila?.usa_cocina !== false;

  const { data: categoriasFilas } = await supabase
    .from("categorias")
    .select("id, nombre, orden, activa")
    .eq("activa", true)
    .order("orden", { ascending: true });
  const { data: productosFilas } = await supabase
    .from("productos")
    .select("id, nombre, descripcion, precio_cop, imagen_url, activo, categoria_id, tiempo_prep_min")
    .eq("activo", true);
  const { data: modificadoresFilas } = await supabase
    .from("modificadores")
    .select("id, producto_id, grupo, nombre, precio_delta_cop, obligatorio, max_seleccion, activo")
    .eq("activo", true);

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Nuevo pedido — {tituloOrigen}</h1>
      <div className="mt-6">
        <PedidoNuevoEditor
          origen={origen}
          categorias={(categoriasFilas ?? []) as CategoriaFila[]}
          productos={(productosFilas ?? []) as ProductoFila[]}
          modificadores={(modificadoresFilas ?? []) as ModificadorFila[]}
          usaCocina={usaCocina}
        />
      </div>
    </main>
  );
}
```

Reemplazar el archivo completo por:

```typescript
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { leerDelCatalogo } from "@/lib/offline/catalogo";
import { PedidoNuevoEditor } from "@/components/pedido/PedidoNuevoEditor";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";
import type { CategoriaFila, ModificadorFila, ProductoFila } from "@/components/menu/types";
import type { OrigenPedido } from "@/app/(vendedora)/pedido/actions";

interface DatosPedidoNuevo {
  origen: OrigenPedido;
  tituloOrigen: string;
  categorias: CategoriaFila[];
  productos: ProductoFila[];
  modificadores: ModificadorFila[];
  usaCocina: boolean;
}

export default function PedidoNuevoPage() {
  const searchParams = useSearchParams();
  const [datos, setDatos] = useState<DatosPedidoNuevo | null>(null);
  const mesaId = searchParams.get("mesaId") ?? undefined;
  const canal = searchParams.get("canal") ?? undefined;
  const clienteId = searchParams.get("clienteId") ?? undefined;

  useEffect(() => {
    let cancelado = false;

    async function cargar() {
      let origen: OrigenPedido;
      let tituloOrigen = "Nuevo pedido";
      if (mesaId) {
        origen = { canal: "mesa", mesaId };
      } else if (canal === "domicilio" && clienteId) {
        origen = { canal: "domicilio", clienteId };
        tituloOrigen = "Domicilio";
      } else {
        origen = { canal: "llevar" };
        tituloOrigen = "Para llevar";
      }

      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const sedeId = (user?.app_metadata?.sede_id as string | undefined) ?? SEDE_DEFAULT_ID;

        const [{ data: categorias }, { data: productos }, { data: modificadores }, { data: sedeFila }] =
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
            supabase.from("sedes").select("usa_cocina").eq("id", sedeId).maybeSingle(),
          ]);
        if (!categorias || !productos || !modificadores) throw new Error("Sin datos del servidor");

        if (mesaId) {
          const { data: mesaFila } = await supabase.from("mesas").select("numero").eq("id", mesaId).single();
          tituloOrigen = mesaFila ? `Mesa ${mesaFila.numero}` : "Mesa";
        } else if (canal === "domicilio" && clienteId) {
          const { data: clienteFila } = await supabase
            .from("clientes_domicilio")
            .select("nombre")
            .eq("id", clienteId)
            .single();
          tituloOrigen = clienteFila ? clienteFila.nombre : "Domicilio";
        }

        if (!cancelado) {
          setDatos({
            origen,
            tituloOrigen,
            categorias: categorias as CategoriaFila[],
            productos: productos as ProductoFila[],
            modificadores: modificadores as ModificadorFila[],
            usaCocina: sedeFila?.usa_cocina !== false,
          });
        }
      } catch {
        // Sin conexión: usar el catálogo cacheado (Bloque J3c). usaCocina
        // se asume false -- es el valor real de la sede de Armenia hoy
        // (CLAUDE.md §2.5) y solo afecta el texto del botón de confirmar,
        // no ninguna regla de negocio real (esa vive en el servidor).
        const [categoriasCache, productosCache, modificadoresCache, mesasCache] = await Promise.all([
          leerDelCatalogo("categorias"),
          leerDelCatalogo("productos"),
          leerDelCatalogo("modificadores"),
          leerDelCatalogo("mesas"),
        ]);
        if (mesaId) {
          const mesas = (mesasCache?.datos as { id: string; numero: number }[] | undefined) ?? [];
          const mesa = mesas.find((m) => m.id === mesaId);
          tituloOrigen = mesa ? `Mesa ${mesa.numero}` : "Mesa";
        }
        if (!cancelado) {
          setDatos({
            origen,
            tituloOrigen,
            categorias: (categoriasCache?.datos as CategoriaFila[] | undefined) ?? [],
            productos: (productosCache?.datos as ProductoFila[] | undefined) ?? [],
            modificadores: (modificadoresCache?.datos as ModificadorFila[] | undefined) ?? [],
            usaCocina: false,
          });
        }
      }
    }
    cargar();
    return () => {
      cancelado = true;
    };
  }, [mesaId, canal, clienteId]);

  if (!datos) return null;

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Nuevo pedido — {datos.tituloOrigen}</h1>
      <div className="mt-6">
        <PedidoNuevoEditor
          origen={datos.origen}
          categorias={datos.categorias}
          productos={datos.productos}
          modificadores={datos.modificadores}
          usaCocina={datos.usaCocina}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verificar tipos, lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores. La ruta `/pedido/nuevo` ahora debe compilar como página cliente (no server-rendered con `searchParams` async).

- [ ] **Step 3: Commit**

```bash
git add "app/(vendedora)/pedido/nuevo/page.tsx"
git commit -m "feat: convertir /pedido/nuevo a client component con respaldo del catalogo local"
```

---

### Task 5: `CarritoNuevo.tsx` offline + verificación manual

**Files:**
- Modify: `components/pedido/CarritoNuevo.tsx`

**Interfaces:**
- Consumes: `montoDesdePesos` de `@/lib/money`; `useConectividadStore` de `@/lib/offline/conectividadStore` (J1); `useSesionOfflineStore` de `@/lib/offline/sesionOfflineStore` (J2); `crearPedidoLocal`/`ItemPedidoLocal` de `@/lib/offline/pedidosLocales`/`@/lib/offline/db` (Task 1); `encolarOperacion` de `@/lib/offline/cola` (J1/J3a).
- Produces: nada nuevo — es la pieza final de este bloque.

- [ ] **Step 1: Agregar los imports nuevos**

Después de la línea `import { crearPedidoConItems, type OrigenPedido } from "@/app/(vendedora)/pedido/actions";`, agregar:

```typescript
import { montoDesdePesos } from "@/lib/money";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { useSesionOfflineStore } from "@/lib/offline/sesionOfflineStore";
import { crearPedidoLocal } from "@/lib/offline/pedidosLocales";
import { encolarOperacion } from "@/lib/offline/cola";
import type { ItemPedidoLocal } from "@/lib/offline/db";
```

- [ ] **Step 2: Reemplazar la función `confirmar`**

Hoy es:

```typescript
  async function confirmar() {
    if (items.length === 0) return;
    setError(null);
    setEnviando(true);
    const resultado = await crearPedidoConItems(origen, {
      items: items.map((item) => ({
        productoId: item.productoId,
        cantidad: item.cantidad,
        modificadorIds: item.modificadores.map((m) => m.modificadorId),
        nota: item.nota || undefined,
      })),
    });
    setEnviando(false);
    if (!resultado.ok) {
      setError(resultado.error.mensaje);
      return;
    }
    vaciar();
    router.push(`/pedido/${resultado.valor.pedidoId}`);
  }
```

Cambiar a:

```typescript
  async function confirmar() {
    if (items.length === 0) return;
    setError(null);
    setEnviando(true);

    if (useConectividadStore.getState().estado === "offline") {
      const sesion = useSesionOfflineStore.getState().sesion;
      if (!sesion) {
        setError(
          "No hay una identidad guardada en este equipo. Conéctate a internet una vez para poder trabajar sin conexión.",
        );
        setEnviando(false);
        return;
      }
      const pedidoId = crypto.randomUUID();
      const itemsLocales: ItemPedidoLocal[] = items.map((item) => ({
        productoId: item.productoId,
        nombre: item.nombre,
        cantidad: item.cantidad,
        precioUnitCop: Number(montoDesdePesos(item.precioUnitPesos)),
        modificadores: item.modificadores.map((m) => ({
          modificadorId: m.modificadorId,
          nombre: m.nombre,
          precioDeltaCop: Number(montoDesdePesos(m.precioDeltaPesos)),
        })),
        nota: item.nota || null,
      }));
      await crearPedidoLocal({
        pedidoId,
        origen,
        items: itemsLocales,
        estado: "abierto",
        sedeId: sesion.sedeId,
        vendedoraId: sesion.usuarioId,
        creadoEn: new Date().toISOString(),
      });
      await encolarOperacion({
        tipo: "crear_pedido_con_items",
        payload: {
          pedidoId,
          origen,
          items: items.map((item) => ({
            productoId: item.productoId,
            cantidad: item.cantidad,
            modificadorIds: item.modificadores.map((m) => m.modificadorId),
            nota: item.nota || undefined,
          })),
        },
        creadaEn: new Date().toISOString(),
      });
      setEnviando(false);
      vaciar();
      router.push(`/pedido/${pedidoId}`);
      return;
    }

    const resultado = await crearPedidoConItems(origen, {
      items: items.map((item) => ({
        productoId: item.productoId,
        cantidad: item.cantidad,
        modificadorIds: item.modificadores.map((m) => m.modificadorId),
        nota: item.nota || undefined,
      })),
    });
    setEnviando(false);
    if (!resultado.ok) {
      setError(resultado.error.mensaje);
      return;
    }
    vaciar();
    router.push(`/pedido/${resultado.valor.pedidoId}`);
  }
```

- [ ] **Step 3: Verificar tipos, lint, tests y build**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: todo verde (este es el último paso de código del bloque — corre la suite completa).

- [ ] **Step 4: Verificación manual**

Con `pnpm dev`, alternando el modo "Offline" de las DevTools (Network → Offline):

1. Con internet, entra como Cajera, ve a tomar un pedido nuevo (para llevar, por ejemplo) para que `catalogoCache` tenga datos reales (Bloque J3c ya los refresca automáticamente al cargar la app).
2. Activa el modo Offline. Ve a `/pedido/nuevo?canal=llevar` (o navega normalmente desde la pantalla de inicio de toma de pedidos). Confirma que el menú carga desde el catálogo cacheado, sin error.
3. Agrega uno o dos productos al carrito y confirma el pedido. Confirma en DevTools → Application → IndexedDB → `criollitas-offline` → `pedidosLocales` que aparece una fila con el pedido y sus ítems.
4. Desactiva el modo Offline. Espera unos segundos (ciclo de reconexión). En el dashboard de Supabase, confirma que el pedido llegó a la tabla `pedidos` con el mismo `id` que se ve en la fila de `pedidosLocales`.

**Nota**: como en los bloques anteriores de esta serie, esta verificación no se pudo hacer en el entorno de quien ejecute este plan (sin navegador disponible) — repórtalo como pendiente si aplica, no lo simules. Recuerda también que navegar a `/pedido/{pedidoId}` después del Step 3 puede verse roto (esa pantalla todavía no sabe leer `pedidosLocales`, Bloque J3e) — es esperado, no es un defecto de este bloque.

- [ ] **Step 5: Commit**

```bash
git add components/pedido/CarritoNuevo.tsx
git commit -m "feat: crear pedido offline"
```

---

## Self-Review

- **Cobertura del alcance**: esquema y CRUD de pedidos locales (Task 1) ✓, `crearPedidoConItems` con id explícito (Task 2) ✓, manejador de sincronización (Task 3) ✓, conversión de `/pedido/nuevo` con respaldo del catálogo (Task 4) ✓, `CarritoNuevo.tsx` offline (Task 5) ✓. Fuera de alcance explícito (ninguna task lo toca): conversión de `/pedido/[pedidoId]` (Bloque J3e), agregar más productos a un pedido ya creado (Bloque J3e), cobro (Bloque J3f).
- **Placeholders**: ninguno — cada step trae el código completo.
- **Consistencia de tipos**: `PedidoLocal`/`ItemPedidoLocal` se definen una sola vez en Task 1 y los consumen `pedidosLocales.ts` (Task 1) y `CarritoNuevo.tsx` (Task 5) sin redeclararlos. El `tipo` de operación encolado en Task 5 (`"crear_pedido_con_items"`) coincide exactamente con el que registra Task 3. Los nombres de campo del `payload` (`pedidoId`, `origen`, `items`) coinciden entre lo que encola Task 5 y lo que lee Task 3. La firma extendida de `crearPedidoConItems` (Task 2) es la misma que consumen Task 3 y Task 5.
