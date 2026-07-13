# Ciclo de vida de mesa en el flujo de vendedora Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir el ciclo de vida de una mesa en el flujo de la Vendedora: se ocupa solo con el primer producto agregado (no al crear el pedido), la vendedora puede volver a una mesa ocupada por ella misma para seguir agregando productos, y la mesa se libera automáticamente al cobrar el pedido.

**Architecture:** Tres cambios coordinados sobre RPCs y policies RLS ya existentes (`recalcular_totales_pedido`, `cobrar_pedido`, política de transición de estado de `mesas`), más los ajustes de Server Action/UI correspondientes en el área de Vendedora. Cada capa (SQL, Server Action, UI) sigue el patrón ya establecido en el proyecto: `security invoker`, transición de estado idempotente (`where estado = '<previo>'`), y policies RLS que restringen la transición exacta permitida por rol.

**Tech Stack:** Next.js 15 App Router, TypeScript estricto, Supabase (Postgres + RLS), Vitest.

## Global Constraints

- CLAUDE.md §13.2: nunca confiar en el rol o estado que declara el cliente — toda transición de mesa se autoriza vía RLS + `current_rol()`.
- "Mesa ocupada" = tiene al menos un ítem confirmado en su pedido activo, no "tiene un pedido creado" (decisión de negocio confirmada).
- El pedido más reciente de una mesa que pertenece a la vendedora actual y no está en estado terminal (`cobrado`/`cerrado`/`anulado`) es "el pedido abierto de esa mesa" — la policy `pedidos_vendedora_select` NO excluye estados terminales (solo `pedidos_vendedora_update` lo hace), así que cualquier consulta que busque "el pedido abierto" debe filtrar el estado explícitamente en la query, no confiar en que RLS ya lo hizo.
- Todas las transiciones de mesa siguen siendo idempotentes (`where estado = '<estado_previo>'`) para tolerar reintentos/llamadas dobles sin error.
- Todos los tests existentes deben seguir verdes en cada tarea (152 en `main` a la fecha de este plan).
- El KDS no depende de `mesas.estado` (usa `pedidos.estado`) — ningún cambio de este plan debe tocar `lib/kds/` ni las políticas de `pedido_items`.

---

### Task 1: Mesa se ocupa con el primer producto, no al crear el pedido

**Files:**
- Create: `supabase/migrations/20260719100000_mesa_ocupada_con_primer_item.sql`
- Modify: `app/(vendedora)/inicio/actions.ts:50-104` (función `crearPedidoMesa`)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `recalcular_totales_pedido(p_pedido_id uuid)` (RPC ya existente, mismo nombre/firma, comportamiento extendido) — ya consumido por `app/(vendedora)/pedido/actions.ts`'s `confirmarItemsPedido`, sin cambios de firma que rompan ese caller.

- [ ] **Step 1: Escribir la migración completa**

```sql
-- Fix reportado en uso real: una mesa pasaba a 'ocupada' en el momento en
-- que se creaba el pedido (crearPedidoMesa, al tocar la mesa vacía), no
-- cuando efectivamente se agregaba el primer producto. Se mueve la
-- ocupación al RPC que ya corre justo después de insertar los primeros
-- ítems de un pedido (recalcular_totales_pedido), atómico con el resto
-- del recálculo, e idempotente (where estado = 'libre', no-op en envíos
-- posteriores al mismo pedido).
create or replace function public.recalcular_totales_pedido(p_pedido_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total bigint;
  v_estados public.estado_item_pedido[];
  v_nuevo_agregado public.estado_pedido;
  v_canal public.canal_pedido;
  v_mesa_id uuid;
begin
  select coalesce(sum(subtotal_cop), 0) into v_total
  from public.pedido_items
  where pedido_id = p_pedido_id;

  select array_agg(estado_item) into v_estados
  from public.pedido_items
  where pedido_id = p_pedido_id;

  v_nuevo_agregado := case
    when v_estados <@ array['listo']::public.estado_item_pedido[] then 'listo'
    when 'en_preparacion' = any(v_estados) or 'listo' = any(v_estados) then 'en_preparacion'
    else 'enviado_cocina'
  end;

  select canal, mesa_id into v_canal, v_mesa_id
  from public.pedidos
  where id = p_pedido_id;

  update public.pedidos
  set subtotal_cop = v_total,
      total_cop = v_total,
      estado = v_nuevo_agregado
  where id = p_pedido_id;

  if v_canal = 'mesa' and v_mesa_id is not null then
    update public.mesas
    set estado = 'ocupada'
    where id = v_mesa_id and estado = 'libre';
  end if;
end;
$$;

grant execute on function public.recalcular_totales_pedido(uuid) to authenticated;
```

- [ ] **Step 2: Aplicar en Supabase cloud**

Run: `supabase db push` (confirmar `Y`). Debe terminar sin errores.

- [ ] **Step 3: Quitar el `update` inmediato de `crearPedidoMesa`**

En `app/(vendedora)/inicio/actions.ts`, reemplazar el bloque completo de `crearPedidoMesa` (líneas 50-104) por:

```typescript
export async function crearPedidoMesa(
  mesaId: string,
): Promise<Result<{ pedidoId: string }, DomainError>> {
  const ctx = await exigirVendedora();
  if (!ctx.ok) return ctx;
  if (!uuidValido(mesaId)) {
    return err({ codigo: "VALIDACION", mensaje: "Identificador de mesa inválido" });
  }
  const supabase = await createServerSupabase();

  const { data: mesa, error: errorMesa } = await supabase
    .from("mesas")
    .select("id, estado, activa")
    .eq("id", mesaId)
    .single();
  if (errorMesa || !mesa) {
    return err({ codigo: "NO_ENCONTRADO", mensaje: "La mesa no existe" });
  }
  if (!mesa.activa || mesa.estado !== "libre") {
    return err({ codigo: "VALIDACION", mensaje: "Esa mesa ya no está disponible. Elige otra." });
  }

  const numeroCorto = await calcularSiguienteNumero(supabase, ctx.valor.sedeId);
  const { data: pedido, error: errorPedido } = await supabase
    .from("pedidos")
    .insert({
      sede_id: ctx.valor.sedeId,
      numero_corto: numeroCorto,
      canal: "mesa",
      mesa_id: mesaId,
      vendedora_id: ctx.valor.vendedoraId,
    })
    .select("id")
    .single();
  if (errorPedido || !pedido) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos crear el pedido. Intenta de nuevo." });
  }

  revalidatePath("/inicio");
  return ok({ pedidoId: pedido.id });
}
```

(La mesa deja de marcarse `ocupada` aquí — ahora lo hace `recalcular_totales_pedido` cuando se confirma el primer ítem, Step 1.)

- [ ] **Step 4: Verificar suite completa**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 152/152 tests (esta tarea no agrega tests nuevos — TDD no aplica a este cambio, ver Global Constraints).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260719100000_mesa_ocupada_con_primer_item.sql "app/(vendedora)/inicio/actions.ts"
git commit -m "fix: la mesa se ocupa al confirmar el primer item, no al crear el pedido"
```

---

### Task 2: Volver a una mesa ocupada propia

**Files:**
- Modify: `app/(vendedora)/inicio/actions.ts` (agregar `entrarPedidoDeMesa`)
- Modify: `components/mesas/GrillaMesas.tsx:99-105` (función `alClicMesa`)
- Modify: `components/pedido/SelectorOrigen.tsx:29-40` (función `alSeleccionarMesa`)

**Interfaces:**
- Consumes: `exigirVendedora()`, `uuidValido()` (ya existentes en `app/(vendedora)/inicio/actions.ts`).
- Produces: `entrarPedidoDeMesa(mesaId: string): Promise<Result<{ pedidoId: string }, DomainError>>` — consumido por `SelectorOrigen.tsx` en esta misma tarea.

- [ ] **Step 1: Agregar `entrarPedidoDeMesa` a `app/(vendedora)/inicio/actions.ts`**

Agregar al final del archivo (después de `crearPedidoLlevar`):

```typescript
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

- [ ] **Step 2: Permitir clic en mesas `ocupada` en `GrillaMesas.tsx`**

Reemplazar la función `alClicMesa` (líneas 99-105) por:

```typescript
  function alClicMesa(mesa: MesaVista): (() => void) | undefined {
    if (modo === "seleccion") {
      if (!mesa.activa) return undefined;
      if (mesa.estado === "libre" || mesa.estado === "ocupada") {
        return () => onSeleccionarMesa?.(mesa);
      }
      return undefined;
    }
    return puedeEditar ? () => abrirExistente(mesa) : undefined;
  }
```

También actualizar el comentario JSDoc de la prop `modo` (líneas 17-19) para reflejar el nuevo comportamiento:

```typescript
  /** "gestion" (default): clic abre el editor de admin. "seleccion": clic
   *  en una mesa libre u ocupada (activa) llama `onSeleccionarMesa` (flujo
   *  de la vendedora al iniciar o retomar un pedido). */
```

- [ ] **Step 3: `SelectorOrigen.tsx` decide crear vs. entrar según el estado de la mesa**

En `components/pedido/SelectorOrigen.tsx`, agregar el import de `entrarPedidoDeMesa` (línea 7) y reemplazar `alSeleccionarMesa` (líneas 29-40):

```typescript
import { crearPedidoDomicilio, crearPedidoLlevar, crearPedidoMesa, entrarPedidoDeMesa } from "@/app/(vendedora)/inicio/actions";
```

```typescript
  async function alSeleccionarMesa(mesa: MesaVista) {
    if (creandoMesa) return;
    setError(null);
    setCreandoMesa(true);
    const resultado =
      mesa.estado === "ocupada" ? await entrarPedidoDeMesa(mesa.id) : await crearPedidoMesa(mesa.id);
    if (!resultado.ok) {
      setCreandoMesa(false);
      setError(resultado.error.mensaje);
      return;
    }
    router.push(`/pedido/${resultado.valor.pedidoId}`);
  }
```

- [ ] **Step 4: Verificar suite completa**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 152/152 tests.

- [ ] **Step 5: Commit**

```bash
git add "app/(vendedora)/inicio/actions.ts" components/mesas/GrillaMesas.tsx components/pedido/SelectorOrigen.tsx
git commit -m "feat: permitir volver a una mesa ocupada propia para seguir agregando productos"
```

---

### Task 3: Liberar la mesa al cobrar

**Files:**
- Create: `supabase/migrations/20260719110000_liberar_mesa_al_cobrar.sql`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: policy `mesas_cajera_update_estado`; función `mesas_solo_estado_operacion()` (renombra `mesas_vendedora_solo_estado()`); `cobrar_pedido(p_pedido_id uuid, p_turno_id uuid, p_pagos jsonb)` (RPC ya existente, misma firma, comportamiento extendido).

- [ ] **Step 1: Escribir la migración completa**

```sql
-- Fix reportado en uso real (relacionado con el fix de mesa_ocupada_con_
-- primer_item): ningún flujo liberaba una mesa al cobrar su pedido -- la
-- mesa quedaba 'ocupada' para siempre tras el primer pedido, sin que
-- ninguna vendedora pudiera reutilizarla (pedidos_vendedora_select no
-- excluye estados terminales, pero pedidos_vendedora_update sí, así que
-- tampoco podía "arreglarlo" reabriendo el pedido cobrado). Solo un admin
-- podía liberarla a mano desde /mesas.
--
-- La cajera no tenía ninguna policy de UPDATE sobre mesas. Se agrega una
-- simétrica a mesas_vendedora_update_estado pero en sentido inverso
-- (ocupada -> libre en vez de libre -> ocupada), y se extiende el trigger
-- de columna única (antes solo restringía a vendedora) para cubrir
-- también a cajera.
drop policy if exists mesas_vendedora_update_estado on public.mesas;

create policy mesas_vendedora_update_estado on public.mesas
  for update to authenticated
  using (
    public.current_rol() = 'vendedora'
    and sede_id = public.current_sede_id()
    and estado = 'libre'
    and activa = true
  )
  with check (
    public.current_rol() = 'vendedora'
    and sede_id = public.current_sede_id()
    and estado = 'ocupada'
  );

create policy mesas_cajera_update_estado on public.mesas
  for update to authenticated
  using (
    public.current_rol() = 'cajera'
    and sede_id = public.current_sede_id()
    and estado = 'ocupada'
    and activa = true
  )
  with check (
    public.current_rol() = 'cajera'
    and sede_id = public.current_sede_id()
    and estado = 'libre'
  );

drop trigger if exists mesas_vendedora_solo_estado_trigger on public.mesas;
drop function if exists public.mesas_vendedora_solo_estado();

create or replace function public.mesas_solo_estado_operacion()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.current_rol() in ('vendedora', 'cajera') then
    if (to_jsonb(new) - 'estado') is distinct from (to_jsonb(old) - 'estado') then
      raise exception 'Este rol solo puede actualizar el estado de la mesa';
    end if;
  end if;
  return new;
end;
$$;

create trigger mesas_solo_estado_operacion_trigger
  before update on public.mesas
  for each row execute function public.mesas_solo_estado_operacion();

-- cobrar_pedido: mismo cuerpo, captura canal/mesa_id en el lock inicial y
-- libera la mesa (si aplica) en la misma sentencia que marca el pedido
-- cobrado -- atómico, idempotente (where estado = 'ocupada').
create or replace function public.cobrar_pedido(
  p_pedido_id uuid,
  p_turno_id uuid,
  p_pagos jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total bigint;
  v_estado public.estado_pedido;
  v_canal public.canal_pedido;
  v_mesa_id uuid;
  v_suma_pagos bigint;
  v_pago jsonb;
begin
  select total_cop, estado, canal, mesa_id into v_total, v_estado, v_canal, v_mesa_id
  from public.pedidos
  where id = p_pedido_id
  for update;

  if v_total is null then
    raise exception 'Pedido no encontrado o sin permiso';
  end if;

  if v_estado not in ('listo', 'entregado') then
    raise exception 'El pedido no está listo para cobrar';
  end if;

  select coalesce(sum((pago->>'monto_cop')::bigint), 0) into v_suma_pagos
  from jsonb_array_elements(p_pagos) as pago;

  if v_suma_pagos <> v_total then
    raise exception 'La suma de los pagos no coincide con el total del pedido';
  end if;

  for v_pago in select * from jsonb_array_elements(p_pagos)
  loop
    insert into public.pagos (pedido_id, turno_id, metodo, monto_cop, referencia)
    values (
      p_pedido_id,
      p_turno_id,
      (v_pago->>'metodo')::public.metodo_pago,
      (v_pago->>'monto_cop')::bigint,
      v_pago->>'referencia'
    );
  end loop;

  update public.pedidos
  set estado = 'cobrado'
  where id = p_pedido_id;

  if v_canal = 'mesa' and v_mesa_id is not null then
    update public.mesas
    set estado = 'libre'
    where id = v_mesa_id and estado = 'ocupada';
  end if;
end;
$$;

revoke execute on function public.cobrar_pedido(uuid, uuid, jsonb) from public;
revoke execute on function public.cobrar_pedido(uuid, uuid, jsonb) from anon;
grant execute on function public.cobrar_pedido(uuid, uuid, jsonb) to authenticated;
```

Nota: se recrea `mesas_vendedora_update_estado` con el mismo texto de antes (sin cambios de comportamiento) solo porque la migración anterior que la creó (`20260712170000_endurecer_mesas_vendedora_estado.sql`) usó `create policy` sin `or replace` (Postgres no soporta `create policy or replace`) — hay que hacer `drop` + `create` explícito para poder tocar el trigger asociado sin dejar la policy vieja huérfana. El `drop trigger`/`drop function` del trigger viejo es indispensable antes de crear el nuevo con otro nombre, o quedarían dos triggers duplicados ejecutando lógica solapada.

- [ ] **Step 2: Aplicar en Supabase cloud**

Run: `supabase db push` (confirmar `Y`). Debe terminar sin errores.

- [ ] **Step 3: Verificación en vivo — cajera puede liberar una mesa ocupada**

Con `service_role`, crear una mesa de prueba en estado `ocupada` (o reusar una existente en ese estado), generar sesión de la cajera real (`cajera@criollitas.com`, mecanismo `generate_link`+`verify`), y confirmar con curl que puede hacer `PATCH` a `estado=libre` sobre esa mesa vía REST (`PATCH /rest/v1/mesas?id=eq.<id>` con `{"estado":"libre"}`) — debe devolver `200`/`204`. Confirmar también que una vendedora NO puede hacer esa misma transición (`ocupada`→`libre`) — debe devolver `200` con `[]` afectado (RLS filtra la fila, no error, mismo patrón de bloques anteriores) o `404`, según cómo PostgREST reporte 0 filas afectadas por RLS.

- [ ] **Step 4: Verificar suite completa**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 152/152 tests (esta tarea no toca TypeScript).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260719110000_liberar_mesa_al_cobrar.sql
git commit -m "feat: liberar la mesa automaticamente al cobrar su pedido"
```

---

### Task 4: Verificación en vivo end-to-end y reconciliación

**Files:**
- Modify: `CLAUDE.md` (solo si la verificación revela una divergencia real)

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Preparar datos y sesiones de prueba**

Con `service_role`:
- Crear 2 usuarios de vendedora temporales (mismo patrón `generate_link`+`admin/users` de bloques anteriores, o directo con `auth.admin.createUser` + insert en `usuarios` con rol `vendedora`, `sede_id` real, `pin_hash` no necesario para esta verificación ya que se usa sesión por token, no PIN).
- Confirmar que existe al menos una mesa libre y activa (usar una real de la sede, ej. Mesa 1).
- Generar sesión de cada vendedora temporal (`generate_link`+`verify`), sesión de la cajera real (`cajera@criollitas.com`), sesión del admin real.

- [ ] **Step 2: Ciclo completo con la Vendedora A**

Con el token de la Vendedora A:
a. `crearPedidoMesa` (vía POST a la Server Action no es posible por curl directo — usar inserción equivalente vía REST: `POST /rest/v1/pedidos` con canal=mesa, mesa_id, vendedora_id=A, estado por defecto `abierto`) sobre la mesa de prueba.
b. Verificar con `service_role`: `GET /rest/v1/mesas?id=eq.<mesaId>&select=estado` → debe seguir `libre`.
c. Insertar un `pedido_items` de prueba para ese pedido (vía REST con token de A, respetando RLS de `pedido_items` ya existente) y llamar el RPC `recalcular_totales_pedido` vía `POST /rest/v1/rpc/recalcular_totales_pedido` con el token de A.
d. Verificar con `service_role`: la mesa ahora está `ocupada`, y `pedidos.estado` pasó a `enviado_cocina`.

- [ ] **Step 3: "Salir y volver" con la misma Vendedora A**

Con el token de A, `POST /rest/v1/rpc/... ` no aplica (es una Server Action, no un RPC de Postgres) — simular la búsqueda que hace `entrarPedidoDeMesa` directamente vía REST: `GET /rest/v1/pedidos?mesa_id=eq.<mesaId>&vendedora_id=eq.<idA>&select=id&order=creado_en.desc&limit=1` con el filtro `estado=not.in.(cobrado,cerrado,anulado)`. Confirmar que devuelve el mismo `pedidoId` del Step 2.

- [ ] **Step 4: Vendedora B es rechazada**

Con el token de la Vendedora B, repetir la misma query del Step 3 pero con `vendedora_id=eq.<idB>`. Confirmar que devuelve `[]` (ningún pedido — la mesa es de A, no de B), reproduciendo el `NO_ENCONTRADO` que `entrarPedidoDeMesa` devolvería en la app real.

- [ ] **Step 5: Cobrar y verificar que la mesa se libera**

Con el token de la cajera real:
a. Abrir un turno de prueba (`POST /rest/v1/turnos_caja`).
b. Llevar el pedido de prueba a estado `listo` (vía `service_role`, actualización directa — no es el foco de esta verificación).
c. Llamar `POST /rest/v1/rpc/cobrar_pedido` con `p_pedido_id`, `p_turno_id`, `p_pagos` (un solo pago en efectivo que cuadre exacto con `total_cop`).
d. Verificar con `service_role`: `pedidos.estado = 'cobrado'` y `mesas.estado = 'libre'` de nuevo.

- [ ] **Step 6: Limpiar datos de prueba**

Con `service_role`, en orden (respetando FKs): `pedido_item_mods` (si aplica) → `pedido_items` → `pagos` → `turnos_caja` → `auditoria` (filas que referencien los objetos de prueba) → `pedidos` → los 2 usuarios de vendedora temporales (vía Admin Auth API `DELETE /auth/v1/admin/users/<id>`, cascada a `usuarios`). Confirmar con un `SELECT` final que no quedan filas huérfanas.

- [ ] **Step 7: Reconciliar CLAUDE.md si hace falta**

Revisar §7 (líneas cercanas a `estado ∈ {libre, ocupada, reservada}` en el modelo de `mesas`) — agregar una nota breve de una línea sobre cuándo ocurre cada transición (`libre→ocupada`: primer ítem confirmado; `ocupada→libre`: al cobrar el pedido; admin puede forzar cualquier transición desde `/mesas`), ya que antes no estaba documentado y ahora es un comportamiento intencional y verificado. Si el texto ya es suficientemente claro sin esto, no tocar nada por tocar.

- [ ] **Step 8: Verificación final**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 152/152 tests. Flujo dev manual (opcional, si hay acceso a `pnpm dev` con datos reales): login vendedora → tocar una mesa libre → confirmar que sigue libre en `/mesas` (vista admin, otra pestaña) → agregar un producto y enviarlo → confirmar que la mesa pasa a ocupada → volver a `/inicio` → tocar esa misma mesa de nuevo → confirmar que entra al mismo pedido.

- [ ] **Step 9: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: reconciliar CLAUDE.md con el ciclo de vida de mesa (vendedora)"
```

(Si no hubo cambios en CLAUDE.md, omitir este commit y dejarlo anotado en el reporte de la tarea.)

---

## Self-Review (del autor del plan)

**Cobertura del spec:** Mesa se ocupa con el primer producto (decisión 1): Task 1, SQL + TS. Volver a mesa ocupada propia (decisión 2): Task 2, nuevo Server Action + UI. Liberar mesa al cobrar (decisión 3, confirmada por el usuario): Task 3. Verificación end-to-end completa con 2 vendedoras + cajera + admin: Task 4.

**Placeholders:** ninguno — todo el código de cada step está completo.

**Consistencia de tipos:** `entrarPedidoDeMesa` (Task 2) devuelve `Result<{ pedidoId: string }, DomainError>`, mismo shape que `crearPedidoMesa` ya existente — `SelectorOrigen.tsx` los trata de forma intercambiable en el mismo `if (!resultado.ok)`. `MesaVista.estado` (tipo ya existente en `components/mesas/tipos.ts`, no modificado) se usa en `GrillaMesas.alClicMesa` y `SelectorOrigen.alSeleccionarMesa` con los mismos 3 valores literales (`libre`/`ocupada`/`reservada`) sin discrepancia.

**Nota de diseño agregada durante el self-review**: la Task 2 documenta explícitamente por qué el filtro de estados terminales va en la query de `entrarPedidoDeMesa` y no se confía en RLS — porque `pedidos_vendedora_select` (a diferencia de `pedidos_vendedora_update`) NO excluye `cobrado`/`cerrado`/`anulado`. Esto se confirmó leyendo la migración original (`20260712140000_pedidos_base.sql:85-89`) durante la investigación previa a este plan; sin el filtro explícito, `entrarPedidoDeMesa` habría podido devolver un pedido ya cobrado de un ciclo anterior de la misma mesa, llevando a la vendedora a una pantalla de edición de un pedido que ya no se puede modificar.
