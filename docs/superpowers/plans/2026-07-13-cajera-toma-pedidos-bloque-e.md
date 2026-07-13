# Bloque E — La Cajera toma pedidos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la Cajera pueda tomar pedidos de los 3 canales (mesa, domicilio, llevar) exactamente igual que la Vendedora, reutilizando las mismas rutas/componentes/RPCs sin duplicar nada.

**Architecture:** Se amplían los predicados de rol de las policies RLS ya existentes (`current_rol() = 'vendedora'` → `current_rol() in ('vendedora', 'cajera')`), se renombran los dos helpers `exigirVendedora()` a `exigirVendedoraOCajera()` con el chequeo ampliado, se amplía el middleware para dejar entrar a la cajera a `/inicio`, `/pedido`, `/mis-pedidos`, y se agrega un link de navegación desde el layout de cajera.

**Tech Stack:** Supabase Postgres (RLS, sin RPCs ni columnas nuevas), Next.js Server Actions/middleware.

## Global Constraints

- Español de Colombia en todo texto visible (CLAUDE.md §13.11).
- Los 3 canales por igual (mesa, domicilio, llevar) — paridad completa, no solo domicilio/llevar.
- Ampliar predicados existentes en vez de duplicar policies — la cajera necesita exactamente el mismo permiso que la vendedora, no una variante.
- Sin cambios a policies/rutas/RPCs de cocina, ni a `pedidos_cajera_cancelar`/`pedidos_cajera_update` (cobro) — ya cubren lo que necesitan sin tocarlos.
- `pnpm lint && pnpm test && pnpm build` deben quedar en verde al final de cada tarea. 157 tests en `main` a la fecha de este plan.
- Windows: `git commit -F <tempfile>` en vez de heredocs. Trailer: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: Migración RLS — ampliar predicados de rol y consolidar policies de mesa

**Files:**
- Create: `supabase/migrations/20260724100000_cajera_toma_pedidos.sql`

**Interfaces:**
- Produces: 6 policies de `pedidos`/`pedido_items`/`pedido_item_mods` ampliadas a `current_rol() in ('vendedora', 'cajera')`; 1 policy de `mesas` consolidada y bidireccional para ambos roles; `mesas_cajera_update_estado` eliminada (redundante) — consumidas por las Server Actions de la Task 2 y verificadas en vivo en la Task 4.

- [ ] **Step 1: Escribir la migración completa**

```sql
-- Bloque E: la cajera toma pedidos igual que la vendedora, en los 3
-- canales (decisión confirmada con el usuario). Se amplía el predicado de
-- rol de las policies ya existentes en vez de duplicarlas -- la cajera
-- necesita exactamente el mismo permiso que la vendedora, no una variante.
-- El resto de cada predicado (ownership vía vendedora_id = auth.uid(),
-- sede_id, transiciones de estado permitidas) no cambia.

drop policy if exists pedidos_vendedora_select on public.pedidos;
create policy pedidos_vendedora_select on public.pedidos
  for select to authenticated
  using (
    public.current_rol() in ('vendedora', 'cajera') and vendedora_id = auth.uid() and sede_id = public.current_sede_id()
  );

drop policy if exists pedidos_vendedora_insert on public.pedidos;
create policy pedidos_vendedora_insert on public.pedidos
  for insert to authenticated
  with check (
    public.current_rol() in ('vendedora', 'cajera') and vendedora_id = auth.uid() and sede_id = public.current_sede_id()
  );

drop policy if exists pedidos_vendedora_update on public.pedidos;
create policy pedidos_vendedora_update on public.pedidos
  for update to authenticated
  using (
    public.current_rol() in ('vendedora', 'cajera') and vendedora_id = auth.uid() and sede_id = public.current_sede_id()
    and estado not in ('cobrado', 'cerrado', 'anulado', 'cancelado')
  )
  with check (
    public.current_rol() in ('vendedora', 'cajera') and vendedora_id = auth.uid() and sede_id = public.current_sede_id()
    and estado in ('abierto', 'enviado_cocina', 'en_preparacion', 'listo', 'entregado', 'cancelado')
  );

-- pedidos_vendedora_delete (Bloque A, rollback de pedido vacío si
-- confirmarItemsPedido falla tras crear la fila): sin ampliar esta, el
-- rollback de un pedido creado por la cajera fallaría silenciosamente
-- (RLS deniega, 0 filas, sin error) y dejaría una fila 'abierto' huérfana
-- -- rompe el invariante "sin productos, no hay pedido" del Bloque A.
drop policy if exists pedidos_vendedora_delete on public.pedidos;
create policy pedidos_vendedora_delete on public.pedidos
  for delete to authenticated
  using (
    public.current_rol() in ('vendedora', 'cajera')
    and vendedora_id = auth.uid()
    and sede_id = public.current_sede_id()
    and estado = 'abierto'
  );

drop policy if exists pedido_items_vendedora_delete on public.pedido_items;
create policy pedido_items_vendedora_delete on public.pedido_items
  for delete to authenticated
  using (exists (
    select 1 from public.pedidos p
    where p.id = pedido_items.pedido_id
      and p.vendedora_id = auth.uid()
      and p.estado = 'abierto'
      and public.current_rol() in ('vendedora', 'cajera')
  ));

drop policy if exists pedido_item_mods_vendedora_delete on public.pedido_item_mods;
create policy pedido_item_mods_vendedora_delete on public.pedido_item_mods
  for delete to authenticated
  using (exists (
    select 1 from public.pedido_items pi
    join public.pedidos p on p.id = pi.pedido_id
    where pi.id = pedido_item_mods.pedido_item_id
      and p.vendedora_id = auth.uid()
      and p.estado = 'abierto'
      and public.current_rol() in ('vendedora', 'cajera')
  ));

-- Consolidación de mesas: mesas_vendedora_update_estado (libre<->ocupada,
-- solo vendedora) y mesas_cajera_update_estado (solo ocupada->libre, para
-- el cobro) se funden en una sola policy bidireccional para ambos roles
-- -- la policy de cajera queda redundante y se elimina.
drop policy if exists mesas_vendedora_update_estado on public.mesas;
drop policy if exists mesas_cajera_update_estado on public.mesas;

create policy mesas_staff_update_estado on public.mesas
  for update to authenticated
  using (
    public.current_rol() in ('vendedora', 'cajera')
    and sede_id = public.current_sede_id()
    and estado in ('libre', 'ocupada')
    and activa = true
  )
  with check (
    public.current_rol() in ('vendedora', 'cajera')
    and sede_id = public.current_sede_id()
    and estado in ('libre', 'ocupada')
  );
```

- [ ] **Step 2: Aplicar la migración**

Run: `supabase db push` (confirmar `Y`). Debe terminar sin errores.

- [ ] **Step 3: Confirmar si `lib/supabase/types.ts` necesita cambios**

Run: `supabase gen types typescript --linked > /tmp/types_nuevo.ts`, luego `diff <(tr -d '\r' < /tmp/types_nuevo.ts) <(tr -d '\r' < lib/supabase/types.ts)`. Esta migración solo toca policies (sin tablas/columnas/funciones nuevas) — se espera que las únicas diferencias sean ruido del CLI (mensajes de login/versión). Si aparece algo más, aplicarlo a mano con el mismo patrón quirúrgico de bloques anteriores.

- [ ] **Step 4: `pnpm build`**

Run: `pnpm build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260724100000_cajera_toma_pedidos.sql
git commit -F- <<'MSG'
feat: RLS permite a la cajera tomar pedidos igual que la vendedora

MSG
```

---

### Task 2: Renombrar `exigirVendedora` a `exigirVendedoraOCajera` y ampliar los 3 chequeos de rol

**Files:**
- Modify: `app/(vendedora)/pedido/actions.ts`
- Modify: `app/(vendedora)/inicio/actions.ts`
- Modify: `app/(vendedora)/mis-pedidos/page.tsx`

**Interfaces:**
- Consumes: policies ampliadas (Task 1).
- Produces: `exigirVendedoraOCajera()` en ambos archivos de acciones (mismos tipos de retorno que antes: `Promise<Result<{ vendedoraId: string; sedeId: string }, DomainError>>` en `pedido/actions.ts`, `Promise<Result<ContextoVendedora, DomainError>>` en `inicio/actions.ts`) — el nombre del campo interno `vendedoraId` no cambia.

- [ ] **Step 1: `app/(vendedora)/pedido/actions.ts` — renombrar el helper y ampliar el chequeo**

Reemplazar:

```typescript
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
```

por:

```typescript
async function exigirVendedoraOCajera(): Promise<Result<{ vendedoraId: string; sedeId: string }, DomainError>> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return err({ codigo: "NO_AUTORIZADO", mensaje: "Inicia sesión de nuevo" });
  if (user.app_metadata?.rol !== "vendedora" && user.app_metadata?.rol !== "cajera") {
    return err({ codigo: "NO_AUTORIZADO", mensaje: "Solo la vendedora o la cajera pueden editar este pedido" });
  }
  return ok({
    vendedoraId: user.id,
    sedeId: (user.app_metadata?.sede_id as string) ?? SEDE_DEFAULT_ID,
  });
}
```

Luego actualizar los 3 call sites en el mismo archivo (`confirmarItemsPedido`, `crearPedidoConItems`, `cancelarPedido`), cada uno tiene la línea `const ctx = await exigirVendedora();` — reemplazar por `const ctx = await exigirVendedoraOCajera();` en los 3 lugares.

- [ ] **Step 2: `app/(vendedora)/inicio/actions.ts` — renombrar el helper y ampliar el chequeo**

Reemplazar:

```typescript
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
```

por:

```typescript
async function exigirVendedoraOCajera(): Promise<Result<ContextoVendedora, DomainError>> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return err({ codigo: "NO_AUTORIZADO", mensaje: "Inicia sesión de nuevo" });
  // app_metadata (no user_metadata): solo el service role lo escribe.
  if (user.app_metadata?.rol !== "vendedora" && user.app_metadata?.rol !== "cajera") {
    return err({ codigo: "NO_AUTORIZADO", mensaje: "Solo la vendedora o la cajera pueden tomar pedidos" });
  }
  return ok({
    sedeId: (user.app_metadata?.sede_id as string) ?? SEDE_DEFAULT_ID,
    vendedoraId: user.id,
  });
}
```

Luego actualizar los 2 call sites en el mismo archivo (`crearPedidoDomicilio`, `entrarPedidoDeMesa`), cada uno tiene `const ctx = await exigirVendedora();` — reemplazar por `const ctx = await exigirVendedoraOCajera();` en los 2 lugares.

- [ ] **Step 3: `app/(vendedora)/mis-pedidos/page.tsx` — ampliar el chequeo de rol**

Reemplazar:

```typescript
  if (!user || user.app_metadata?.rol !== "vendedora") {
    redirect("/login");
  }
```

por:

```typescript
  if (!user || (user.app_metadata?.rol !== "vendedora" && user.app_metadata?.rol !== "cajera")) {
    redirect("/login");
  }
```

- [ ] **Step 4: `pnpm lint && pnpm test && pnpm build`**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: exit 0 en los tres, 157/157 tests.

- [ ] **Step 5: Commit**

```bash
git add "app/(vendedora)/pedido/actions.ts" "app/(vendedora)/inicio/actions.ts" "app/(vendedora)/mis-pedidos/page.tsx"
git commit -F- <<'MSG'
feat: renombra exigirVendedora a exigirVendedoraOCajera y admite ambos roles

MSG
```

---

### Task 3: Middleware — ampliar prefijos y agregar navegación

**Files:**
- Modify: `lib/auth/roles.ts`
- Modify: `app/(cajera)/layout.tsx`

**Interfaces:**
- Produces: `PREFIJOS_POR_ROL` con `/inicio`, `/pedido`, `/mis-pedidos` accesibles también para `cajera`.

- [ ] **Step 1: Ampliar `PREFIJOS_POR_ROL` en `lib/auth/roles.ts`**

Reemplazar:

```typescript
  { prefijo: "/inicio", roles: ["vendedora"] },
  { prefijo: "/pedido", roles: ["vendedora"] },
  { prefijo: "/mis-pedidos", roles: ["vendedora"] },
```

por:

```typescript
  { prefijo: "/inicio", roles: ["vendedora", "cajera"] },
  { prefijo: "/pedido", roles: ["vendedora", "cajera"] },
  { prefijo: "/mis-pedidos", roles: ["vendedora", "cajera"] },
```

- [ ] **Step 2: Agregar el link "Tomar pedido" en `app/(cajera)/layout.tsx`**

Reemplazar el contenido completo del archivo por:

```typescript
import Link from "next/link";

export default function CajeraLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-brand-chocolate">
      <header className="flex items-center justify-between border-b border-white/10 px-8 py-6">
        <span className="font-display text-lg text-brand-crema/70">Caja</span>
        <div className="flex items-center gap-6">
          <Link
            href="/inicio"
            className="font-display text-sm text-brand-crema/70 transition-colors duration-150 hover:text-brand-crema focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2"
          >
            Tomar pedido
          </Link>
          <Link
            href="/pedidos-en-curso"
            className="font-display text-sm text-brand-crema/70 transition-colors duration-150 hover:text-brand-crema focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2"
          >
            Domicilios y para llevar
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: `pnpm lint && pnpm test && pnpm build`**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: exit 0 en los tres, 157/157 tests.

- [ ] **Step 4: Commit**

```bash
git add lib/auth/roles.ts "app/(cajera)/layout.tsx"
git commit -F- <<'MSG'
feat: la cajera accede a /inicio, /pedido y /mis-pedidos

MSG
```

---

### Task 4: Verificación en vivo end-to-end

**Files:** Ninguno (verificación manual/curl contra el proyecto Supabase cloud).

**Interfaces:**
- Consumes: todo lo anterior, ya desplegado.

- [ ] **Step 1: Correr la suite completa**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: todo verde.

- [ ] **Step 2: Crear una cajera de prueba temporal y, si hace falta, una vendedora de prueba temporal**

Mismo mecanismo ya usado en bloques anteriores (usuario en `auth.users` + fila en `public.usuarios` + sesión vía `generate_link`/`verify`). Usar una mesa de prueba temporal (número alto, ej. 97) para no tocar las mesas reales.

- [ ] **Step 3: La cajera toma un pedido de mesa completo**

Con la sesión de la cajera de prueba: crear un pedido `canal='mesa'` con `vendedora_id` = id de la cajera, insertar un ítem, llamar `recalcular_totales_pedido`. Confirmar:
- La mesa pasa de `libre` a `ocupada`.
- El pedido queda en `estado='listo'` (Bloque D, `usa_cocina=false` en la sede real).

- [ ] **Step 4: La cajera toma un pedido de domicilio y uno para llevar**

Repetir el flujo con `canal='domicilio'` (creando antes un `clientes_domicilio` de prueba) y `canal='llevar'`. Confirmar en ambos casos que el pedido se crea y llega a `listo`.

- [ ] **Step 5: Aislamiento en `/mis-pedidos`**

Con la sesión de la cajera: `GET /rest/v1/pedidos?canal=eq.domicilio&estado=eq.listo` → debe devolver solo los pedidos con `vendedora_id` = su propio id. Con la sesión de una vendedora de prueba distinta: el mismo `GET` no debe devolver los pedidos de la cajera.

- [ ] **Step 6: Cancelación cruzada**

La cajera cancela un pedido creado por ella misma (vía `cancelar_pedido` RPC) y uno creado por la vendedora de prueba — ambos deben funcionar (ya cubierto por `pedidos_cajera_cancelar` del Bloque C, sin cambios en este bloque).

- [ ] **Step 7: Liberación de mesa consolidada**

Confirmar que la mesa se libera correctamente tanto vía `cobrar_pedido` (cobro) como vía `cancelar_pedido` (cancelación), usando la nueva policy `mesas_staff_update_estado` consolidada — probar ambos caminos con un pedido de mesa nuevo cada vez.

- [ ] **Step 8: Limpieza de datos de prueba**

Borrar pedidos, ítems, cliente, mesa y usuarios de prueba creados. Confirmar con `select` que no queda ningún residuo y que no se tocó ningún dato real (mesas reales, pedidos reales de la sede de Armenia).

- [ ] **Step 9: Actualizar CLAUDE.md**

Reconciliar CLAUDE.md §2.1 (tabla de roles: la Cajera ya no dice "No puede: tomar pedidos") y §6.2 (RLS: la línea de Cajera menciona ahora que puede tomar pedidos igual que la vendedora, y la línea de mesas refleja la policy consolidada `mesas_staff_update_estado`).

- [ ] **Step 10: Commit final de documentación**

```bash
git add CLAUDE.md
git commit -F- <<'MSG'
docs: reconcilia CLAUDE.md con la cajera tomando pedidos (Bloque E)

MSG
```

---

## Self-Review

**Cobertura del spec:** predicados RLS ampliados en las 6 policies de `pedidos`/`pedido_items`/`pedido_item_mods` relevantes (incluyendo `pedidos_vendedora_delete`, encontrada durante la lectura de archivos previa a este plan y necesaria para que el rollback de pedido vacío funcione también para la cajera — no estaba explícita en el spec pero es del mismo tipo exacto de cambio que las demás) y consolidación de las policies de mesa (Task 1); helpers renombrados y ampliados (Task 2); middleware y navegación (Task 3); verificación en vivo de los 3 canales, aislamiento por dueño, cancelación cruzada y liberación de mesa por ambos caminos (Task 4).

**Placeholders:** ninguno.

**Consistencia de tipos:** `exigirVendedoraOCajera()` mantiene exactamente la misma forma de retorno que `exigirVendedora()` tenía en cada archivo (`{vendedoraId, sedeId}` en `pedido/actions.ts`; `ContextoVendedora` en `inicio/actions.ts`) — ningún call site necesita cambiar su forma de leer `ctx.valor`, solo el nombre de la función que se invoca.
