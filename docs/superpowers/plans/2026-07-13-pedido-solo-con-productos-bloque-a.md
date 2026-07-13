# Bloque A (Pedido solo se crea con el primer producto) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un pedido (fila en `pedidos`) solo se crea en base de datos cuando la vendedora confirma al menos un producto — tocar una mesa libre, llenar el formulario de domicilio, o tocar "Para llevar" ya no crea ninguna fila por sí solo, para los 3 canales.

**Architecture:** Nueva ruta `/pedido/nuevo` (sin `pedidoId`) donde el carrito vive 100% en zustand hasta el primer envío. Un nuevo Server Action `crearPedidoConItems` crea el pedido y delega en `confirmarItemsPedido` (ya existente) para insertar los ítems — si eso falla, limpia la fila recién creada. Las 3 Server Actions de creación inmediata (`crearPedidoMesa`, `crearPedidoDomicilio`, `crearPedidoLlevar`) se retiran o simplifican; `SelectorOrigen.tsx` navega directo a `/pedido/nuevo` en vez de llamarlas.

**Tech Stack:** Next.js 15 App Router, TypeScript estricto, Supabase (Postgres + RLS), Zustand, Zod, Vitest.

## Global Constraints

- CLAUDE.md §13.2: nunca confiar en el precio/estado declarado por el cliente — `crearPedidoConItems` reutiliza `confirmarItemsPedido`, que ya repriega todo server-side.
- El cambio aplica a los **3 canales** (mesa, domicilio, llevar), no solo a "para llevar" (decisión confirmada).
- Si la inserción de ítems falla después de crear la fila `pedidos`, se borra esa fila (y cualquier `pedido_items`/`pedido_item_mods` que haya alcanzado a insertarse) antes de devolver el error — el invariante "sin productos, no hay pedido" se mantiene incluso en el camino de error.
- `PedidoEditor`/`CarritoPedido`/`/pedido/[pedidoId]` (para pedidos ya existentes) quedan intactos — no se modifican en este plan.
- Todos los tests existentes deben seguir verdes en cada tarea (152 en `main` a la fecha de este plan).

---

### Task 1: Policies RLS — vendedora puede borrar su propio pedido vacío

**Files:**
- Create: `supabase/migrations/20260720100000_vendedora_delete_pedido_vacio.sql`

**Interfaces:**
- Produces: policies `pedidos_vendedora_delete`, `pedido_items_vendedora_delete`, `pedido_item_mods_vendedora_delete` — usadas por la función de limpieza de la Task 2.

- [ ] **Step 1: Escribir la migración completa**

```sql
-- Bloque A: si crearPedidoConItems crea el pedido pero falla al insertar
-- los ítems (ej. un producto se desactivó a mitad de camino), necesita
-- borrar la fila recién creada para mantener el invariante "sin productos,
-- no hay pedido". Hoy no existe NINGUNA policy de DELETE sobre pedidos,
-- pedido_items ni pedido_item_mods para ningún rol -- sin policy, Postgres
-- RLS deniega la operación por defecto (0 filas afectadas, sin error).
-- Se acota a estado='abierto': un pedido deja 'abierto' únicamente cuando
-- recalcular_totales_pedido corre con éxito (Bloque 5/6), así que en el
-- momento en que este rollback se ejecuta (confirmarItemsPedido devolvió
-- error), el pedido garantizadamente sigue 'abierto'.
create policy pedidos_vendedora_delete on public.pedidos
  for delete to authenticated
  using (
    public.current_rol() = 'vendedora'
    and vendedora_id = auth.uid()
    and sede_id = public.current_sede_id()
    and estado = 'abierto'
  );

create policy pedido_items_vendedora_delete on public.pedido_items
  for delete to authenticated
  using (exists (
    select 1 from public.pedidos p
    where p.id = pedido_items.pedido_id
      and p.vendedora_id = auth.uid()
      and p.estado = 'abierto'
      and public.current_rol() = 'vendedora'
  ));

create policy pedido_item_mods_vendedora_delete on public.pedido_item_mods
  for delete to authenticated
  using (exists (
    select 1 from public.pedido_items pi
    join public.pedidos p on p.id = pi.pedido_id
    where pi.id = pedido_item_mods.pedido_item_id
      and p.vendedora_id = auth.uid()
      and p.estado = 'abierto'
      and public.current_rol() = 'vendedora'
  ));
```

- [ ] **Step 2: Aplicar en Supabase cloud**

Run: `supabase db push` (confirmar `Y`). Debe terminar sin errores.

- [ ] **Step 3: Verificar suite completa**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 152/152 tests (esta tarea no agrega tests, solo SQL).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260720100000_vendedora_delete_pedido_vacio.sql
git commit -m "feat: policies RLS para que la vendedora borre su pedido vacio (bloque A)"
```

---

### Task 2: `crearPedidoConItems` en `pedido/actions.ts` (cambio aditivo)

**Files:**
- Modify: `app/(vendedora)/pedido/actions.ts` (agregar `crearPedidoConItems`, `OrigenPedido`, extender `exigirVendedora`, agregar `calcularSiguienteNumero`)

**Interfaces:**
- Consumes: `confirmarItemsPedido(pedidoId, input)` (ya existente, mismo archivo).
- Produces: `type OrigenPedido = { canal: "mesa"; mesaId: string } | { canal: "domicilio"; clienteId: string } | { canal: "llevar" }`; `crearPedidoConItems(origen: OrigenPedido, input: EnviarPedidoInput): Promise<Result<{ pedidoId: string }, DomainError>>` — consumido por `CarritoNuevo` (Task 3).

Nota: esta tarea es puramente aditiva — `app/(vendedora)/inicio/actions.ts` no se toca todavía (eso es la Task 4, que hace el cambio atómico junto con `SelectorOrigen.tsx`). El build queda verde al final de esta tarea porque nada existente cambia de forma incompatible.

- [ ] **Step 1: Reescribir `app/(vendedora)/pedido/actions.ts` completo**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { err, ok, type DomainError, type Result } from "@/lib/result";
import { createServerSupabase } from "@/lib/supabase/server";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";
import { enviarPedidoSchema, type EnviarPedidoInput } from "@/lib/validations/pedido";
import { calcularSubtotalItem, type ItemParaTotal } from "@/lib/pedido/totales";
import { siguienteNumeroCorto } from "@/lib/pedido/numeroCorto";
import { limitesDeHoyBogota } from "@/lib/dates";

const uuidValido = (valor: string): boolean => z.uuid().safeParse(valor).success;

async function exigirVendedora(): Promise<Result<{ vendedoraId: string; sedeId: string }, DomainError>> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return err({ codigo: "NO_AUTORIZADO", mensaje: "Inicia sesión de nuevo" });
  if (user.app_metadata?.rol !== "vendedora") {
    return err({ codigo: "NO_AUTORIZADO", mensaje: "Solo la vendedora puede editar este pedido" });
  }
  return ok({
    vendedoraId: user.id,
    sedeId: (user.app_metadata?.sede_id as string) ?? SEDE_DEFAULT_ID,
  });
}

async function calcularSiguienteNumero(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  sedeId: string,
): Promise<number> {
  const { desde, hasta } = limitesDeHoyBogota();
  const { data } = await supabase
    .from("pedidos")
    .select("numero_corto")
    .eq("sede_id", sedeId)
    .gte("creado_en", desde.toISOString())
    .lt("creado_en", hasta.toISOString());
  return siguienteNumeroCorto((data ?? []).map((fila) => fila.numero_corto));
}

const ESTADOS_NO_MODIFICABLES = new Set(["cobrado", "cerrado", "anulado"]);

/** Inserta los ítems del carrito con precios recalculados desde el menú
 *  vigente (CLAUDE.md §13.2: nunca confiar en un precio del cliente) y
 *  actualiza los totales del pedido. Si el pedido sigue `abierto`, lo pasa a
 *  `enviado_cocina`; si ya estaba más adelante, solo agrega los ítems. */
export async function confirmarItemsPedido(
  pedidoId: string,
  input: EnviarPedidoInput,
): Promise<Result<null, DomainError>> {
  const ctx = await exigirVendedora();
  if (!ctx.ok) return ctx;
  if (!uuidValido(pedidoId)) {
    return err({ codigo: "VALIDACION", mensaje: "Identificador de pedido inválido" });
  }
  const parsed = enviarPedidoSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      codigo: "VALIDACION",
      mensaje: parsed.error.issues[0]?.message ?? "Datos inválidos",
    });
  }
  const supabase = await createServerSupabase();

  const { data: pedido, error: errorPedido } = await supabase
    .from("pedidos")
    .select("id, estado")
    .eq("id", pedidoId)
    .eq("vendedora_id", ctx.valor.vendedoraId)
    .single();
  if (errorPedido || !pedido) {
    return err({ codigo: "NO_ENCONTRADO", mensaje: "El pedido no existe" });
  }
  if (ESTADOS_NO_MODIFICABLES.has(pedido.estado)) {
    return err({ codigo: "VALIDACION", mensaje: "Este pedido ya no se puede modificar" });
  }

  const productoIds = [...new Set(parsed.data.items.map((item) => item.productoId))];
  const { data: productos, error: errorProductos } = await supabase
    .from("productos")
    .select("id, precio_cop, activo")
    .in("id", productoIds);
  if (errorProductos || !productos || productos.length !== productoIds.length) {
    return err({ codigo: "VALIDACION", mensaje: "Uno de los productos ya no está disponible" });
  }
  const productoPorId = new Map(productos.map((p) => [p.id, p]));

  const modificadorIds = [...new Set(parsed.data.items.flatMap((item) => item.modificadorIds))];
  const { data: modificadores, error: errorModificadores } = modificadorIds.length
    ? await supabase
        .from("modificadores")
        .select("id, producto_id, precio_delta_cop, activo")
        .in("id", modificadorIds)
    : { data: [] as { id: string; producto_id: string; precio_delta_cop: number; activo: boolean }[], error: null };
  if (errorModificadores) {
    return err({
      codigo: "BASE_DATOS",
      mensaje: "No pudimos verificar los adicionales. Intenta de nuevo.",
    });
  }
  const modificadorPorId = new Map((modificadores ?? []).map((m) => [m.id, m]));

  interface FilaItem {
    producto_id: string;
    cantidad: number;
    precio_unit_cop: number;
    subtotal_cop: number;
    notas: string | null;
    modificadorIds: string[];
  }
  const filasItems: FilaItem[] = [];

  for (const item of parsed.data.items) {
    const producto = productoPorId.get(item.productoId);
    if (!producto || !producto.activo) {
      return err({ codigo: "VALIDACION", mensaje: "Uno de los productos ya no está disponible" });
    }
    const mods = item.modificadorIds.map((id) => modificadorPorId.get(id));
    if (mods.some((m) => !m || !m.activo || m.producto_id !== item.productoId)) {
      return err({ codigo: "VALIDACION", mensaje: "Uno de los adicionales ya no está disponible" });
    }
    const deltas = mods.map((m) => BigInt(m!.precio_delta_cop));
    const itemParaTotal: ItemParaTotal = {
      precioUnitCop: BigInt(producto.precio_cop),
      cantidad: item.cantidad,
      modificadoresDeltaCop: deltas,
    };
    filasItems.push({
      producto_id: item.productoId,
      cantidad: item.cantidad,
      precio_unit_cop: producto.precio_cop,
      subtotal_cop: Number(calcularSubtotalItem(itemParaTotal)),
      notas: item.nota ?? null,
      modificadorIds: item.modificadorIds,
    });
  }

  const { data: itemsInsertados, error: errorItems } = await supabase
    .from("pedido_items")
    .insert(
      filasItems.map((fila) => ({
        pedido_id: pedidoId,
        producto_id: fila.producto_id,
        cantidad: fila.cantidad,
        precio_unit_cop: fila.precio_unit_cop,
        subtotal_cop: fila.subtotal_cop,
        notas: fila.notas,
      })),
    )
    .select("id");
  if (errorItems || !itemsInsertados || itemsInsertados.length !== filasItems.length) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos guardar el pedido. Intenta de nuevo." });
  }

  const filasMods = filasItems.flatMap((fila, indice) =>
    fila.modificadorIds.map((modificadorId) => ({
      pedido_item_id: itemsInsertados[indice]!.id,
      modificador_id: modificadorId,
      precio_delta_cop: modificadorPorId.get(modificadorId)!.precio_delta_cop,
    })),
  );
  if (filasMods.length > 0) {
    const { error: errorMods } = await supabase.from("pedido_item_mods").insert(filasMods);
    if (errorMods) {
      return err({
        codigo: "BASE_DATOS",
        mensaje: "No pudimos guardar los adicionales. Intenta de nuevo.",
      });
    }
  }

  const { error: errorTotales } = await supabase.rpc("recalcular_totales_pedido", {
    p_pedido_id: pedidoId,
  });
  if (errorTotales) {
    return err({
      codigo: "BASE_DATOS",
      mensaje: "No pudimos guardar el pedido. Intenta de nuevo.",
    });
  }

  revalidatePath(`/pedido/${pedidoId}`);
  return ok(null);
}

export type OrigenPedido =
  | { canal: "mesa"; mesaId: string }
  | { canal: "domicilio"; clienteId: string }
  | { canal: "llevar" };

/** Borra un pedido `abierto` y cualquier ítem/adicional que haya alcanzado
 *  a insertarse, en ese orden (pedido_item_mods -> pedido_items -> pedidos)
 *  para no violar las FK. Se usa cuando crearPedidoConItems crea el pedido
 *  pero confirmarItemsPedido falla después -- mantiene el invariante "sin
 *  productos, no hay pedido" incluso en el camino de error. */
async function limpiarPedidoVacio(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  pedidoId: string,
): Promise<void> {
  const { data: itemsFilas } = await supabase.from("pedido_items").select("id").eq("pedido_id", pedidoId);
  const itemIds = (itemsFilas ?? []).map((i) => i.id);
  if (itemIds.length > 0) {
    await supabase.from("pedido_item_mods").delete().in("pedido_item_id", itemIds);
    await supabase.from("pedido_items").delete().eq("pedido_id", pedidoId);
  }
  await supabase.from("pedidos").delete().eq("id", pedidoId);
}

/** Crea el pedido y sus primeros ítems en un solo paso -- un pedido nunca
 *  existe en base de datos sin al menos un producto confirmado. Reutiliza
 *  confirmarItemsPedido para la inserción de ítems (cero lógica de precios
 *  duplicada); si falla, borra la fila recién creada. */
export async function crearPedidoConItems(
  origen: OrigenPedido,
  input: EnviarPedidoInput,
): Promise<Result<{ pedidoId: string }, DomainError>> {
  const ctx = await exigirVendedora();
  if (!ctx.ok) return ctx;
  const supabase = await createServerSupabase();

  if (origen.canal === "mesa") {
    if (!uuidValido(origen.mesaId)) {
      return err({ codigo: "VALIDACION", mensaje: "Identificador de mesa inválido" });
    }
    const { data: mesa, error: errorMesa } = await supabase
      .from("mesas")
      .select("id, estado, activa")
      .eq("id", origen.mesaId)
      .single();
    if (errorMesa || !mesa) {
      return err({ codigo: "NO_ENCONTRADO", mensaje: "La mesa no existe" });
    }
    if (!mesa.activa || mesa.estado !== "libre") {
      return err({ codigo: "VALIDACION", mensaje: "Esa mesa ya no está disponible. Elige otra." });
    }
  } else if (origen.canal === "domicilio") {
    if (!uuidValido(origen.clienteId)) {
      return err({ codigo: "VALIDACION", mensaje: "Identificador de cliente inválido" });
    }
  }

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
  if (errorPedido || !pedido) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos crear el pedido. Intenta de nuevo." });
  }

  const resultado = await confirmarItemsPedido(pedido.id, input);
  if (!resultado.ok) {
    await limpiarPedidoVacio(supabase, pedido.id);
    return resultado;
  }

  return ok({ pedidoId: pedido.id });
}
```

- [ ] **Step 2: Verificar suite completa**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 152/152 tests — cambio puramente aditivo, nada existente se rompe.

- [ ] **Step 3: Commit**

```bash
git add "app/(vendedora)/pedido/actions.ts"
git commit -m "feat: crearPedidoConItems reutilizando confirmarItemsPedido (bloque A)"
```

---

### Task 3: Nueva ruta `/pedido/nuevo`

**Files:**
- Create: `app/(vendedora)/pedido/nuevo/page.tsx`
- Create: `components/pedido/PedidoNuevoEditor.tsx`
- Create: `components/pedido/CarritoNuevo.tsx`

**Interfaces:**
- Consumes: `type OrigenPedido`, `crearPedidoConItems` (Task 2); `SelectorMenu` (ya existente, sin cambios); `useCarritoStore` (ya existente, sin cambios); `CategoriaFila`/`ModificadorFila`/`ProductoFila` (ya existentes).
- Produces: nada nuevo consumido por otras tareas — es la hoja final de esta rama de la arquitectura.

- [ ] **Step 1: `components/pedido/CarritoNuevo.tsx`**

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatearCOP, montoDesdePesos, multiplicar, sumar } from "@/lib/money";
import { ClayButton } from "@/components/ui/ClayButton";
import { useCarritoStore } from "@/lib/pedido/carritoStore";
import { crearPedidoConItems, type OrigenPedido } from "@/app/(vendedora)/pedido/actions";

interface CarritoNuevoProps {
  origen: OrigenPedido;
}

/** Carrito para un pedido que todavía no existe en base de datos (Bloque A:
 *  un pedido solo se crea al confirmar el primer envío). Sin sección "ya
 *  enviado a cocina" -- nada se ha confirmado todavía -- y un único botón,
 *  sin el caso de reenvíos que sí maneja CarritoPedido. */
export function CarritoNuevo({ origen }: CarritoNuevoProps) {
  const router = useRouter();
  const { items, quitar, cambiarCantidad, vaciar } = useCarritoStore();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = sumar(
    ...items.map((item) =>
      multiplicar(
        sumar(
          montoDesdePesos(item.precioUnitPesos),
          ...item.modificadores.map((m) => montoDesdePesos(m.precioDeltaPesos)),
        ),
        item.cantidad,
      ),
    ),
  );

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

  return (
    <aside className="flex w-full flex-col gap-4 rounded-clay-lg bg-brand-crema p-4 shadow-clay-md sm:max-w-sm">
      <h2 className="font-display text-lg font-semibold text-text-primary">Carrito</h2>

      <div className="flex flex-col gap-2">
        {items.length === 0 ? (
          <p className="text-sm text-text-secondary">Toca un producto del menú para agregarlo.</p>
        ) : (
          items.map((item) => (
            <div key={item.clave} className="rounded-clay-sm bg-brand-crema-2 p-3 text-sm text-text-primary">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{item.nombre}</span>
                <button
                  type="button"
                  aria-label={`Quitar ${item.nombre}`}
                  onClick={() => quitar(item.clave)}
                  className="text-brand-tomate-2 hover:text-brand-tomate focus-visible:outline-2 focus-visible:outline-brand-tomate"
                >
                  ✕
                </button>
              </div>
              {item.modificadores.length > 0 ? (
                <p className="text-xs text-text-secondary">
                  {item.modificadores.map((m) => m.nombre).join(", ")}
                </p>
              ) : null}
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`Reducir cantidad de ${item.nombre}`}
                  disabled={item.cantidad <= 1}
                  onClick={() => cambiarCantidad(item.clave, item.cantidad - 1)}
                  className="flex size-8 items-center justify-center rounded-clay-sm bg-brand-crema shadow-clay-sm disabled:opacity-30"
                >
                  −
                </button>
                <span className="w-6 text-center font-mono">{item.cantidad}</span>
                <button
                  type="button"
                  aria-label={`Aumentar cantidad de ${item.nombre}`}
                  onClick={() => cambiarCantidad(item.clave, item.cantidad + 1)}
                  className="flex size-8 items-center justify-center rounded-clay-sm bg-brand-crema shadow-clay-sm"
                >
                  +
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex items-center justify-between border-t border-black/10 pt-3">
        <span className="font-display text-sm font-medium text-text-secondary">Total</span>
        <span className="font-mono text-lg font-semibold text-text-primary">{formatearCOP(total)}</span>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {error}
        </p>
      ) : null}

      <ClayButton
        type="button"
        variant="primary"
        size="lg"
        disabled={items.length === 0 || enviando}
        onClick={confirmar}
      >
        {enviando ? "Enviando…" : "Enviar a cocina"}
      </ClayButton>
    </aside>
  );
}
```

- [ ] **Step 2: `components/pedido/PedidoNuevoEditor.tsx`**

```typescript
"use client";

import { useEffect } from "react";
import { CarritoNuevo } from "@/components/pedido/CarritoNuevo";
import { SelectorMenu } from "@/components/pedido/SelectorMenu";
import { useCarritoStore } from "@/lib/pedido/carritoStore";
import type { CategoriaFila, ModificadorFila, ProductoFila } from "@/components/menu/types";
import type { OrigenPedido } from "@/app/(vendedora)/pedido/actions";

interface PedidoNuevoEditorProps {
  origen: OrigenPedido;
  categorias: CategoriaFila[];
  productos: ProductoFila[];
  modificadores: ModificadorFila[];
}

function claveContexto(origen: OrigenPedido): string {
  if (origen.canal === "mesa") return `nuevo:mesa:${origen.mesaId}`;
  if (origen.canal === "domicilio") return `nuevo:domicilio:${origen.clienteId}`;
  return "nuevo:llevar";
}

/** Orquesta /pedido/nuevo: menú a la izquierda, carrito en curso (sin
 *  pedido en base de datos todavía) a la derecha. */
export function PedidoNuevoEditor({ origen, categorias, productos, modificadores }: PedidoNuevoEditorProps) {
  const clave = claveContexto(origen);

  // Mismo mecanismo que PedidoEditor.tsx (asegurarPedido): protege contra un
  // carrito sin confirmar de otro origen distinto quedando visible aquí. La
  // clave es sintética (no un pedido.id real) porque todavía no existe fila.
  useEffect(() => {
    useCarritoStore.getState().asegurarPedido(clave);
  }, [clave]);

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
      <div className="flex-1">
        <SelectorMenu categorias={categorias} productos={productos} modificadores={modificadores} />
      </div>
      <CarritoNuevo origen={origen} />
    </div>
  );
}
```

- [ ] **Step 3: `app/(vendedora)/pedido/nuevo/page.tsx`**

```typescript
import { createServerSupabase } from "@/lib/supabase/server";
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
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Verificar suite completa**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 152/152 tests — la nueva ruta y sus componentes son aditivos, no rompen nada existente.

- [ ] **Step 5: Commit**

```bash
git add "app/(vendedora)/pedido/nuevo" components/pedido/PedidoNuevoEditor.tsx components/pedido/CarritoNuevo.tsx
git commit -m "feat: ruta /pedido/nuevo con carrito sin pedido creado (bloque A)"
```

---

### Task 4: Simplificar `inicio/actions.ts` y `SelectorOrigen.tsx` navega directo a `/pedido/nuevo`

**Files:**
- Modify: `app/(vendedora)/inicio/actions.ts` (quitar `crearPedidoMesa`/`crearPedidoLlevar`, simplificar `crearPedidoDomicilio`)
- Modify: `components/pedido/SelectorOrigen.tsx` (reescritura completa)

**Interfaces:**
- Consumes: `crearPedidoDomicilio` (firma nueva, definida en el Step 1 de esta misma tarea), `entrarPedidoDeMesa` (sin cambios).
- Produces: nada nuevo.

Nota: estos dos archivos deben cambiar juntos, en el mismo commit — `SelectorOrigen.tsx` es el único consumidor de las 3 funciones que se eliminan/simplifican aquí, así que separarlos en tareas distintas dejaría el build roto entre una y otra. Es un cambio atómico de "punto de disparo": deja de invocarse un Server Action que crea el pedido de inmediato, empieza a navegarse a `/pedido/nuevo`.

- [ ] **Step 1: Reescribir `app/(vendedora)/inicio/actions.ts` completo**

```typescript
"use server";

import { z } from "zod";

import { err, ok, type DomainError, type Result } from "@/lib/result";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";
import { createServerSupabase } from "@/lib/supabase/server";
import { clienteDomicilioSchema, type ClienteDomicilioInput } from "@/lib/validations/pedido";

const uuidValido = (valor: string): boolean => z.uuid().safeParse(valor).success;

interface ContextoVendedora {
  sedeId: string;
  vendedoraId: string;
}

async function exigirVendedora(): Promise<Result<ContextoVendedora, DomainError>> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return err({ codigo: "NO_AUTORIZADO", mensaje: "Inicia sesión de nuevo" });
  // app_metadata (no user_metadata): solo el service role lo escribe.
  if (user.app_metadata?.rol !== "vendedora") {
    return err({ codigo: "NO_AUTORIZADO", mensaje: "Solo la vendedora puede tomar pedidos" });
  }
  return ok({
    sedeId: (user.app_metadata?.sede_id as string) ?? SEDE_DEFAULT_ID,
    vendedoraId: user.id,
  });
}

/** Guarda o actualiza los datos del cliente de domicilio -- ya NO crea el
 *  pedido (Bloque A: un pedido solo existe si se le agregan productos). El
 *  pedido se crea en /pedido/nuevo al confirmar el primer envío
 *  (crearPedidoConItems, app/(vendedora)/pedido/actions.ts). */
export async function crearPedidoDomicilio(
  input: ClienteDomicilioInput,
): Promise<Result<{ clienteId: string }, DomainError>> {
  const ctx = await exigirVendedora();
  if (!ctx.ok) return ctx;
  const parsed = clienteDomicilioSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      codigo: "VALIDACION",
      mensaje: parsed.error.issues[0]?.message ?? "Datos inválidos",
    });
  }
  const supabase = await createServerSupabase();

  const { data: cliente, error: errorCliente } = await supabase
    .from("clientes_domicilio")
    .upsert(
      {
        sede_id: ctx.valor.sedeId,
        nombre: parsed.data.nombre,
        telefono: parsed.data.telefono,
        direccion: parsed.data.direccion,
        referencia: parsed.data.referencia ?? null,
      },
      { onConflict: "sede_id,telefono" },
    )
    .select("id")
    .single();
  if (errorCliente || !cliente) {
    return err({
      codigo: "BASE_DATOS",
      mensaje: "No pudimos guardar los datos del cliente. Intenta de nuevo.",
    });
  }

  return ok({ clienteId: cliente.id });
}

/** Busca el pedido abierto de esta mesa que pertenece a la vendedora
 *  actual, para retomarlo (ej. si salió a atender otra mesa y regresa).
 *  `pedidos_vendedora_select` no excluye estados terminales, así que el
 *  filtro de estado va explícito en la query, no se confía en RLS aquí. */
export async function entrarPedidoDeMesa(
  mesaId: string,
): Promise<Result<{ pedidoId: string }, DomainError>> {
  const ctx = await exigirVendedora();
  if (!ctx.ok) return ctx;
  if (!uuidValido(mesaId)) {
    return err({ codigo: "VALIDACION", mensaje: "Identificador de mesa inválido" });
  }
  const supabase = await createServerSupabase();

  const { data: pedido } = await supabase
    .from("pedidos")
    .select("id")
    .eq("mesa_id", mesaId)
    .eq("vendedora_id", ctx.valor.vendedoraId)
    .not("estado", "in", "(cobrado,cerrado,anulado)")
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pedido) {
    return err({ codigo: "NO_ENCONTRADO", mensaje: "Esta mesa está ocupada por otra persona." });
  }
  return ok({ pedidoId: pedido.id });
}
```

- [ ] **Step 2: Reescribir `components/pedido/SelectorOrigen.tsx` completo**

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { crearPedidoDomicilio, entrarPedidoDeMesa } from "@/app/(vendedora)/inicio/actions";
import { clienteDomicilioSchema, type ClienteDomicilioInput } from "@/lib/validations/pedido";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayCard } from "@/components/ui/ClayCard";
import { ClayInput } from "@/components/ui/ClayInput";
import { ClayModal } from "@/components/ui/ClayModal";
import { GrillaMesas } from "@/components/mesas/GrillaMesas";
import type { MesaVista } from "@/components/mesas/tipos";

interface SelectorOrigenProps {
  mesasIniciales: MesaVista[];
  sedeId: string;
}

/** Los tres orígenes de un pedido nuevo: mesa, domicilio, para llevar. Tocar
 *  una mesa libre o "Para llevar" navega directo a /pedido/nuevo -- ningún
 *  pedido se crea hasta que se confirme el primer producto (Bloque A). Una
 *  mesa ocupada por la propia vendedora sí tiene un pedido real que
 *  retomar (entrarPedidoDeMesa). */
export function SelectorOrigen({ mesasIniciales, sedeId }: SelectorOrigenProps) {
  const router = useRouter();
  const [modalDomicilioAbierto, setModalDomicilioAbierto] = useState(false);
  const [entrandoMesa, setEntrandoMesa] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function alSeleccionarMesa(mesa: MesaVista) {
    if (mesa.estado === "libre") {
      router.push(`/pedido/nuevo?mesaId=${mesa.id}`);
      return;
    }
    if (entrandoMesa) return;
    setError(null);
    setEntrandoMesa(true);
    const resultado = await entrarPedidoDeMesa(mesa.id);
    setEntrandoMesa(false);
    if (!resultado.ok) {
      setError(resultado.error.mensaje);
      return;
    }
    router.push(`/pedido/${resultado.valor.pedidoId}`);
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {error}
        </p>
      ) : null}

      <ClayCard variant="flat">
        <h2 className="mb-4 font-display text-xl font-semibold text-text-primary">Mesa</h2>
        <div className={entrandoMesa ? "pointer-events-none opacity-60" : undefined}>
          <GrillaMesas
            mesasIniciales={mesasIniciales}
            sedeId={sedeId}
            puedeEditar={false}
            modo="seleccion"
            onSeleccionarMesa={alSeleccionarMesa}
          />
        </div>
      </ClayCard>

      <div className="flex flex-wrap gap-4">
        <ClayButton type="button" variant="secondary" size="lg" onClick={() => setModalDomicilioAbierto(true)}>
          Domicilio
        </ClayButton>
        <ClayButton
          type="button"
          variant="secondary"
          size="lg"
          onClick={() => router.push("/pedido/nuevo?canal=llevar")}
        >
          Para llevar
        </ClayButton>
      </div>

      <FormularioDomicilio
        abierto={modalDomicilioAbierto}
        onCerrar={() => setModalDomicilioAbierto(false)}
        onCreado={(clienteId) => router.push(`/pedido/nuevo?canal=domicilio&clienteId=${clienteId}`)}
      />
    </div>
  );
}

interface FormularioDomicilioProps {
  abierto: boolean;
  onCerrar: () => void;
  onCreado: (clienteId: string) => void;
}

function FormularioDomicilio({ abierto, onCerrar, onCreado }: FormularioDomicilioProps) {
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClienteDomicilioInput>({ resolver: zodResolver(clienteDomicilioSchema) });

  function cerrar() {
    reset();
    setErrorGeneral(null);
    onCerrar();
  }

  const onSubmit = handleSubmit(async (datos) => {
    setErrorGeneral(null);
    const resultado = await crearPedidoDomicilio(datos);
    if (!resultado.ok) {
      setErrorGeneral(resultado.error.mensaje);
      return;
    }
    reset();
    onCreado(resultado.valor.clienteId);
  });

  return (
    <ClayModal abierto={abierto} titulo="Pedido a domicilio" onCerrar={cerrar}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <ClayInput
          label="Nombre"
          placeholder="Ej: María Pérez"
          error={errors.nombre?.message}
          {...register("nombre")}
        />
        <ClayInput
          label="Teléfono"
          type="tel"
          placeholder="Ej: 3211234567"
          error={errors.telefono?.message}
          {...register("telefono")}
        />
        <ClayInput
          label="Dirección"
          placeholder="Ej: Cra 14 # 8-28"
          error={errors.direccion?.message}
          {...register("direccion")}
        />
        <ClayInput
          label="Referencia (opcional)"
          placeholder="Ej: portón verde"
          error={errors.referencia?.message}
          {...register("referencia")}
        />
        {errorGeneral ? (
          <p role="alert" className="text-sm text-brand-tomate-2">
            {errorGeneral}
          </p>
        ) : null}
        <div className="flex justify-end gap-3">
          <ClayButton
            type="button"
            variant="ghost"
            className="text-text-primary hover:bg-brand-crema-2"
            onClick={cerrar}
          >
            Cancelar
          </ClayButton>
          <ClayButton type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? "Creando…" : "Continuar"}
          </ClayButton>
        </div>
      </form>
    </ClayModal>
  );
}
```

- [ ] **Step 3: Verificar suite completa**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 152/152 tests.

- [ ] **Step 4: Commit**

```bash
git add "app/(vendedora)/inicio/actions.ts" components/pedido/SelectorOrigen.tsx
git commit -m "feat: SelectorOrigen navega a /pedido/nuevo en vez de crear pedido de inmediato (bloque A)"
```

---

### Task 5: Verificación en vivo end-to-end y reconciliación

**Files:**
- Modify: `CLAUDE.md` (solo si la verificación revela una divergencia real)

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Preparar sesión de prueba**

Con `service_role`, generar sesión de la vendedora real (`vendedora@criollitas.com`, mecanismo `generate_link`+`verify` ya usado en bloques anteriores). Confirmar que existe al menos una mesa libre y activa (ej. Mesa 1, que debe seguir `libre` tras la verificación anterior de esta sesión).

- [ ] **Step 2: Caso "llevar" — éxito**

Con el token de la vendedora:
a. Confirmar que `pedidos` no tiene ninguna fila con `numero_corto` reciente para esta sede antes de empezar (`GET /rest/v1/pedidos?select=id&order=creado_en.desc&limit=1`).
b. Llamar `crearPedidoConItems({canal:"llevar"}, {items:[...]})` — como es un Server Action, no un RPC, simularlo insertando directamente vía REST el equivalente: crear el pedido (`POST /rest/v1/pedidos` con canal=llevar) y luego `POST /rest/v1/pedido_items` + `POST /rest/v1/rpc/recalcular_totales_pedido`, igual que se hizo en la verificación de bloques anteriores.
c. Confirmar que el pedido existe con el ítem y `estado=enviado_cocina`.
d. Limpiar (`DELETE` pedido_items, pedido).

- [ ] **Step 3: Caso "mesa ya no disponible" — sin fila huérfana**

Con `service_role`, poner una mesa de prueba (ej. Mesa 4) en `estado=ocupada` manualmente. Con el token de la vendedora, intentar el equivalente de `crearPedidoConItems({canal:"mesa", mesaId:<Mesa4>}, {items:[...]})`: el primer paso (verificar `mesa.estado==='libre'`) debe fallar ANTES de cualquier insert en `pedidos` — confirmar con `service_role` que no se creó ninguna fila nueva en `pedidos`. Revertir Mesa 4 a `libre`.

- [ ] **Step 4: Caso de fallo tras crear el pedido — limpieza funciona**

Con `service_role`, crear un producto de prueba y desactivarlo (`activo=false`) inmediatamente después de que la vendedora ya "vio" el menú (simulando la carrera real: ella agrega el producto a su carrito local antes de que se desactive). Con el token de la vendedora, insertar manualmente un pedido (`POST /rest/v1/pedidos`, canal=llevar) y luego intentar `POST /rest/v1/pedido_items` con ese producto ahora inactivo — el insert de `pedido_items` en sí no lo bloquea (no hay constraint de `activo` a nivel de tabla), así que en su lugar: llamar directamente el equivalente de la ruta de error de `confirmarItemsPedido` no es reproducible vía REST puro (la validación de producto activo vive en TypeScript, no en SQL) — en su lugar, ejecutar esta verificación leyendo el código: confirmar por inspección que `crearPedidoConItems` llama `limpiarPedidoVacio` en la rama `if (!resultado.ok)`, y confirmar con un test manual en `pnpm dev` (si hay acceso): desactivar un producto real desde `/menu` (admin) mientras una pestaña de vendedora ya tiene ese producto en el carrito de `/pedido/nuevo`, luego confirmar el envío — debe fallar con "Uno de los productos ya no está disponible" y no dejar fila en `pedidos`.

- [ ] **Step 5: Caso domicilio**

Repetir el patrón del Step 2 pero con canal `domicilio`: crear/reusar un cliente de prueba, confirmar que `crearPedidoDomicilio` (ahora solo upsert de cliente) no crea ninguna fila en `pedidos`, y que el flujo completo (cliente + primer ítem) sí la crea. Limpiar.

- [ ] **Step 6: Reconciliar CLAUDE.md si hace falta**

Revisar §5 (la estructura de carpetas debe agregar `pedido/nuevo/` bajo `(vendedora)/`), §9 (middleware — confirmar que `/pedido` ya cubre `/pedido/nuevo` bajo el mismo prefijo `{ prefijo: "/pedido", roles: ["vendedora"] }`, sin necesidad de una regla nueva). Si algo diverge, corregirlo; si no, no tocar nada por tocar.

- [ ] **Step 7: Verificación final**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 152/152 tests. Flujo dev manual (si hay acceso a `pnpm dev`): login vendedora → `/inicio` → tocar "Para llevar" → confirmar que NO hay pedido creado todavía (revisar `/pedidos` de cajera, no debe aparecer) → agregar un producto → "Enviar a cocina" → confirmar que ahora sí existe y navega a `/pedido/<id>`.

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: reconciliar CLAUDE.md con el bloque A (pedido solo con productos)"
```

(Si no hubo cambios en CLAUDE.md, omitir este commit y dejarlo anotado en el reporte de la tarea.)

---

## Self-Review (del autor del plan)

**Cobertura del spec:** Alcance a los 3 canales (decisión 1): Task 2 elimina `crearPedidoMesa`/`crearPedidoLlevar` y simplifica `crearPedidoDomicilio` sin excepción por canal. Reutilización de `confirmarItemsPedido` (decisión 2): `crearPedidoConItems` la llama directamente, cero lógica de precios duplicada. Limpieza en caso de fallo (decisión 3): `limpiarPedidoVacio`, Task 1 (policies) + Task 2 (uso). Ruta `/pedido/nuevo` + componentes: Task 3. `SelectorOrigen` actualizado: Task 4. Verificación end-to-end: Task 5.

**Placeholders:** ninguno — todo el código de cada step está completo. El Step 4 de la Task 5 es más una guía de verificación por inspección + prueba manual que un comando curl exacto (la validación que se está probando vive en TypeScript, no en SQL, así que no hay un endpoint REST directo que la ejercite de forma aislada) — se documenta explícitamente por qué, no es un placeholder disfrazado.

**Consistencia de tipos:** `OrigenPedido` (Task 2) se consume sin modificación en `CarritoNuevo`/`PedidoNuevoEditor`/`page.tsx` (Task 3) y no se toca en la Task 4. `crearPedidoDomicilio`'s nuevo shape de retorno (`{ clienteId: string }` en vez de `{ pedidoId: string }`) se propaga correctamente al único consumidor (`SelectorOrigen.tsx`, Task 4) — el `onCreado` callback de `FormularioDomicilio` cambia de tipo (`pedidoId: string` → `clienteId: string`) de forma consistente en ambos lados (definición y uso) dentro del mismo archivo reescrito.

**Nota de diseño agregada durante el self-review**: la primera versión de este plan dejaba el build roto entre las Tasks 2 y 4 (`SelectorOrigen.tsx` importando funciones ya eliminadas antes de tiempo) — se corrigió reordenando: Task 2 ahora es puramente aditiva (`crearPedidoConItems` en `pedido/actions.ts`, sin tocar `inicio/actions.ts`), Task 3 también aditiva (nueva ruta y componentes), y la simplificación de `inicio/actions.ts` se fusionó dentro de la Task 4 junto con `SelectorOrigen.tsx` — su único consumidor — como un cambio atómico de "punto de disparo". Cada tarea ahora termina con `pnpm build` verde, cumpliendo el principio de que cada tarea es un entregable independientemente verificable.
