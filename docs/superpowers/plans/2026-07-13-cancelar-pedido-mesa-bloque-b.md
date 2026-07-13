# Bloque B — Cancelar pedido de mesa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que la vendedora cancele su propio pedido (de cualquier canal, con foco inicial en mesa) antes de que se cobre, liberando la mesa automáticamente si aplica, con motivo obligatorio.

**Architecture:** Nuevo estado `cancelado` en el enum `estado_pedido` (distinto de `anulado`, reservado a reversión admin post-cobro). RPC atómico `cancelar_pedido` (lock `FOR UPDATE`, transición de estado + liberación condicional de mesa en una sola sentencia, `security invoker` apoyado en RLS ya existente/ampliada). Server Action `cancelarPedido` que valida el motivo con Zod y traduce errores de Postgres a `DomainError`. Botón "Cancelar pedido" en `CarritoPedido.tsx` con un modal de motivo.

**Tech Stack:** Next.js 15 Server Actions, Supabase Postgres (RLS + RPC `plpgsql`), Zod, react-hook-form, vitest.

## Global Constraints

- Dinero en `bigint`/centavos — no aplica en este bloque (sin montos nuevos).
- Español de Colombia en todo texto visible al usuario (CLAUDE.md §13.11).
- Nunca confiar en el rol/estado que declara el cliente — toda transición de estado se valida en RLS y/o dentro del RPC (CLAUDE.md §13.2).
- Result pattern (`Result<T, DomainError>`) para toda Server Action — nunca `throw` en dominio (CLAUDE.md §12).
- Motivo obligatorio, mínimo 5 y máximo 500 caracteres (mismo patrón que `motivoAnulacionSchema`).
- Cancelación permitida en cualquier estado no terminal (`abierto`, `enviado_cocina`, `en_preparacion`, `listo`, `entregado`) — nunca sobre `cobrado`, `cerrado`, `anulado` o ya `cancelado`.
- `pnpm lint && pnpm test && pnpm build` deben quedar en verde al final de cada tarea. 152 tests en `main` a la fecha de este plan (confirmado corriendo `pnpm test`); la Task 3 agrega 5 más.
- Windows: `git commit -F <tempfile>` en vez de heredocs/here-strings (fallan en PowerShell 5.1). Trailer de commit: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- `lib/supabase/types.ts` tiene CRLF+BOM — nunca sobreescribirlo completo con `supabase gen types`; aplicar el diff a mano.

---

### Task 1: Migración — nuevo valor de enum `cancelado`

**Files:**
- Create: `supabase/migrations/20260721100000_estado_pedido_cancelado.sql`

**Interfaces:**
- Produces: valor `'cancelado'` disponible en el tipo `public.estado_pedido`, usable por cualquier migración/RPC posterior (Postgres exige que un valor de enum nuevo esté confirmado en una transacción separada antes de poder usarse en un `WHERE`/`CHECK`/comparación — por eso va en su propia migración).

- [ ] **Step 1: Escribir la migración**

```sql
-- Bloque B: la vendedora cancela su propio pedido antes de cobrar (ej. el
-- cliente se retira). Es una acción distinta de anular_pedido (Bloque 8),
-- que es EXCLUSIVA para que un admin revierta un pedido YA cobrado
-- (CLAUDE.md §2.2) y alimenta la tabla anulaciones/el reporte de
-- anulaciones. Reusar 'anulado' aquí rompería el invariante "todo pedido
-- anulado tiene fila en anulaciones". 'cancelado' se agrega en su propia
-- migración porque Postgres no permite usar un valor de enum recién creado
-- en la misma transacción que lo agrega.
alter type public.estado_pedido add value 'cancelado';
```

- [ ] **Step 2: Aplicar la migración**

Run: `supabase db push` (confirmar `Y`). Debe terminar sin errores.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260721100000_estado_pedido_cancelado.sql
git commit -F- <<'MSG'
feat: agrega estado cancelado al enum estado_pedido

MSG
```

(En PowerShell usar `git commit -F <tempfile>` con el mensaje escrito a un archivo temporal en vez de heredoc.)

---

### Task 2: Migración — columna, RLS ampliada y RPC `cancelar_pedido`

**Files:**
- Create: `supabase/migrations/20260721110000_cancelar_pedido.sql`
- Modify: `lib/supabase/types.ts` (diff quirúrgico, no sobreescritura completa)

**Interfaces:**
- Consumes: valor de enum `'cancelado'` (Task 1).
- Produces: columna `pedidos.motivo_cancelacion text`; RPC `public.cancelar_pedido(p_pedido_id uuid, p_motivo text) returns void`, `security invoker`, `grant to authenticated` solamente — usado por la Server Action de la Task 4.

- [ ] **Step 1: Escribir la migración completa**

```sql
-- Bloque B: columna para el motivo de cancelación (no una tabla nueva tipo
-- anulaciones -- ya se audita gratis vía pg_audit_trigger, ya adjunto a
-- pedidos desde el Bloque 8).
alter table public.pedidos add column motivo_cancelacion text;

-- pedidos_vendedora_update (20260712150000): el WITH CHECK no incluía
-- 'cancelado' como aterrizaje válido, y el USING no lo excluía como estado
-- terminal -- sin este reemplazo, cancelar_pedido (security invoker)
-- recibiría "new row violates row-level security policy".
drop policy if exists pedidos_vendedora_update on public.pedidos;

create policy pedidos_vendedora_update on public.pedidos
  for update to authenticated
  using (
    public.current_rol() = 'vendedora' and vendedora_id = auth.uid() and sede_id = public.current_sede_id()
    and estado not in ('cobrado', 'cerrado', 'anulado', 'cancelado')
  )
  with check (
    public.current_rol() = 'vendedora' and vendedora_id = auth.uid() and sede_id = public.current_sede_id()
    and estado in ('abierto', 'enviado_cocina', 'en_preparacion', 'listo', 'entregado', 'cancelado')
  );

-- mesas_vendedora_update_estado (20260719110000) solo permitía libre ->
-- ocupada. Se amplía para permitir también ocupada -> libre, simétrico a
-- como mesas_cajera_update_estado ya libera la mesa al cobrar.
drop policy if exists mesas_vendedora_update_estado on public.mesas;

create policy mesas_vendedora_update_estado on public.mesas
  for update to authenticated
  using (
    public.current_rol() = 'vendedora'
    and sede_id = public.current_sede_id()
    and estado in ('libre', 'ocupada')
    and activa = true
  )
  with check (
    public.current_rol() = 'vendedora'
    and sede_id = public.current_sede_id()
    and estado in ('libre', 'ocupada')
  );

-- cancelar_pedido: RPC atómico. Lock FOR UPDATE sobre la fila del pedido
-- (mismo patrón que cobrar_pedido), valida motivo y estado no terminal,
-- transiciona a 'cancelado' y libera la mesa en la misma sentencia si
-- canal='mesa'. security invoker: el UPDATE de pedidos pasa por
-- pedidos_vendedora_update (ownership ya validado ahí) y el de mesas por
-- mesas_vendedora_update_estado ampliada arriba. Genérico por canal (el
-- "if v_canal = 'mesa'" es la única rama condicional) para que el Bloque C
-- reutilice este mismo RPC sin cambios.
create or replace function public.cancelar_pedido(
  p_pedido_id uuid,
  p_motivo text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_estado public.estado_pedido;
  v_canal public.canal_pedido;
  v_mesa_id uuid;
begin
  if length(trim(p_motivo)) < 5 then
    raise exception 'Escribe un motivo de al menos 5 caracteres';
  end if;

  select estado, canal, mesa_id into v_estado, v_canal, v_mesa_id
  from public.pedidos
  where id = p_pedido_id
  for update;

  if v_estado is null then
    raise exception 'Pedido no encontrado o sin permiso';
  end if;

  if v_estado in ('cobrado', 'cerrado', 'anulado', 'cancelado') then
    raise exception 'Este pedido ya no se puede cancelar';
  end if;

  update public.pedidos
  set estado = 'cancelado', motivo_cancelacion = p_motivo
  where id = p_pedido_id;

  if v_canal = 'mesa' and v_mesa_id is not null then
    update public.mesas
    set estado = 'libre'
    where id = v_mesa_id and estado = 'ocupada';
  end if;
end;
$$;

revoke execute on function public.cancelar_pedido(uuid, text) from public;
revoke execute on function public.cancelar_pedido(uuid, text) from anon;
grant execute on function public.cancelar_pedido(uuid, text) to authenticated;
```

- [ ] **Step 2: Aplicar la migración**

Run: `supabase db push` (confirmar `Y`). Debe terminar sin errores.

- [ ] **Step 3: Regenerar tipos y aplicar el diff quirúrgicamente**

```bash
supabase gen types typescript --linked > /tmp/types_nuevo.ts
```

Aplicar SOLO los cambios de esta migración a `lib/supabase/types.ts` a mano (no sobreescribir el archivo completo — precedente CRLF+BOM documentado en todos los bloques anteriores):
- En la tabla `pedidos` dentro de `Tables`, agregar `motivo_cancelacion: string | null` a `Row`, `Insert` (opcional) y `Update` (opcional).
- En el enum `estado_pedido` (aparece embebido como union de string literals en varios lugares del archivo generado — típicamente en `Enums` y en cualquier columna tipada `estado`), agregar `"cancelado"` a la unión.
- En `Functions`, agregar la entrada de `cancelar_pedido` con `Args: { p_pedido_id: string; p_motivo: string }` y `Returns: undefined`.

- [ ] **Step 4: Verificación en vivo con curl (anon no puede llamar cancelar_pedido)**

```bash
cd /c/PROYECTOS/CRIOLLITAS
set -a; source .env.local; set +a
curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/cancelar_pedido" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_pedido_id":"00000000-0000-0000-0000-000000000000","p_motivo":"prueba"}'
```

Expected: error de permiso (function not found / permission denied for the anon role) — igual que `anular_pedido` en el Bloque 8, confirmando que `revoke ... from anon` surtió efecto.

- [ ] **Step 5: `pnpm build` para confirmar que `types.ts` sigue siendo TypeScript válido**

Run: `pnpm build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260721110000_cancelar_pedido.sql lib/supabase/types.ts
git commit -F- <<'MSG'
feat: RPC cancelar_pedido con liberación automática de mesa

MSG
```

---

### Task 3: Validación Zod `motivoCancelacionSchema`

**Files:**
- Create: `lib/validations/cancelacion.ts`
- Test: `tests/unit/validations-cancelacion.test.ts`

**Interfaces:**
- Produces: `motivoCancelacionSchema: z.ZodObject<{ motivo: z.ZodString }>`, `type MotivoCancelacionInput = z.infer<typeof motivoCancelacionSchema>` — usados por la Server Action (Task 4) y el formulario (Task 6).

- [ ] **Step 1: Escribir el test que falla**

```typescript
import { describe, expect, it } from "vitest";
import { motivoCancelacionSchema } from "@/lib/validations/cancelacion";

describe("motivoCancelacionSchema", () => {
  it("acepta un motivo válido", () => {
    expect(motivoCancelacionSchema.safeParse({ motivo: "Cliente se retiró" }).success).toBe(true);
  });

  it("rechaza un motivo de menos de 5 caracteres", () => {
    expect(motivoCancelacionSchema.safeParse({ motivo: "Hola" }).success).toBe(false);
  });

  it("rechaza un motivo vacío", () => {
    expect(motivoCancelacionSchema.safeParse({ motivo: "" }).success).toBe(false);
  });

  it("rechaza un motivo de más de 500 caracteres", () => {
    expect(motivoCancelacionSchema.safeParse({ motivo: "a".repeat(501) }).success).toBe(false);
  });

  it("acepta exactamente 5 y exactamente 500 caracteres", () => {
    expect(motivoCancelacionSchema.safeParse({ motivo: "a".repeat(5) }).success).toBe(true);
    expect(motivoCancelacionSchema.safeParse({ motivo: "a".repeat(500) }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `pnpm test tests/unit/validations-cancelacion.test.ts`
Expected: FAIL — `Cannot find module '@/lib/validations/cancelacion'`.

- [ ] **Step 3: Implementar el schema**

```typescript
import { z } from "zod";

export const motivoCancelacionSchema = z.object({
  motivo: z
    .string()
    .min(5, "Escribe un motivo de al menos 5 caracteres")
    .max(500, "El motivo es demasiado largo"),
});
export type MotivoCancelacionInput = z.infer<typeof motivoCancelacionSchema>;
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `pnpm test tests/unit/validations-cancelacion.test.ts`
Expected: PASS — 5/5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/validations/cancelacion.ts tests/unit/validations-cancelacion.test.ts
git commit -F- <<'MSG'
feat: esquema Zod de motivo de cancelación de pedido

MSG
```

---

### Task 4: Server Action `cancelarPedido`

**Files:**
- Modify: `app/(vendedora)/pedido/actions.ts`

**Interfaces:**
- Consumes: `motivoCancelacionSchema`, `MotivoCancelacionInput` (Task 3); `exigirVendedora()`, `uuidValido()` (ya existen en este archivo, sin cambios de firma); RPC `cancelar_pedido` (Task 2).
- Produces: `export async function cancelarPedido(pedidoId: string, input: MotivoCancelacionInput): Promise<Result<null, DomainError>>` — usada por la UI (Task 6).

- [ ] **Step 1: Agregar el import y la función al final del archivo**

En `app/(vendedora)/pedido/actions.ts`, agregar el import junto a los existentes (línea 9, junto a `enviarPedidoSchema`):

```typescript
import { motivoCancelacionSchema, type MotivoCancelacionInput } from "@/lib/validations/cancelacion";
```

Y agregar al final del archivo (después de `crearPedidoConItems`):

```typescript
/** Cancela un pedido propio antes de cobrarlo (ej. el cliente se retira).
 *  Estado distinto de `anulado` -- ese es exclusivo de la reversión admin
 *  post-cobro (Bloque 8, CLAUDE.md §2.2). El RPC libera la mesa si aplica. */
export async function cancelarPedido(
  pedidoId: string,
  input: MotivoCancelacionInput,
): Promise<Result<null, DomainError>> {
  const ctx = await exigirVendedora();
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

  revalidatePath(`/pedido/${pedidoId}`);
  revalidatePath("/inicio");
  return ok(null);
}
```

- [ ] **Step 2: `pnpm lint` y `pnpm build`**

Run: `pnpm lint && pnpm build`
Expected: exit 0 en ambos (sin lógica de negocio pura nueva que testear aquí — el RPC ya se verificó en vivo en la Task 2; el resto de la función es transcripción del patrón ya usado en `anularPedido`, cubierto por la verificación en vivo de la Task 7).

- [ ] **Step 3: Commit**

```bash
git add "app/(vendedora)/pedido/actions.ts"
git commit -F- <<'MSG'
feat: Server Action cancelarPedido para la vendedora

MSG
```

---

### Task 5: Estado `cancelado` en tipos de UI y pantalla de solo lectura

**Files:**
- Modify: `components/pedido/tipos.ts`
- Modify: `components/pedido/PedidoEditor.tsx`

**Interfaces:**
- Produces: `EstadoPedido` (en `tipos.ts`) incluye `"cancelado"`; `ESTADOS_TERMINALES` (en `PedidoEditor.tsx`) incluye `"cancelado"` — usado por la Task 6 para no ofrecer el botón de cancelar sobre un pedido ya cancelado.

- [ ] **Step 1: Agregar `"cancelado"` al tipo `EstadoPedido`**

En `components/pedido/tipos.ts:1-9`, reemplazar:

```typescript
export type EstadoPedido =
  | "abierto"
  | "enviado_cocina"
  | "en_preparacion"
  | "listo"
  | "entregado"
  | "cobrado"
  | "cerrado"
  | "anulado";
```

por:

```typescript
export type EstadoPedido =
  | "abierto"
  | "enviado_cocina"
  | "en_preparacion"
  | "listo"
  | "entregado"
  | "cobrado"
  | "cerrado"
  | "anulado"
  | "cancelado";
```

- [ ] **Step 2: Agregar `"cancelado"` a `ESTADOS_TERMINALES`**

En `components/pedido/PedidoEditor.tsx:18`, reemplazar:

```typescript
const ESTADOS_TERMINALES = new Set(["cobrado", "cerrado", "anulado"]);
```

por:

```typescript
const ESTADOS_TERMINALES = new Set(["cobrado", "cerrado", "anulado", "cancelado"]);
```

Y en el comentario de la línea 21 (que dice "cobrado/cerrado/anulado"), agregar "/cancelado" para que siga describiendo el conjunto real.

- [ ] **Step 3: `pnpm build`**

Run: `pnpm build`
Expected: exit 0. (No hay test unitario dedicado a este cambio — es un ajuste de tipo/constante ya cubierto transitivamente por los tests de `PedidoEditor` si existen, y por la verificación en vivo de la Task 7).

- [ ] **Step 4: Commit**

```bash
git add components/pedido/tipos.ts "components/pedido/PedidoEditor.tsx"
git commit -F- <<'MSG'
feat: agrega estado cancelado a los tipos de UI del pedido

MSG
```

---

### Task 6: Botón "Cancelar pedido" con modal de motivo en `CarritoPedido`

**Files:**
- Modify: `components/pedido/CarritoPedido.tsx`

**Interfaces:**
- Consumes: `cancelarPedido` (Task 4), `motivoCancelacionSchema`/`MotivoCancelacionInput` (Task 3), `ClayModal` (ya existe en `components/ui/ClayModal.tsx`, props `{abierto, titulo, onCerrar, children}`), `ClayInput`, `ClayButton` (ya existen, mismo patrón que `BuscadorPedidoAnular.tsx`).
- Produces: nada consumido por otras tasks — es la hoja final de este plan.

- [ ] **Step 1: Agregar los imports**

En `components/pedido/CarritoPedido.tsx`, junto a los imports existentes (líneas 1-10):

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatearCOP, montoDesdePesos, multiplicar, sumar } from "@/lib/money";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayBadge } from "@/components/ui/ClayBadge";
import { ClayModal } from "@/components/ui/ClayModal";
import { ClayInput } from "@/components/ui/ClayInput";
import { useCarritoStore } from "@/lib/pedido/carritoStore";
import { confirmarItemsPedido, cancelarPedido } from "@/app/(vendedora)/pedido/actions";
import { motivoCancelacionSchema, type MotivoCancelacionInput } from "@/lib/validations/cancelacion";
import type { ItemConfirmadoVista, PedidoVista } from "@/components/pedido/tipos";
```

- [ ] **Step 2: Agregar el estado del modal y el formulario dentro de `CarritoPedido`**

Justo después de la línea `const [error, setError] = useState<string | null>(null);` (línea 32 actual), agregar:

```typescript
  const [modalCancelarAbierto, setModalCancelarAbierto] = useState(false);
  const [errorCancelar, setErrorCancelar] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MotivoCancelacionInput>({ resolver: zodResolver(motivoCancelacionSchema) });

  function cerrarModalCancelar() {
    reset();
    setErrorCancelar(null);
    setModalCancelarAbierto(false);
  }

  const onSubmitCancelar = handleSubmit(async (datos) => {
    setErrorCancelar(null);
    setCancelando(true);
    const resultado = await cancelarPedido(pedido.id, datos);
    setCancelando(false);
    if (!resultado.ok) {
      setErrorCancelar(resultado.error.mensaje);
      return;
    }
    reset();
    setModalCancelarAbierto(false);
    router.push("/inicio");
  });
```

- [ ] **Step 3: Agregar el botón y el modal al JSX**

Dentro del `return`, reemplazar el bloque final (líneas 163-175 actuales):

```typescript
      {soloLectura ? (
        <p className="text-sm text-text-secondary">Este pedido ya no se puede modificar.</p>
      ) : (
        <ClayButton
          type="button"
          variant="primary"
          size="lg"
          disabled={items.length === 0 || enviando}
          onClick={confirmar}
        >
          {enviando ? "Enviando…" : textoBoton}
        </ClayButton>
      )}
```

por:

```typescript
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
          <ClayButton
            type="button"
            variant="destructive"
            onClick={() => setModalCancelarAbierto(true)}
          >
            Cancelar pedido
          </ClayButton>
        </>
      )}

      <ClayModal abierto={modalCancelarAbierto} titulo="Cancelar pedido" onCerrar={cerrarModalCancelar}>
        <form onSubmit={onSubmitCancelar} className="flex flex-col gap-4" noValidate>
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
            <ClayButton type="button" variant="ghost" onClick={cerrarModalCancelar}>
              Volver
            </ClayButton>
            <ClayButton type="submit" variant="destructive" disabled={cancelando}>
              {cancelando ? "Cancelando…" : "Confirmar cancelación"}
            </ClayButton>
          </div>
        </form>
      </ClayModal>
```

- [ ] **Step 4: `pnpm lint` y `pnpm build`**

Run: `pnpm lint && pnpm build`
Expected: exit 0 en ambos.

- [ ] **Step 5: Commit**

```bash
git add "components/pedido/CarritoPedido.tsx"
git commit -F- <<'MSG'
feat: botón y modal para cancelar un pedido desde el carrito

MSG
```

---

### Task 7: Verificación en vivo end-to-end

**Files:** Ninguno (verificación manual/curl contra el proyecto Supabase cloud, sin cambios de código).

**Interfaces:**
- Consumes: todo lo anterior, desplegado vía `supabase db push` (ya aplicado en Task 2) y corriendo localmente (`pnpm dev`) o en producción tras el merge.

- [ ] **Step 1: Correr la suite completa**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: todo verde, 0 fallos.

- [ ] **Step 2: Crear una vendedora de prueba temporal y una mesa libre de prueba**

Usar el mismo mecanismo de sesión-sin-tocar-contraseñas-reales ya usado en bloques anteriores (`POST /auth/v1/admin/generate_link` tipo `magiclink` + `POST /auth/v1/verify`) para obtener un `access_token` de una vendedora real o de una vendedora de prueba temporal creada para este fin. Confirmar con `select * from mesas where sede_id = '<sede>' and estado = 'libre'` cuál mesa usar, o crear una temporal.

- [ ] **Step 3: Flujo feliz — cancelar un pedido de mesa con ítems ya enviados**

Con el `access_token` de la vendedora:
1. `crearPedidoConItems({canal:"mesa", mesaId:"<mesa libre>"}, {items:[...]})` (vía la app, no curl — es un Server Action) o directamente insertando como ya se hizo en Bloque A. Confirmar que la mesa pasa a `ocupada`.
2. Llamar `cancelar_pedido` vía curl:
```bash
curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/cancelar_pedido" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer <access_token_vendedora>" \
  -H "Content-Type: application/json" \
  -d '{"p_pedido_id":"<pedido_id>","p_motivo":"Cliente se retiró"}'
```
Expected: `204` sin body de error.
3. Confirmar en base de datos: `select estado, motivo_cancelacion from pedidos where id = '<pedido_id>'` → `estado = 'cancelado'`, `motivo_cancelacion = 'Cliente se retiró'`.
4. Confirmar: `select estado from mesas where id = '<mesa_id>'` → `'libre'`.

- [ ] **Step 4: Motivo inválido — rechazado**

```bash
curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/cancelar_pedido" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer <access_token_vendedora>" \
  -H "Content-Type: application/json" \
  -d '{"p_pedido_id":"<otro_pedido_id_valido>","p_motivo":"ab"}'
```
Expected: error `"Escribe un motivo de al menos 5 caracteres"`.

- [ ] **Step 5: Pedido ya cobrado — rechazado, mesa intacta**

Cobrar un pedido de prueba (mismo flujo del Bloque 7), luego intentar cancelarlo:
Expected: error `"Este pedido ya no se puede cancelar"`. Confirmar que la mesa asociada sigue en el estado en que estaba antes del intento (no se toca si el `UPDATE pedidos` falla primero — el `raise exception` aborta toda la transacción).

- [ ] **Step 6: Otra vendedora no puede cancelar el pedido ajeno**

Con el `access_token` de una vendedora distinta a la dueña del pedido, repetir el Step 3 sobre un pedido de la primera vendedora.
Expected: error `"Pedido no encontrado o sin permiso"` (RLS de `pedidos_vendedora_update` filtra por `vendedora_id = auth.uid()`, así que el `select ... for update` inicial no encuentra la fila para esa sesión).

- [ ] **Step 7: Limpieza de datos de prueba**

Borrar cualquier pedido/mesa/usuario de prueba creado exclusivamente para esta verificación (nunca tocar datos reales de producción). Confirmar con `select` que no queda ningún residuo.

- [ ] **Step 8: Actualizar CLAUDE.md si aplica**

Si el modelo de datos (§7) o las políticas RLS (§6.2) descritas en `CLAUDE.md` quedaron desactualizadas por este bloque (nuevo estado `cancelado`, nueva columna `motivo_cancelacion`, policy de mesas ampliada), reconciliar esas secciones con una nota breve, siguiendo el mismo estilo usado para el fix del ciclo de vida de mesa.

- [ ] **Step 9: Commit final si hubo cambios de documentación**

```bash
git add CLAUDE.md
git commit -F- <<'MSG'
docs: reconcilia CLAUDE.md con el estado cancelado del Bloque B

MSG
```

(Omitir este paso si `CLAUDE.md` no necesitó cambios.)

---

## Self-Review

**Cobertura del spec:** estado `cancelado` (Task 1), columna+RLS+RPC (Task 2), motivo obligatorio ≥5 chars (Task 3+2), Server Action (Task 4), tipos de UI (Task 5), botón+modal (Task 6), verificación en vivo de los 4 escenarios del spec — flujo feliz, motivo inválido, pedido ya cobrado, ownership — (Task 7). El diseño genérico por canal del RPC (spec: "reutilizarse en Bloque C") queda cubierto en la Task 2 sin necesitar tarea propia — es una propiedad del RPC tal como está escrito, no una feature adicional.

**Placeholders:** ninguno — todo código está completo, sin TBD/TODO.

**Consistencia de tipos:** `cancelarPedido(pedidoId: string, input: MotivoCancelacionInput): Promise<Result<null, DomainError>>` es el mismo tipo en la Task 4 (definición) y la Task 6 (consumo). `motivoCancelacionSchema`/`MotivoCancelacionInput` son el mismo nombre en Task 3 (definición), Task 4 y Task 6 (consumo). `EstadoPedido` incluye `"cancelado"` desde la Task 5, antes de que la Task 6 lo necesite indirectamente vía `pedido.estado`/`pedido.canal` (ya presentes en `PedidoVista`).
