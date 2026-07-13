# Bloque C — Listado de domicilio/llevar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a la Vendedora un listado de sus propios pedidos de domicilio/llevar en curso, y a la Cajera un listado de todos los pedidos de domicilio/llevar en curso de la sede — ambos con la posibilidad de cancelarlos (agregar productos sigue siendo exclusivo de la vendedora).

**Architecture:** Ampliación de RLS (`pedidos_cajera_select`, nueva policy `pedidos_cajera_cancelar`, trigger de columnas de cajera ajustado) para que la cajera pueda ver y cancelar en cualquier estado no terminal. Nueva Server Action `cancelarPedidoCajera` que reutiliza el mismo RPC `cancelar_pedido` del Bloque B. Refactor de `CarritoPedido.tsx` para extraer el modal de cancelación a un componente compartido (`ModalCancelarPedido`), consumido también por dos páginas RSC nuevas y su componente de listado compartido (`ListadoPedidosEnCurso`).

**Tech Stack:** Next.js 15 Server Actions, Supabase Postgres (RLS + RPC ya existente), react-hook-form, Zod, vitest.

## Global Constraints

- Español de Colombia en todo texto visible (CLAUDE.md §13.11).
- Nunca confiar en el rol del cliente — toda autorización vía RLS y `exigirX()` con `getUser()` (CLAUDE.md §13.2).
- Cajera: ve y cancela pedidos de domicilio/llevar en cualquier estado no terminal; **no** agrega productos (decisión de negocio confirmada).
- Vendedora: su listado muestra **solo sus propios** pedidos de domicilio/llevar (decisión de negocio confirmada).
- El refactor de `CarritoPedido.tsx` (Task 1) debe dejar el comportamiento exactamente igual — mismo texto, mismos estados, mismo flujo. No es una oportunidad de rediseño.
- `pnpm lint && pnpm test && pnpm build` deben quedar en verde al final de cada tarea. 157 tests en `main` a la fecha de este plan (confirmado corriendo `pnpm test`).
- Windows: `git commit -F <tempfile>` en vez de heredocs (fallan en PowerShell 5.1). Trailer: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- `lib/supabase/types.ts` tiene CRLF+BOM — nunca sobreescribirlo completo; aplicar el diff a mano (esta migración no agrega tablas/columnas/funciones nuevas, así que probablemente no requiera cambios — confirmar en la Task 2).

---

### Task 1: Extraer `ModalCancelarPedido` de `CarritoPedido.tsx`

**Files:**
- Create: `components/pedido/ModalCancelarPedido.tsx`
- Modify: `components/pedido/CarritoPedido.tsx`

**Interfaces:**
- Produces: `ModalCancelarPedido` — componente `"use client"` con props:
  ```typescript
  interface ModalCancelarPedidoProps {
    pedido: { id: string; numeroCorto: number; canal: CanalPedido };
    abierto: boolean;
    onCerrar: () => void;
    onCancelar: (pedidoId: string, input: MotivoCancelacionInput) => Promise<Result<null, DomainError>>;
    onExito: () => void;
  }
  ```
  Usado por `CarritoPedido.tsx` (este task) y por `ListadoPedidosEnCurso.tsx` (Task 5).

- [ ] **Step 1: Crear `components/pedido/ModalCancelarPedido.tsx`**

```typescript
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayModal } from "@/components/ui/ClayModal";
import { ClayInput } from "@/components/ui/ClayInput";
import { motivoCancelacionSchema, type MotivoCancelacionInput } from "@/lib/validations/cancelacion";
import type { CanalPedido } from "@/components/pedido/tipos";
import type { DomainError, Result } from "@/lib/result";

interface ModalCancelarPedidoProps {
  pedido: { id: string; numeroCorto: number; canal: CanalPedido };
  abierto: boolean;
  onCerrar: () => void;
  onCancelar: (pedidoId: string, input: MotivoCancelacionInput) => Promise<Result<null, DomainError>>;
  onExito: () => void;
}

/** Modal + formulario de motivo para cancelar un pedido (Bloque B). Extraído
 *  de CarritoPedido para reutilizarse también en los listados de pedidos en
 *  curso de vendedora y cajera (Bloque C) -- onCancelar delega la llamada al
 *  Server Action correcto según quién lo use. */
export function ModalCancelarPedido({ pedido, abierto, onCerrar, onCancelar, onExito }: ModalCancelarPedidoProps) {
  const [errorCancelar, setErrorCancelar] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MotivoCancelacionInput>({ resolver: zodResolver(motivoCancelacionSchema) });

  function cerrar() {
    reset();
    setErrorCancelar(null);
    onCerrar();
  }

  const onSubmit = handleSubmit(async (datos) => {
    setErrorCancelar(null);
    setCancelando(true);
    const resultado = await onCancelar(pedido.id, datos);
    setCancelando(false);
    if (!resultado.ok) {
      setErrorCancelar(resultado.error.mensaje);
      return;
    }
    reset();
    onExito();
  });

  return (
    <ClayModal abierto={abierto} titulo="Cancelar pedido" onCerrar={cerrar}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <p className="text-sm text-text-secondary">
          El pedido #{pedido.numeroCorto} se cancelará y no se podrá cobrar.
          {pedido.canal === "mesa" ? " La mesa quedará libre." : ""}
        </p>
        <ClayInput
          label="Motivo de la cancelación"
          placeholder="Ej: el cliente se retiró"
          error={errors.motivo?.message}
          {...register("motivo")}
        />
        {errorCancelar ? (
          <p role="alert" className="text-sm text-brand-tomate-2">
            {errorCancelar}
          </p>
        ) : null}
        <div className="flex justify-end gap-3">
          <ClayButton type="button" variant="ghost" onClick={cerrar}>
            Volver
          </ClayButton>
          <ClayButton type="submit" variant="destructive" disabled={cancelando}>
            {cancelando ? "Cancelando…" : "Confirmar cancelación"}
          </ClayButton>
        </div>
      </form>
    </ClayModal>
  );
}
```

- [ ] **Step 2: Reemplazar `CarritoPedido.tsx` para consumir el nuevo componente**

Reemplazar el contenido completo de `components/pedido/CarritoPedido.tsx` por:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatearCOP, montoDesdePesos, multiplicar, sumar } from "@/lib/money";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayBadge } from "@/components/ui/ClayBadge";
import { ModalCancelarPedido } from "@/components/pedido/ModalCancelarPedido";
import { useCarritoStore } from "@/lib/pedido/carritoStore";
import { confirmarItemsPedido, cancelarPedido } from "@/app/(vendedora)/pedido/actions";
import type { ItemConfirmadoVista, PedidoVista } from "@/components/pedido/tipos";

const ETIQUETA_ESTADO_ITEM: Record<ItemConfirmadoVista["estadoItem"], string> = {
  pendiente: "Pendiente",
  en_preparacion: "En preparación",
  listo: "Listo",
  entregado: "Entregado",
};

interface CarritoPedidoProps {
  pedido: PedidoVista;
  itemsConfirmados: ItemConfirmadoVista[];
  /** Pedido en estado terminal (cobrado/cerrado/anulado): el carrito en curso
   *  puede tener ítems sin enviar, pero el botón de confirmar queda bloqueado. */
  soloLectura?: boolean;
}

/** Panel del carrito en curso (zustand) + ítems ya confirmados (solo lectura) + total. */
export function CarritoPedido({ pedido, itemsConfirmados, soloLectura = false }: CarritoPedidoProps) {
  const router = useRouter();
  const { items, quitar, cambiarCantidad, vaciar } = useCarritoStore();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalCancelarAbierto, setModalCancelarAbierto] = useState(false);

  const totalCarritoEnCurso = sumar(
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
  const totalConfirmado = BigInt(pedido.totalCop);

  const esPrimerEnvio = pedido.estado === "abierto";
  const textoBoton = esPrimerEnvio ? "Enviar a cocina" : "Agregar a la comanda";

  async function confirmar() {
    if (items.length === 0 || soloLectura) return;
    setError(null);
    setEnviando(true);
    const resultado = await confirmarItemsPedido(pedido.id, {
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
    router.refresh();
  }

  return (
    <aside className="flex w-full flex-col gap-4 rounded-clay-lg bg-brand-crema p-4 shadow-clay-md sm:max-w-sm">
      <h2 className="font-display text-lg font-semibold text-text-primary">Pedido #{pedido.numeroCorto}</h2>

      {itemsConfirmados.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="font-display text-sm font-medium text-text-secondary">Ya enviado a cocina</h3>
          {itemsConfirmados.map((item) => (
            <div key={item.id} className="rounded-clay-sm bg-surface-sunken p-3 text-sm text-text-primary">
              <div className="flex items-center justify-between gap-2">
                <span>
                  {item.cantidad}× {item.productoNombre}
                </span>
                <ClayBadge variant="neutral">{ETIQUETA_ESTADO_ITEM[item.estadoItem]}</ClayBadge>
              </div>
              {item.modificadores.length > 0 ? (
                <p className="text-xs text-text-secondary">
                  {item.modificadores.map((m) => m.nombre).join(", ")}
                </p>
              ) : null}
              {item.notas ? <p className="text-xs text-text-secondary">Nota: {item.notas}</p> : null}
              <p className="mt-1 font-mono text-xs text-text-secondary">
                {formatearCOP(BigInt(item.subtotalCop))}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="font-display text-sm font-medium text-text-secondary">
          {esPrimerEnvio ? "Carrito" : "Por enviar"}
        </h3>
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
        <span className="font-mono text-lg font-semibold text-text-primary">
          {formatearCOP(totalConfirmado + totalCarritoEnCurso)}
        </span>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {error}
        </p>
      ) : null}

      {soloLectura ? (
        <p className="text-sm text-text-secondary">Este pedido ya no se puede modificar.</p>
      ) : (
        <>
          <ClayButton
            type="button"
            variant="primary"
            size="lg"
            disabled={items.length === 0 || enviando}
            onClick={confirmar}
          >
            {enviando ? "Enviando…" : textoBoton}
          </ClayButton>
          <ClayButton type="button" variant="destructive" onClick={() => setModalCancelarAbierto(true)}>
            Cancelar pedido
          </ClayButton>
        </>
      )}

      <ModalCancelarPedido
        pedido={pedido}
        abierto={modalCancelarAbierto}
        onCerrar={() => setModalCancelarAbierto(false)}
        onCancelar={cancelarPedido}
        onExito={() => {
          setModalCancelarAbierto(false);
          router.push("/inicio");
        }}
      />
    </aside>
  );
}
```

- [ ] **Step 3: `pnpm lint && pnpm test && pnpm build`**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: exit 0 en los tres, 157/157 tests (sin tests nuevos en este task — es un refactor puro sin cambio de comportamiento observable).

- [ ] **Step 4: Verificación manual del comportamiento sin cambios**

Con `pnpm dev` corriendo, entrar como vendedora a un pedido existente (`/pedido/[pedidoId]`) y confirmar que el botón "Cancelar pedido" abre el mismo modal con el mismo texto que antes del refactor (comparar contra la descripción del Bloque B: título "Cancelar pedido", aviso de mesa si aplica, campo de motivo, botones "Volver"/"Confirmar cancelación").

- [ ] **Step 5: Commit**

```bash
git add components/pedido/ModalCancelarPedido.tsx "components/pedido/CarritoPedido.tsx"
git commit -F- <<'MSG'
refactor: extrae ModalCancelarPedido de CarritoPedido para reutilizarlo

MSG
```

---

### Task 2: Migración RLS — cajera ve y cancela pedidos de domicilio/llevar en cualquier estado no terminal

**Files:**
- Create: `supabase/migrations/20260722100000_cajera_ve_cancela_pedidos_en_curso.sql`

**Interfaces:**
- Produces: policy `pedidos_cajera_select` ampliada; nueva policy `pedidos_cajera_cancelar`; función `pedidos_cajera_solo_estado()` ampliada para permitir `motivo_cancelacion` — usadas por la Server Action de la Task 3.

- [ ] **Step 1: Escribir la migración completa**

```sql
-- Bloque C: la cajera necesita ver y cancelar pedidos de domicilio/llevar
-- en CUALQUIER estado no terminal, no solo listo/entregado/cobrado (su
-- alcance hasta ahora, pensado solo para la cola de cobro). Se amplía
-- pedidos_cajera_select para incluir abierto/enviado_cocina/en_preparacion
-- (ve el pedido mientras la vendedora aún lo arma o cocina lo prepara) y
-- cancelado (para poder confirmar visualmente que su propia cancelación
-- surtió efecto).
drop policy if exists pedidos_cajera_select on public.pedidos;

create policy pedidos_cajera_select on public.pedidos
  for select to authenticated
  using (
    public.current_rol() = 'cajera' and sede_id = public.current_sede_id()
    and estado in ('abierto', 'enviado_cocina', 'en_preparacion', 'listo', 'entregado', 'cobrado', 'cancelado')
  );

-- Nueva policy de UPDATE, paralela a pedidos_cajera_update (que solo
-- permite la transición hacia 'cobrado'): permite la transición hacia
-- 'cancelado' desde cualquier estado no terminal. cancelar_pedido (RPC,
-- Bloque B) ya valida ownership/estado por su cuenta con el lock FOR
-- UPDATE -- esta policy solo autoriza la escritura en sí.
create policy pedidos_cajera_cancelar on public.pedidos
  for update to authenticated
  using (
    public.current_rol() = 'cajera' and sede_id = public.current_sede_id()
    and estado not in ('cobrado', 'cerrado', 'anulado', 'cancelado')
  )
  with check (
    public.current_rol() = 'cajera' and sede_id = public.current_sede_id()
    and estado = 'cancelado'
  );

-- pedidos_cajera_solo_estado (Bloque 7) solo permitía cambiar la columna
-- `estado`. cancelar_pedido escribe estado Y motivo_cancelacion en la
-- misma sentencia -- sin este ajuste, el trigger rechazaría la
-- cancelación de la cajera con "La cajera solo puede actualizar el
-- estado del pedido".
create or replace function public.pedidos_cajera_solo_estado()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.current_rol() = 'cajera' then
    if (to_jsonb(new) - 'estado' - 'motivo_cancelacion') is distinct from (to_jsonb(old) - 'estado' - 'motivo_cancelacion') then
      raise exception 'La cajera solo puede actualizar el estado del pedido';
    end if;
  end if;
  return new;
end;
$$;
```

- [ ] **Step 2: Aplicar la migración**

Run: `supabase db push` (confirmar `Y`). Debe terminar sin errores.

- [ ] **Step 3: Confirmar si `lib/supabase/types.ts` necesita cambios**

Run: `supabase gen types typescript --linked > /tmp/types_nuevo.ts`, luego `diff /tmp/types_nuevo.ts lib/supabase/types.ts` (o comparar con `Grep`/`Read` si `diff` no aplica limpio por CRLF). Esta migración no agrega tablas, columnas ni funciones nuevas (solo policies + una función `returns trigger`, que no aparece en el cliente generado) — se espera que no haya diferencias funcionales. Si el diff muestra algo más allá de reordenamiento o diferencias de line-ending, aplicarlo a mano siguiendo el mismo patrón quirúrgico de bloques anteriores.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260722100000_cajera_ve_cancela_pedidos_en_curso.sql
git commit -F- <<'MSG'
feat: cajera ve y cancela pedidos de domicilio/llevar en curso

MSG
```

---

### Task 3: Server Action `cancelarPedidoCajera`

**Files:**
- Create: `app/(cajera)/pedidos-en-curso/actions.ts`

**Interfaces:**
- Consumes: `motivoCancelacionSchema`, `MotivoCancelacionInput` (`lib/validations/cancelacion.ts`, ya existe); RPC `cancelar_pedido` (Task 2, sin cambios de firma).
- Produces: `export async function cancelarPedidoCajera(pedidoId: string, input: MotivoCancelacionInput): Promise<Result<null, DomainError>>` — usada por la página de la Task 4 y el listado de la Task 5.

- [ ] **Step 1: Crear el archivo completo**

```typescript
"use server";

import { z } from "zod";

import { err, ok, type DomainError, type Result } from "@/lib/result";
import { createServerSupabase } from "@/lib/supabase/server";
import { motivoCancelacionSchema, type MotivoCancelacionInput } from "@/lib/validations/cancelacion";

const uuidValido = (valor: string): boolean => z.uuid().safeParse(valor).success;

async function exigirCajera(): Promise<Result<{ cajeraId: string }, DomainError>> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return err({ codigo: "NO_AUTORIZADO", mensaje: "Inicia sesión de nuevo" });
  if (user.app_metadata?.rol !== "cajera") {
    return err({ codigo: "NO_AUTORIZADO", mensaje: "Solo la cajera puede hacer esto" });
  }
  return ok({ cajeraId: user.id });
}

/** Cancela un pedido de domicilio/llevar desde la vista de la cajera
 *  (Bloque C) -- mismo RPC que cancelarPedido de la vendedora (Bloque B),
 *  distinto gate de rol. La cajera nunca agrega productos: por eso este
 *  archivo solo tiene esta acción, sin equivalente a confirmarItemsPedido. */
export async function cancelarPedidoCajera(
  pedidoId: string,
  input: MotivoCancelacionInput,
): Promise<Result<null, DomainError>> {
  const ctx = await exigirCajera();
  if (!ctx.ok) return ctx;
  if (!uuidValido(pedidoId)) {
    return err({ codigo: "VALIDACION", mensaje: "Identificador de pedido inválido" });
  }
  const parsed = motivoCancelacionSchema.safeParse(input);
  if (!parsed.success) {
    return err({ codigo: "VALIDACION", mensaje: parsed.error.issues[0]?.message ?? "Datos inválidos" });
  }
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("cancelar_pedido", {
    p_pedido_id: pedidoId,
    p_motivo: parsed.data.motivo,
  });
  if (error) {
    return err({
      codigo: "VALIDACION",
      mensaje: "No pudimos cancelar el pedido. Verifica que no esté ya cobrado e intenta de nuevo.",
    });
  }

  return ok(null);
}
```

- [ ] **Step 2: `pnpm lint && pnpm build`**

Run: `pnpm lint && pnpm build`
Expected: exit 0 en ambos.

- [ ] **Step 3: Commit**

```bash
git add "app/(cajera)/pedidos-en-curso/actions.ts"
git commit -F- <<'MSG'
feat: Server Action cancelarPedidoCajera

MSG
```

---

### Task 4: Componente compartido `ListadoPedidosEnCurso`

**Files:**
- Create: `components/pedido/ListadoPedidosEnCurso.tsx`

**Interfaces:**
- Consumes: `ModalCancelarPedido` (Task 1), `PedidoVista`/`EstadoPedido`/`CanalPedido` (`components/pedido/tipos.ts`, ya existen).
- Produces: `ListadoPedidosEnCurso` — componente `"use client"` con props:
  ```typescript
  interface ListadoPedidosEnCursoProps {
    pedidos: PedidoVista[];
    variante: "vendedora" | "cajera";
    onCancelar: (pedidoId: string, input: MotivoCancelacionInput) => Promise<Result<null, DomainError>>;
  }
  ```
  Usado por las páginas de las Tasks 5 y 6.

- [ ] **Step 1: Crear el componente completo**

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatearCOP } from "@/lib/money";
import { ClayCard } from "@/components/ui/ClayCard";
import { ClayBadge } from "@/components/ui/ClayBadge";
import { ClayButton } from "@/components/ui/ClayButton";
import { ModalCancelarPedido } from "@/components/pedido/ModalCancelarPedido";
import type { PedidoVista, EstadoPedido } from "@/components/pedido/tipos";
import type { MotivoCancelacionInput } from "@/lib/validations/cancelacion";
import type { DomainError, Result } from "@/lib/result";

const ETIQUETA_CANAL: Record<"domicilio" | "llevar", string> = {
  domicilio: "Domicilio",
  llevar: "Para llevar",
};

const ETIQUETA_ESTADO: Record<EstadoPedido, string> = {
  abierto: "Abierto",
  enviado_cocina: "Enviado a cocina",
  en_preparacion: "En preparación",
  listo: "Listo",
  entregado: "Entregado",
  cobrado: "Cobrado",
  cerrado: "Cerrado",
  anulado: "Anulado",
  cancelado: "Cancelado",
};

interface ListadoPedidosEnCursoProps {
  pedidos: PedidoVista[];
  variante: "vendedora" | "cajera";
  onCancelar: (pedidoId: string, input: MotivoCancelacionInput) => Promise<Result<null, DomainError>>;
}

/** Lista de pedidos de domicilio/llevar en curso, compartida entre la vista
 *  de vendedora (con link a /pedido/[id] para agregar productos) y la de
 *  cajera (solo ver + cancelar, Bloque C). */
export function ListadoPedidosEnCurso({ pedidos, variante, onCancelar }: ListadoPedidosEnCursoProps) {
  const router = useRouter();
  const [pedidoACancelar, setPedidoACancelar] = useState<PedidoVista | null>(null);

  if (pedidos.length === 0) {
    return <p className="text-sm text-brand-crema/70">No hay pedidos de domicilio o para llevar en curso.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {pedidos.map((pedido) => (
        <ClayCard key={pedido.id} variant="flat" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-display text-xl font-semibold text-text-primary">
              Pedido #{pedido.numeroCorto}
            </span>
            <ClayBadge variant="neutral">{ETIQUETA_ESTADO[pedido.estado]}</ClayBadge>
          </div>
          <p className="text-sm text-text-secondary">
            {pedido.canal === "domicilio" || pedido.canal === "llevar" ? ETIQUETA_CANAL[pedido.canal] : pedido.canal}
            {pedido.clienteNombre ? ` — ${pedido.clienteNombre}` : ""}
          </p>
          <p className="font-mono text-lg text-text-primary">{formatearCOP(BigInt(pedido.totalCop))}</p>
          <div className="flex gap-3">
            {variante === "vendedora" ? (
              <Link href={`/pedido/${pedido.id}`}>
                <ClayButton type="button" variant="secondary">
                  Ver / agregar productos
                </ClayButton>
              </Link>
            ) : null}
            <ClayButton type="button" variant="destructive" onClick={() => setPedidoACancelar(pedido)}>
              Cancelar
            </ClayButton>
          </div>
        </ClayCard>
      ))}

      {pedidoACancelar ? (
        <ModalCancelarPedido
          pedido={pedidoACancelar}
          abierto={true}
          onCerrar={() => setPedidoACancelar(null)}
          onCancelar={onCancelar}
          onExito={() => {
            setPedidoACancelar(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: `pnpm lint && pnpm build`**

Run: `pnpm lint && pnpm build`
Expected: exit 0 en ambos (el componente aún no se usa desde ninguna página — se conecta en las Tasks 5 y 6 — pero debe compilar de forma aislada).

- [ ] **Step 3: Commit**

```bash
git add components/pedido/ListadoPedidosEnCurso.tsx
git commit -F- <<'MSG'
feat: componente ListadoPedidosEnCurso compartido

MSG
```

---

### Task 5: Página de la Vendedora — `/pedidos`

**Files:**
- Create: `app/(vendedora)/pedidos/page.tsx`
- Modify: `app/(vendedora)/layout.tsx`

**Interfaces:**
- Consumes: `ListadoPedidosEnCurso` (Task 4), `cancelarPedido` (`app/(vendedora)/pedido/actions.ts`, ya existe del Bloque B, sin cambios de firma).

- [ ] **Step 1: Crear la página**

```typescript
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { ListadoPedidosEnCurso } from "@/components/pedido/ListadoPedidosEnCurso";
import { cancelarPedido } from "@/app/(vendedora)/pedido/actions";
import type { PedidoVista } from "@/components/pedido/tipos";

const ESTADOS_NO_TERMINALES = ["abierto", "enviado_cocina", "en_preparacion", "listo", "entregado"] as const;

export default async function PedidosVendedoraPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.rol !== "vendedora") {
    redirect("/login");
  }

  const { data: pedidosFilas } = await supabase
    .from("pedidos")
    .select("id, numero_corto, canal, estado, cliente_id, subtotal_cop, total_cop")
    .eq("vendedora_id", user.id)
    .in("canal", ["domicilio", "llevar"])
    .in("estado", ESTADOS_NO_TERMINALES)
    .order("numero_corto", { ascending: true });

  const clienteIds = [...new Set((pedidosFilas ?? []).map((p) => p.cliente_id).filter((id): id is string => !!id))];
  const { data: clientesFilas } = clienteIds.length
    ? await supabase.from("clientes_domicilio").select("id, nombre").in("id", clienteIds)
    : { data: [] as { id: string; nombre: string }[] };
  const nombreClientePorId = new Map((clientesFilas ?? []).map((c) => [c.id, c.nombre]));

  const pedidos: PedidoVista[] = (pedidosFilas ?? []).map((p) => ({
    id: p.id,
    numeroCorto: p.numero_corto,
    canal: p.canal as PedidoVista["canal"],
    estado: p.estado as PedidoVista["estado"],
    mesaNumero: null,
    clienteNombre: p.cliente_id ? (nombreClientePorId.get(p.cliente_id) ?? null) : null,
    subtotalCop: p.subtotal_cop,
    totalCop: p.total_cop,
  }));

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Domicilios y para llevar</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">Tus pedidos en curso de domicilio o para llevar.</p>
      <ListadoPedidosEnCurso pedidos={pedidos} variante="vendedora" onCancelar={cancelarPedido} />
    </main>
  );
}
```

- [ ] **Step 2: Agregar el link de navegación en `app/(vendedora)/layout.tsx`**

Reemplazar el contenido completo de `app/(vendedora)/layout.tsx` por:

```typescript
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function VendedoraLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-brand-chocolate">
      <header className="flex items-center justify-between border-b border-white/10 px-8 py-6">
        <Link
          href="/inicio"
          className="inline-flex items-center gap-2 font-display text-lg text-brand-crema/70 transition-colors duration-150 hover:text-brand-crema focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2"
        >
          <ArrowLeft size={20} aria-hidden="true" />
          Ventas
        </Link>
        <Link
          href="/pedidos"
          className="font-display text-sm text-brand-crema/70 transition-colors duration-150 hover:text-brand-crema focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2"
        >
          Domicilios y para llevar
        </Link>
      </header>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: `pnpm lint && pnpm build`**

Run: `pnpm lint && pnpm build`
Expected: exit 0 en ambos.

- [ ] **Step 4: Commit**

```bash
git add "app/(vendedora)/pedidos/page.tsx" "app/(vendedora)/layout.tsx"
git commit -F- <<'MSG'
feat: listado de domicilios/llevar en curso para la vendedora

MSG
```

---

### Task 6: Página de la Cajera — `/pedidos-en-curso`

**Files:**
- Create: `app/(cajera)/pedidos-en-curso/page.tsx`
- Modify: `app/(cajera)/layout.tsx`

**Interfaces:**
- Consumes: `ListadoPedidosEnCurso` (Task 4), `cancelarPedidoCajera` (Task 3).

- [ ] **Step 1: Crear la página**

```typescript
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { ListadoPedidosEnCurso } from "@/components/pedido/ListadoPedidosEnCurso";
import { cancelarPedidoCajera } from "@/app/(cajera)/pedidos-en-curso/actions";
import type { PedidoVista } from "@/components/pedido/tipos";

const ESTADOS_NO_TERMINALES = ["abierto", "enviado_cocina", "en_preparacion", "listo", "entregado"] as const;

export default async function PedidosEnCursoCajeraPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.rol !== "cajera") {
    redirect("/login");
  }

  const { data: pedidosFilas } = await supabase
    .from("pedidos")
    .select("id, numero_corto, canal, estado, cliente_id, subtotal_cop, total_cop")
    .in("canal", ["domicilio", "llevar"])
    .in("estado", ESTADOS_NO_TERMINALES)
    .order("numero_corto", { ascending: true });

  const clienteIds = [...new Set((pedidosFilas ?? []).map((p) => p.cliente_id).filter((id): id is string => !!id))];
  const { data: clientesFilas } = clienteIds.length
    ? await supabase.from("clientes_domicilio").select("id, nombre").in("id", clienteIds)
    : { data: [] as { id: string; nombre: string }[] };
  const nombreClientePorId = new Map((clientesFilas ?? []).map((c) => [c.id, c.nombre]));

  const pedidos: PedidoVista[] = (pedidosFilas ?? []).map((p) => ({
    id: p.id,
    numeroCorto: p.numero_corto,
    canal: p.canal as PedidoVista["canal"],
    estado: p.estado as PedidoVista["estado"],
    mesaNumero: null,
    clienteNombre: p.cliente_id ? (nombreClientePorId.get(p.cliente_id) ?? null) : null,
    subtotalCop: p.subtotal_cop,
    totalCop: p.total_cop,
  }));

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Domicilios y para llevar en curso</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">
        Pedidos de domicilio o para llevar de toda la sede, en cualquier estado.
      </p>
      <ListadoPedidosEnCurso pedidos={pedidos} variante="cajera" onCancelar={cancelarPedidoCajera} />
    </main>
  );
}
```

- [ ] **Step 2: Agregar navegación en `app/(cajera)/layout.tsx`**

Reemplazar el contenido completo de `app/(cajera)/layout.tsx` por:

```typescript
import Link from "next/link";

export default function CajeraLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-brand-chocolate">
      <header className="flex items-center justify-between border-b border-white/10 px-8 py-6">
        <span className="font-display text-lg text-brand-crema/70">Caja</span>
        <Link
          href="/pedidos-en-curso"
          className="font-display text-sm text-brand-crema/70 transition-colors duration-150 hover:text-brand-crema focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2"
        >
          Domicilios y para llevar
        </Link>
      </header>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: `pnpm lint && pnpm build`**

Run: `pnpm lint && pnpm build`
Expected: exit 0 en ambos.

- [ ] **Step 4: Commit**

```bash
git add "app/(cajera)/pedidos-en-curso/page.tsx" "app/(cajera)/layout.tsx"
git commit -F- <<'MSG'
feat: listado de domicilios/llevar en curso para la cajera

MSG
```

---

### Task 7: Verificación en vivo end-to-end

**Files:** Ninguno (verificación manual/curl contra el proyecto Supabase cloud).

**Interfaces:**
- Consumes: todo lo anterior, ya desplegado vía `supabase db push` (Task 2).

- [ ] **Step 1: Correr la suite completa**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: todo verde, 0 fallos.

- [ ] **Step 2: Crear usuarios de prueba temporales**

Dos vendedoras (A y B, mismo mecanismo de sesión-sin-tocar-contraseñas-reales ya usado en el Bloque B: `POST /auth/v1/admin/users` + fila correspondiente en `public.usuarios` + `POST /auth/v1/admin/generate_link` tipo `magiclink` + `POST /auth/v1/verify`) y una cajera de prueba temporal (mismo mecanismo, `rol: "cajera"`).

- [ ] **Step 3: Vendedora A crea un pedido de domicilio con ítems confirmados**

Insertar un `clientes_domicilio` de prueba, luego un pedido `canal='domicilio'` con `vendedora_id` de A y al menos un `pedido_items`, y llamar `recalcular_totales_pedido` con la sesión de A (mismo patrón del Bloque B) para llevarlo a `enviado_cocina`.

- [ ] **Step 4: Vendedora A ve el pedido en su listado; Vendedora B no lo ve**

Confirmar vía `select` con la sesión de cada vendedora (`GET /rest/v1/pedidos?canal=eq.domicilio&estado=eq.enviado_cocina`) que A lo ve y B no — confirma el filtro `vendedora_id = auth.uid()` tanto en RLS como en la query explícita.

- [ ] **Step 5: La cajera ve el mismo pedido (aunque no esté `listo`)**

Con la sesión de la cajera de prueba, `GET /rest/v1/pedidos?id=eq.<pedido_id>` → debe devolver la fila (antes de este bloque, `pedidos_cajera_select` la habría ocultado por estar en `enviado_cocina`).

- [ ] **Step 6: La cajera cancela el pedido**

```bash
curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/cancelar_pedido" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer <access_token_cajera>" \
  -H "Content-Type: application/json" \
  -d '{"p_pedido_id":"<pedido_id>","p_motivo":"Cliente cancelo por telefono"}'
```
Expected: sin error. Confirmar `select estado, motivo_cancelacion from pedidos where id = '<pedido_id>'` → `estado='cancelado'`, motivo guardado — confirma que el trigger ampliado no bloqueó la escritura de `motivo_cancelacion`.

- [ ] **Step 7: La cajera NO puede agregar productos**

Con la sesión de la cajera, intentar `confirmarItemsPedido`/el RPC `recalcular_totales_pedido` sobre un pedido nuevo (o directamente un INSERT en `pedido_items` vía REST) — debe fallar por RLS (`pedido_items` no tiene policy de INSERT para cajera) o, si se prueba vía Server Action, `exigirVendedora()` la rechaza antes de tocar la base de datos.

- [ ] **Step 8: Limpieza de datos de prueba**

Borrar el pedido, ítems, cliente y usuarios de prueba creados. Confirmar con `select` que no queda ningún residuo y que no se tocó ningún dato real (mesas reales, pedidos reales).

- [ ] **Step 9: Actualizar CLAUDE.md si aplica**

Reconciliar CLAUDE.md §6.2 (la línea de Cajera) para reflejar que ahora también ve/cancela pedidos de domicilio/llevar en cualquier estado no terminal, y CLAUDE.md §5 (estructura de carpetas) para agregar `(vendedora)/pedidos/` y `(cajera)/pedidos-en-curso/` a los árboles de rutas.

- [ ] **Step 10: Commit final de documentación si aplica**

```bash
git add CLAUDE.md
git commit -F- <<'MSG'
docs: reconcilia CLAUDE.md con el listado de domicilio/llevar del Bloque C

MSG
```

(Omitir si no hubo cambios.)

---

## Self-Review

**Cobertura del spec:** RLS ampliada + trigger ajustado (Task 2), Server Action de cajera (Task 3), componente compartido de listado (Task 4), página+nav de vendedora (Task 5), página+nav de cajera (Task 6), refactor previo del modal (Task 1, ordenado primero porque las Tasks 4-6 lo consumen), verificación en vivo de los 4 escenarios del spec — visibilidad ampliada de cajera, cancelación de cajera con motivo, aislamiento entre vendedoras, cajera sin poder agregar productos (Task 7).

**Placeholders:** ninguno.

**Consistencia de tipos:** `ModalCancelarPedidoProps.onCancelar` (Task 1) tiene la misma firma `(pedidoId: string, input: MotivoCancelacionInput) => Promise<Result<null, DomainError>>` que `ListadoPedidosEnCursoProps.onCancelar` (Task 4) y que las firmas reales de `cancelarPedido` (ya existe) y `cancelarPedidoCajera` (Task 3) — los tres son intercambiables. `PedidoVista`/`EstadoPedido`/`CanalPedido` (ya existen en `components/pedido/tipos.ts`) se usan sin modificación en las Tasks 4, 5 y 6.
