# Bloque 7 (Turnos y Cobro) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a la Cajera el ciclo completo de su turno de trabajo: abrir turno con efectivo inicial, cobrar pedidos (pago simple o mixto) mientras el turno está abierto, imprimir tirilla, y cerrar el turno con arqueo.

**Architecture:** Migración base con RLS + índice único (un solo turno abierto por cajera) + dos RPCs atómicos (`cerrar_turno`, `cobrar_pedido`, ambos con lock explícito para evitar condiciones de carrera, mismo patrón que los Bloques 5 y 6). Funciones puras con TDD para la fórmula de arqueo, el cuadre de pago mixto, y el builder ESC/POS — cada una documenta/prueba en TypeScript la misma regla que su contraparte SQL o su consumidor. Server Actions siguen el patrón `exigirCajera()` ya establecido (`exigirVendedora`/`exigirCocina`). Páginas RSC con joins manuales (sin sintaxis de embed) más un componente Realtime para la cola de cobro, mismo patrón de dos casos (patch in place / fetch completo al entrar) que `TableroKDS` del Bloque 6.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + RLS + Realtime), TypeScript estricto, Zod, Vitest.

## Global Constraints

- CLAUDE.md §12: Server Components por defecto; `"use client"` solo donde hay interactividad/hooks. Nunca `throw` en dominio — `Result<T, DomainError>`. Texto de usuario en español de Colombia.
- CLAUDE.md §13.2: nunca confiar en el rol/estado/total que declara el cliente para autorizar o cobrar — toda autorización vía `getUser()` + RLS; el total del pedido se relee fresco de la base dentro del RPC de cobro.
- CLAUDE.md §13.3: dinero siempre `bigint` de centavos (`lib/money.ts`), nunca `number` fuera de la frontera DB↔UI.
- CLAUDE.md §4.1: cálculo de arqueo, cuadre de pago mixto y transiciones de estado de pedido son lógica de negocio — TDD obligatorio.
- CLAUDE.md §13.9: nunca enviar comandos de impresión sin registrar en `impresiones` primero.
- CLAUDE.md §13.5: toda fecha/hora vía `lib/dates.ts` (zona `America/Bogota` fija).
- `app_metadata` (nunca `user_metadata`) es la única fuente de rol/sede — patrón establecido desde el Bloque 3.
- El servicio `print-bridge` en sí (proceso Node.js separado) está fuera de alcance de este bloque — solo se construye el cliente que lo llama; si no responde, el cobro ya quedó confirmado y solo la impresión queda pendiente de reintento.
- Todos los tests existentes (117 en `main` a la fecha de este plan) deben seguir verdes en cada tarea.

---

### Task 1: Migración base — turnos_caja, movimientos_caja, pagos, impresiones, RLS

**Files:**
- Create: `supabase/migrations/20260714100000_turnos_cobro_base.sql`
- Modify: `lib/supabase/types.ts` (regenerar tras aplicar en cloud)

**Interfaces:**
- Produces: tablas `turnos_caja`, `movimientos_caja`, `pagos`, `impresiones`; policy nueva `pedidos_cajera_update` sobre `pedidos`; trigger `pedidos_cajera_solo_estado`; índice único `turnos_caja_una_abierta_por_cajera`.

- [ ] **Step 1: Escribir la migración completa**

```sql
-- Bloque 7 (fusiona Turnos + Cobro, decisión confirmada con el usuario: el
-- bloque original de Cobro dependía de datos que solo existen en Turnos —
-- pagos.turno_id no es nulo y CLAUDE.md §2.4 exige que el efectivo cobrado
-- sume al turno abierto). Cierra también pedidos_cajera_update, pendiente
-- desde el Bloque 5.
create type public.estado_turno as enum ('abierto', 'cerrado');
create type public.metodo_pago as enum ('efectivo', 'nequi', 'daviplata', 'bancolombia_qr', 'datafono', 'otro');
create type public.tipo_movimiento_caja as enum ('retiro', 'gasto', 'ingreso_extra');

create table public.turnos_caja (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references public.sedes (id),
  cajera_id uuid not null references public.usuarios (id),
  abierto_en timestamptz not null default now(),
  cerrado_en timestamptz,
  efectivo_inicial_cop bigint not null check (efectivo_inicial_cop >= 0),
  efectivo_declarado_cop bigint,
  esperado_cop bigint,
  diferencia_cop bigint,
  estado public.estado_turno not null default 'abierto',
  notas text
);

-- Un solo turno abierto por cajera a la vez: índice único parcial en vez de
-- un trigger, para que la propia base de datos rechace atómicamente una
-- segunda apertura concurrente (dos toques casi simultáneos en "Abrir
-- turno" no pueden ambos pasar).
create unique index turnos_caja_una_abierta_por_cajera
  on public.turnos_caja (cajera_id)
  where estado = 'abierto';

create table public.movimientos_caja (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references public.turnos_caja (id),
  tipo public.tipo_movimiento_caja not null,
  concepto text not null,
  monto_cop bigint not null check (monto_cop > 0),
  creado_en timestamptz not null default now()
);

create table public.pagos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos (id),
  turno_id uuid not null references public.turnos_caja (id),
  metodo public.metodo_pago not null,
  monto_cop bigint not null check (monto_cop > 0),
  referencia text,
  creado_en timestamptz not null default now()
);

create table public.impresiones (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos (id),
  tipo text not null,
  contenido_escpos text not null,
  enviado_en timestamptz,
  exito boolean,
  error text,
  creado_en timestamptz not null default now()
);

alter table public.turnos_caja enable row level security;
alter table public.movimientos_caja enable row level security;
alter table public.pagos enable row level security;
alter table public.impresiones enable row level security;

-- turnos_caja: cajera INSERT/SELECT sobre los suyos de su sede. UPDATE
-- restringido por policy a los 3 valores no-terminales... en realidad solo
-- hay una transición (abierto -> cerrado), así que WITH CHECK exige
-- exactamente 'cerrado' como destino y USING exige que el actual sea
-- 'abierto' (nunca se reabre uno cerrado).
create policy turnos_caja_cajera_insert on public.turnos_caja
  for insert to authenticated
  with check (
    public.current_rol() = 'cajera' and cajera_id = auth.uid() and sede_id = public.current_sede_id()
    and estado = 'abierto'
  );

create policy turnos_caja_cajera_select on public.turnos_caja
  for select to authenticated
  using (
    public.current_rol() = 'cajera' and cajera_id = auth.uid() and sede_id = public.current_sede_id()
  );

create policy turnos_caja_cajera_update on public.turnos_caja
  for update to authenticated
  using (
    public.current_rol() = 'cajera' and cajera_id = auth.uid() and sede_id = public.current_sede_id()
    and estado = 'abierto'
  )
  with check (
    public.current_rol() = 'cajera' and cajera_id = auth.uid() and sede_id = public.current_sede_id()
    and estado = 'cerrado'
  );

create policy turnos_caja_admin_select on public.turnos_caja
  for select to authenticated
  using (public.current_rol() = 'admin' and sede_id = public.current_sede_id());

-- Trigger de columnas: mismo patrón que pedidos_cocina_solo_estado del
-- Bloque 6 — la cajera solo puede cambiar los campos de cierre en su
-- UPDATE (nunca efectivo_inicial_cop después de creado, ni cajera_id/
-- sede_id/abierto_en/notas por esta vía).
create or replace function public.turnos_caja_cajera_solo_cierre()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.current_rol() = 'cajera' then
    if (to_jsonb(new) - 'estado' - 'cerrado_en' - 'efectivo_declarado_cop' - 'esperado_cop' - 'diferencia_cop')
       is distinct from
       (to_jsonb(old) - 'estado' - 'cerrado_en' - 'efectivo_declarado_cop' - 'esperado_cop' - 'diferencia_cop')
    then
      raise exception 'La cajera solo puede cerrar su turno, no editar sus demás campos';
    end if;
  end if;
  return new;
end;
$$;

create trigger turnos_caja_cajera_solo_cierre_trigger
  before update on public.turnos_caja
  for each row
  execute function public.turnos_caja_cajera_solo_cierre();

-- movimientos_caja: cajera INSERT/SELECT solo sobre su propio turno
-- abierto. Sin UPDATE ni DELETE (inmutable, igual que pedido_items no
-- permite corrección directa fuera de su RPC).
create policy movimientos_caja_cajera_insert on public.movimientos_caja
  for insert to authenticated
  with check (exists (
    select 1 from public.turnos_caja t where t.id = turno_id
      and public.current_rol() = 'cajera' and t.cajera_id = auth.uid() and t.estado = 'abierto'
  ));

create policy movimientos_caja_cajera_select on public.movimientos_caja
  for select to authenticated
  using (exists (
    select 1 from public.turnos_caja t where t.id = turno_id
      and (
        (public.current_rol() = 'cajera' and t.cajera_id = auth.uid())
        or (public.current_rol() = 'admin' and t.sede_id = public.current_sede_id())
      )
  ));

-- pagos: cajera INSERT/SELECT solo sobre su propio turno abierto y pedidos
-- de su sede. Sin UPDATE ni DELETE.
create policy pagos_cajera_insert on public.pagos
  for insert to authenticated
  with check (exists (
    select 1 from public.turnos_caja t where t.id = turno_id
      and public.current_rol() = 'cajera' and t.cajera_id = auth.uid() and t.estado = 'abierto'
  ));

create policy pagos_cajera_select on public.pagos
  for select to authenticated
  using (exists (
    select 1 from public.turnos_caja t where t.id = turno_id
      and (
        (public.current_rol() = 'cajera' and t.cajera_id = auth.uid())
        or (public.current_rol() = 'admin' and t.sede_id = public.current_sede_id())
      )
  ));

-- impresiones: cajera INSERT/SELECT/UPDATE (para el reintento) sobre
-- pedidos de su sede.
create policy impresiones_cajera_insert on public.impresiones
  for insert to authenticated
  with check (exists (
    select 1 from public.pedidos p where p.id = pedido_id
      and public.current_rol() = 'cajera' and p.sede_id = public.current_sede_id()
  ));

create policy impresiones_cajera_select on public.impresiones
  for select to authenticated
  using (exists (
    select 1 from public.pedidos p where p.id = pedido_id
      and (
        (public.current_rol() = 'cajera' and p.sede_id = public.current_sede_id())
        or (public.current_rol() = 'admin' and p.sede_id = public.current_sede_id())
      )
  ));

create policy impresiones_cajera_update on public.impresiones
  for update to authenticated
  using (exists (
    select 1 from public.pedidos p where p.id = pedido_id
      and public.current_rol() = 'cajera' and p.sede_id = public.current_sede_id()
  ))
  with check (exists (
    select 1 from public.pedidos p where p.id = pedido_id
      and public.current_rol() = 'cajera' and p.sede_id = public.current_sede_id()
  ));

-- pedidos_cajera_update: pendiente desde el Bloque 5. La cajera transiciona
-- un pedido listo/entregado a cobrado, nunca otro valor. Trigger de
-- columnas análogo a pedidos_cocina_solo_estado (Bloque 6): solo puede
-- cambiar `estado`.
create policy pedidos_cajera_update on public.pedidos
  for update to authenticated
  using (
    public.current_rol() = 'cajera' and sede_id = public.current_sede_id()
    and estado in ('listo', 'entregado')
  )
  with check (
    public.current_rol() = 'cajera' and sede_id = public.current_sede_id()
    and estado = 'cobrado'
  );

create or replace function public.pedidos_cajera_solo_estado()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.current_rol() = 'cajera' then
    if (to_jsonb(new) - 'estado') is distinct from (to_jsonb(old) - 'estado') then
      raise exception 'La cajera solo puede actualizar el estado del pedido';
    end if;
  end if;
  return new;
end;
$$;

create trigger pedidos_cajera_solo_estado_trigger
  before update on public.pedidos
  for each row
  execute function public.pedidos_cajera_solo_estado();
```

- [ ] **Step 2: Aplicar en Supabase cloud**

Run: `supabase db push` (confirmar `Y`). Debe terminar sin errores.

- [ ] **Step 3: Regenerar tipos y aplicar el diff quirúrgicamente**

```bash
supabase gen types typescript --linked > /tmp/types_nuevo.ts
```

Aplicar SOLO los cambios de esta migración (4 tablas nuevas en `Tables`, 3 enums nuevos en `Enums`) a `lib/supabase/types.ts` a mano — no sobreescribir el archivo completo (CRLF+BOM vs. LF sin BOM del CLI, precedente documentado en los Bloques 5 y 6).

- [ ] **Step 4: Verificar suite completa**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 117/117 tests (esta tarea no agrega tests, solo SQL + tipos).

- [ ] **Step 5: Commit**

Mensaje describiendo las 4 tablas, el índice único, la policy `pedidos_cajera_update` y sus dos triggers de columnas (código completo arriba).

---

### Task 2: RPCs atómicos — cerrar_turno, cobrar_pedido

**Files:**
- Create: `supabase/migrations/20260714110000_rpcs_turno_cobro.sql`
- Modify: `lib/supabase/types.ts`

**Interfaces:**
- Consumes: tablas de la Task 1.
- Produces: `public.cerrar_turno(p_turno_id uuid, p_efectivo_declarado_cop bigint) returns void`; `public.cobrar_pedido(p_pedido_id uuid, p_turno_id uuid, p_pagos jsonb) returns void` — `p_pagos` es un array `[{metodo, monto_cop, referencia}]`.

- [ ] **Step 1: Escribir la migración completa**

```sql
-- cerrar_turno: calcula esperado_cop/diferencia_cop con un SUM fresco sobre
-- pagos/movimientos_caja de este turno, en la misma sentencia que fija
-- estado='cerrado'. El "for update" sobre la fila del turno bloquea hasta
-- que cualquier cobro concurrente sobre ese turno termine, evitando cerrar
-- con un pago que llegó justo en el medio del cálculo (mismo patrón que el
-- lock de actualizar_estado_item_pedido del Bloque 6).
create or replace function public.cerrar_turno(
  p_turno_id uuid,
  p_efectivo_declarado_cop bigint
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_efectivo_inicial bigint;
  v_pagos_efectivo bigint;
  v_retiros_gastos bigint;
  v_ingresos_extra bigint;
  v_esperado bigint;
begin
  select efectivo_inicial_cop into v_efectivo_inicial
  from public.turnos_caja
  where id = p_turno_id and estado = 'abierto'
  for update;

  if v_efectivo_inicial is null then
    raise exception 'Turno no encontrado, sin permiso, o ya está cerrado';
  end if;

  select coalesce(sum(monto_cop), 0) into v_pagos_efectivo
  from public.pagos
  where turno_id = p_turno_id and metodo = 'efectivo';

  select coalesce(sum(monto_cop), 0) into v_retiros_gastos
  from public.movimientos_caja
  where turno_id = p_turno_id and tipo in ('retiro', 'gasto');

  select coalesce(sum(monto_cop), 0) into v_ingresos_extra
  from public.movimientos_caja
  where turno_id = p_turno_id and tipo = 'ingreso_extra';

  v_esperado := v_efectivo_inicial + v_pagos_efectivo - v_retiros_gastos + v_ingresos_extra;

  update public.turnos_caja
  set efectivo_declarado_cop = p_efectivo_declarado_cop,
      esperado_cop = v_esperado,
      diferencia_cop = p_efectivo_declarado_cop - v_esperado,
      estado = 'cerrado',
      cerrado_en = now()
  where id = p_turno_id;
end;
$$;

revoke execute on function public.cerrar_turno(uuid, bigint) from public;
revoke execute on function public.cerrar_turno(uuid, bigint) from anon;
grant execute on function public.cerrar_turno(uuid, bigint) to authenticated;

-- cobrar_pedido: relee total_cop/estado del pedido con lock ("for update",
-- nunca confía en el total que calculó el cliente — CLAUDE.md §13.2), valida
-- que el estado sea listo/entregado, valida server-side que la suma de los
-- pagos cuadre EXACTO con el total (§2.3), inserta todos los pagos, y
-- transiciona el pedido a cobrado — todo en una sola sentencia atómica.
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
  v_suma_pagos bigint;
  v_pago jsonb;
begin
  select total_cop, estado into v_total, v_estado
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
end;
$$;

revoke execute on function public.cobrar_pedido(uuid, uuid, jsonb) from public;
revoke execute on function public.cobrar_pedido(uuid, uuid, jsonb) from anon;
grant execute on function public.cobrar_pedido(uuid, uuid, jsonb) to authenticated;
```

- [ ] **Step 2: Aplicar en Supabase cloud**

Run: `supabase db push`.

- [ ] **Step 3: Regenerar tipos y aplicar el diff quirúrgicamente**

Igual que la Task 1, aplicar solo las 2 entradas nuevas en `Functions`.

- [ ] **Step 4: Verificación en vivo con curl (sin usuario de prueba todavía)**

```bash
cd /c/PROYECTOS/CRIOLLITAS
set -a; source .env.local; set +a
curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/cobrar_pedido" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_pedido_id":"00000000-0000-0000-0000-000000000000","p_turno_id":"00000000-0000-0000-0000-000000000000","p_pagos":[]}'
```

Expected: `401` con `"permission denied for function cobrar_pedido"` (mismo patrón de revoke explícito de `anon` que se aprendió en el Bloque 6 — Supabase concede `execute` a `anon` por defecto al crear la función, no confiar en el `grant ... to authenticated` solo).

- [ ] **Step 5: Verificar suite completa**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 117/117 tests.

- [ ] **Step 6: Commit**

---

### Task 3: Funciones puras — arqueo y cuadre de pago mixto (TDD)

**Files:**
- Create: `lib/caja/arqueo.ts`
- Create: `lib/caja/cuadrePago.ts`
- Test: `tests/unit/caja-arqueo.test.ts`
- Test: `tests/unit/caja-cuadre-pago.test.ts`

**Interfaces:**
- Consumes: `sumar`, `type MontoCOP` de `lib/money.ts`.
- Produces: `calcularEsperado(datos: DatosArqueo): MontoCOP`; `calcularDiferencia(efectivoDeclaradoCop: MontoCOP, esperadoCop: MontoCOP): MontoCOP`; `pagosCuadranConTotal(montosPagoCop: MontoCOP[], totalCop: MontoCOP): boolean` — usadas por las páginas (Task 8) para la vista previa y por el formulario de cobro (Task 9) para habilitar el botón de confirmar.

- [ ] **Step 1: Escribir los tests de `arqueo.ts` (fallan primero)**

```typescript
// tests/unit/caja-arqueo.test.ts
import { describe, expect, it } from "vitest";
import { calcularEsperado, calcularDiferencia } from "@/lib/caja/arqueo";

describe("calcularEsperado", () => {
  it("solo efectivo inicial, sin movimientos", () => {
    expect(
      calcularEsperado({
        efectivoInicialCop: 100000n,
        pagosEfectivoCop: [],
        retirosCop: [],
        gastosCop: [],
        ingresosExtraCop: [],
      }),
    ).toBe(100000n);
  });

  it("suma pagos en efectivo", () => {
    expect(
      calcularEsperado({
        efectivoInicialCop: 100000n,
        pagosEfectivoCop: [50000n, 30000n],
        retirosCop: [],
        gastosCop: [],
        ingresosExtraCop: [],
      }),
    ).toBe(180000n);
  });

  it("resta retiros y gastos", () => {
    expect(
      calcularEsperado({
        efectivoInicialCop: 100000n,
        pagosEfectivoCop: [50000n],
        retirosCop: [20000n],
        gastosCop: [10000n],
        ingresosExtraCop: [],
      }),
    ).toBe(120000n);
  });

  it("suma ingresos extra", () => {
    expect(
      calcularEsperado({
        efectivoInicialCop: 100000n,
        pagosEfectivoCop: [],
        retirosCop: [],
        gastosCop: [],
        ingresosExtraCop: [15000n],
      }),
    ).toBe(115000n);
  });

  it("combina todo", () => {
    expect(
      calcularEsperado({
        efectivoInicialCop: 100000n,
        pagosEfectivoCop: [50000n, 30000n],
        retirosCop: [20000n],
        gastosCop: [5000n],
        ingresosExtraCop: [10000n],
      }),
    ).toBe(165000n);
  });
});

describe("calcularDiferencia", () => {
  it("cero cuando el declarado coincide con el esperado", () => {
    expect(calcularDiferencia(100000n, 100000n)).toBe(0n);
  });
  it("positiva cuando hay más efectivo del esperado", () => {
    expect(calcularDiferencia(105000n, 100000n)).toBe(5000n);
  });
  it("negativa cuando falta efectivo", () => {
    expect(calcularDiferencia(95000n, 100000n)).toBe(-5000n);
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `pnpm vitest run tests/unit/caja-arqueo.test.ts`
Expected: FAIL — `Cannot find module '@/lib/caja/arqueo'`

- [ ] **Step 3: Implementar `arqueo.ts`**

```typescript
// lib/caja/arqueo.ts
import { sumar, type MontoCOP } from "@/lib/money";

export interface DatosArqueo {
  efectivoInicialCop: MontoCOP;
  pagosEfectivoCop: MontoCOP[];
  retirosCop: MontoCOP[];
  gastosCop: MontoCOP[];
  ingresosExtraCop: MontoCOP[];
}

/** Documenta y prueba en TypeScript la MISMA fórmula que implementa el RPC
 *  cerrar_turno en SQL (supabase/migrations/20260714110000_rpcs_turno_cobro.sql)
 *  — el RPC es la fuente de verdad ejecutada al cerrar, esta función se usa
 *  para la vista previa antes de confirmar y para cobertura de TDD
 *  (CLAUDE.md §4.1). Si se cambia una, cambiar la otra. */
export function calcularEsperado(datos: DatosArqueo): MontoCOP {
  return sumar(
    datos.efectivoInicialCop,
    ...datos.pagosEfectivoCop,
    ...datos.retirosCop.map((m) => -m),
    ...datos.gastosCop.map((m) => -m),
    ...datos.ingresosExtraCop,
  );
}

export function calcularDiferencia(efectivoDeclaradoCop: MontoCOP, esperadoCop: MontoCOP): MontoCOP {
  return efectivoDeclaradoCop - esperadoCop;
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `pnpm vitest run tests/unit/caja-arqueo.test.ts`
Expected: PASS — 8/8

- [ ] **Step 5: Escribir los tests de `cuadrePago.ts` (fallan primero)**

```typescript
// tests/unit/caja-cuadre-pago.test.ts
import { describe, expect, it } from "vitest";
import { pagosCuadranConTotal } from "@/lib/caja/cuadrePago";

describe("pagosCuadranConTotal", () => {
  it("un solo pago que coincide exacto", () => {
    expect(pagosCuadranConTotal([50000n], 50000n)).toBe(true);
  });
  it("pago mixto que suma exacto", () => {
    expect(pagosCuadranConTotal([30000n, 20000n], 50000n)).toBe(true);
  });
  it("suma menor al total: no cuadra", () => {
    expect(pagosCuadranConTotal([30000n], 50000n)).toBe(false);
  });
  it("suma mayor al total: no cuadra", () => {
    expect(pagosCuadranConTotal([60000n], 50000n)).toBe(false);
  });
  it("sin pagos: no cuadra salvo total cero", () => {
    expect(pagosCuadranConTotal([], 50000n)).toBe(false);
    expect(pagosCuadranConTotal([], 0n)).toBe(true);
  });
});
```

- [ ] **Step 6: Correr y verificar que fallan**

Run: `pnpm vitest run tests/unit/caja-cuadre-pago.test.ts`
Expected: FAIL — `Cannot find module '@/lib/caja/cuadrePago'`

- [ ] **Step 7: Implementar `cuadrePago.ts`**

```typescript
// lib/caja/cuadrePago.ts
import { sumar, type MontoCOP } from "@/lib/money";

/** ¿La suma de los pagos cuadra exactamente con el total del pedido?
 *  CLAUDE.md §2.3: la suma debe cuadrar con el total, sin margen — un pago
 *  mixto que deja diferencia a favor de la casa o del cliente no se acepta.
 *  Documenta/prueba la misma regla que valida el RPC cobrar_pedido en SQL. */
export function pagosCuadranConTotal(montosPagoCop: MontoCOP[], totalCop: MontoCOP): boolean {
  return sumar(...montosPagoCop) === totalCop;
}
```

- [ ] **Step 8: Correr y verificar que pasan**

Run: `pnpm vitest run tests/unit/caja-cuadre-pago.test.ts`
Expected: PASS — 5/5

- [ ] **Step 9: Correr toda la suite**

Run: `pnpm lint && pnpm test`
Expected: todo verde, 117 + 13 = 130 tests.

- [ ] **Step 10: Commit**

```bash
git add lib/caja/arqueo.ts lib/caja/cuadrePago.ts tests/unit/caja-arqueo.test.ts tests/unit/caja-cuadre-pago.test.ts
git commit -m "feat: funciones puras de arqueo y cuadre de pago mixto (TDD)"
```

---

### Task 4: Funciones puras — builder ESC/POS (TDD)

**Files:**
- Create: `lib/escpos/contenido.ts`
- Create: `lib/escpos/codificar.ts`
- Test: `tests/unit/escpos-contenido.test.ts`
- Test: `tests/unit/escpos-codificar.test.ts`

**Interfaces:**
- Consumes: `formatearCOP`, `type MontoCOP` de `lib/money.ts`; `formatearFecha` de `lib/dates.ts`.
- Produces: `construirLineasTicket(datos: DatosTicket): string[]`; `codificarEscPos(lineas: string[]): string` (retorna base64) — usadas por la Server Action de cobro (Task 7).

- [ ] **Step 1: Escribir los tests de `contenido.ts` (fallan primero)**

```typescript
// tests/unit/escpos-contenido.test.ts
import { describe, expect, it } from "vitest";
import { construirLineasTicket, type DatosTicket } from "@/lib/escpos/contenido";

const datosBase: DatosTicket = {
  sedeNombre: "Criollitas Armenia",
  numeroCorto: 42,
  fecha: new Date("2026-07-14T18:30:00.000Z"),
  origen: "Mesa 3",
  items: [
    { cantidad: 2, nombre: "Arepa de Chicharrón", subtotalCop: 3000000n },
    { cantidad: 1, nombre: "Jugo de Mora", subtotalCop: 700000n },
  ],
  subtotalCop: 3700000n,
  totalCop: 3700000n,
  pagos: [{ metodo: "efectivo", montoCop: 3700000n }],
};

describe("construirLineasTicket", () => {
  it("incluye el nombre de la marca y la sede", () => {
    const lineas = construirLineasTicket(datosBase);
    expect(lineas).toContain("Criollitas — Arepas Rellenas");
    expect(lineas).toContain("Criollitas Armenia");
  });

  it("incluye el número de pedido y el origen", () => {
    const lineas = construirLineasTicket(datosBase);
    expect(lineas.some((l) => l.includes("#42"))).toBe(true);
    expect(lineas).toContain("Mesa 3");
  });

  it("incluye cada ítem con cantidad y nombre", () => {
    const lineas = construirLineasTicket(datosBase);
    expect(lineas.some((l) => l.includes("2x Arepa de Chicharrón"))).toBe(true);
    expect(lineas.some((l) => l.includes("1x Jugo de Mora"))).toBe(true);
  });

  it("incluye el total formateado", () => {
    const lineas = construirLineasTicket(datosBase);
    expect(lineas.some((l) => l.includes("TOTAL") && l.includes("$ 37.000"))).toBe(true);
  });

  it("incluye cada método de pago con su monto", () => {
    const lineas = construirLineasTicket({
      ...datosBase,
      pagos: [
        { metodo: "efectivo", montoCop: 2000000n },
        { metodo: "nequi", montoCop: 1700000n },
      ],
    });
    expect(lineas.some((l) => l.includes("Efectivo") && l.includes("$ 20.000"))).toBe(true);
    expect(lineas.some((l) => l.includes("Nequi") && l.includes("$ 17.000"))).toBe(true);
  });

  it("origen domicilio se muestra tal cual", () => {
    const lineas = construirLineasTicket({ ...datosBase, origen: "Domicilio" });
    expect(lineas).toContain("Domicilio");
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `pnpm vitest run tests/unit/escpos-contenido.test.ts`
Expected: FAIL — `Cannot find module '@/lib/escpos/contenido'`

- [ ] **Step 3: Implementar `contenido.ts`**

```typescript
// lib/escpos/contenido.ts
import { formatearCOP, type MontoCOP } from "@/lib/money";
import { formatearFecha } from "@/lib/dates";

export interface ItemTicket {
  cantidad: number;
  nombre: string;
  subtotalCop: MontoCOP;
}

export interface PagoTicket {
  metodo: string;
  montoCop: MontoCOP;
}

export interface DatosTicket {
  sedeNombre: string;
  numeroCorto: number;
  fecha: Date;
  origen: string;
  items: ItemTicket[];
  subtotalCop: MontoCOP;
  totalCop: MontoCOP;
  pagos: PagoTicket[];
}

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  nequi: "Nequi",
  daviplata: "Daviplata",
  bancolombia_qr: "Bancolombia QR",
  datafono: "Datáfono",
  otro: "Otro",
};

/** Arma las líneas de texto de la tirilla de cobro (CLAUDE.md §2.6, §10.2).
 *  Función pura: no sabe nada de ESC/POS, solo decide qué contenido va y en
 *  qué orden — la codificación a bytes vive en codificarEscPos. */
export function construirLineasTicket(datos: DatosTicket): string[] {
  const lineas: string[] = [];
  lineas.push("Criollitas — Arepas Rellenas");
  lineas.push(datos.sedeNombre);
  lineas.push("--------------------------------");
  lineas.push(`Pedido #${datos.numeroCorto}`);
  lineas.push(formatearFecha(datos.fecha));
  lineas.push(datos.origen);
  lineas.push("--------------------------------");
  for (const item of datos.items) {
    lineas.push(`${item.cantidad}x ${item.nombre}`);
    lineas.push(`  ${formatearCOP(item.subtotalCop)}`);
  }
  lineas.push("--------------------------------");
  lineas.push(`Subtotal: ${formatearCOP(datos.subtotalCop)}`);
  lineas.push(`TOTAL: ${formatearCOP(datos.totalCop)}`);
  lineas.push("--------------------------------");
  for (const pago of datos.pagos) {
    lineas.push(`${ETIQUETA_METODO[pago.metodo] ?? pago.metodo}: ${formatearCOP(pago.montoCop)}`);
  }
  lineas.push("--------------------------------");
  lineas.push("¡Gracias por tu compra!");
  lineas.push("@criollitas_armenia");
  return lineas;
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `pnpm vitest run tests/unit/escpos-contenido.test.ts`
Expected: PASS — 6/6

- [ ] **Step 5: Escribir los tests de `codificar.ts` (fallan primero)**

```typescript
// tests/unit/escpos-codificar.test.ts
import { describe, expect, it } from "vitest";
import { codificarEscPos } from "@/lib/escpos/codificar";

describe("codificarEscPos", () => {
  it("devuelve una cadena base64 válida", () => {
    const resultado = codificarEscPos(["Línea 1", "Línea 2"]);
    expect(() => Buffer.from(resultado, "base64")).not.toThrow();
  });

  it("el payload decodificado empieza con el reset de impresora (ESC @)", () => {
    const resultado = codificarEscPos(["Hola"]);
    const bytes = Buffer.from(resultado, "base64");
    expect(bytes[0]).toBe(0x1b);
    expect(bytes[1]).toBe(0x40);
  });

  it("el payload decodificado contiene el texto de cada línea", () => {
    const resultado = codificarEscPos(["Pedido #42", "Total: $ 10.000"]);
    const texto = Buffer.from(resultado, "base64").toString("binary");
    expect(texto).toContain("Pedido #42");
    expect(texto).toContain("Total: $ 10.000");
  });

  it("el payload decodificado termina con el corte de papel (GS V 0)", () => {
    const resultado = codificarEscPos(["Hola"]);
    const bytes = Buffer.from(resultado, "base64");
    const ultimos3 = bytes.subarray(bytes.length - 3);
    expect(ultimos3[0]).toBe(0x1d);
    expect(ultimos3[1]).toBe(0x56);
    expect(ultimos3[2]).toBe(0x00);
  });
});
```

- [ ] **Step 6: Correr y verificar que fallan**

Run: `pnpm vitest run tests/unit/escpos-codificar.test.ts`
Expected: FAIL — `Cannot find module '@/lib/escpos/codificar'`

- [ ] **Step 7: Implementar `codificar.ts`**

```typescript
// lib/escpos/codificar.ts
const ESC = "\x1B";
const GS = "\x1D";
const INICIALIZAR = `${ESC}@`; // ESC @ : reset de la impresora
const CORTE = `${GS}V\x00`; // GS V 0 : corte total de papel

/** Codifica líneas de texto plano a un payload ESC/POS en base64, listo
 *  para enviar al print-bridge (CLAUDE.md §10.1). Antepone el reset de
 *  impresora, une las líneas con salto de línea, y agrega el corte de
 *  papel al final. */
export function codificarEscPos(lineas: string[]): string {
  const cuerpo = lineas.join("\n") + "\n";
  const payload = INICIALIZAR + cuerpo + CORTE;
  return Buffer.from(payload, "binary").toString("base64");
}
```

- [ ] **Step 8: Correr y verificar que pasan**

Run: `pnpm vitest run tests/unit/escpos-codificar.test.ts`
Expected: PASS — 4/4

- [ ] **Step 9: Correr toda la suite**

Run: `pnpm lint && pnpm test`
Expected: todo verde, 130 + 10 = 140 tests.

- [ ] **Step 10: Commit**

```bash
git add lib/escpos/contenido.ts lib/escpos/codificar.ts tests/unit/escpos-contenido.test.ts tests/unit/escpos-codificar.test.ts
git commit -m "feat: builder ESC/POS de la tirilla de cobro (TDD)"
```

---

### Task 5: Validaciones Zod — turno y cobro

**Files:**
- Create: `lib/validations/turno.ts`
- Create: `lib/validations/cobro.ts`

**Interfaces:**
- Produces: `efectivoInicialSchema`/`EfectivoInicialInput`, `movimientoSchema`/`MovimientoInput`, `cierreTurnoSchema`/`CierreTurnoInput`; `pagoSchema`/`PagoInput`, `cobrarPedidoSchema`/`CobrarPedidoInput` — usados por las Server Actions (Tasks 6-7) y los formularios (Tasks 8-9).

- [ ] **Step 1: Implementar `lib/validations/turno.ts`**

```typescript
// lib/validations/turno.ts
import { z } from "zod";

export const efectivoInicialSchema = z.object({
  efectivoInicialPesos: z
    .number("Escribe el efectivo inicial")
    .int("No se admiten centavos")
    .min(0, "El efectivo inicial no puede ser negativo"),
});
export type EfectivoInicialInput = z.infer<typeof efectivoInicialSchema>;

export const movimientoSchema = z.object({
  tipo: z.enum(["retiro", "gasto", "ingreso_extra"], "Elige un tipo de movimiento"),
  concepto: z.string().min(3, "Escribe el concepto del movimiento").max(200, "El concepto es demasiado largo"),
  montoPesos: z
    .number("Escribe el monto")
    .int("No se admiten centavos")
    .min(1, "El monto debe ser mayor a cero"),
});
export type MovimientoInput = z.infer<typeof movimientoSchema>;

export const cierreTurnoSchema = z.object({
  efectivoDeclaradoPesos: z
    .number("Escribe el efectivo contado")
    .int("No se admiten centavos")
    .min(0, "El efectivo contado no puede ser negativo"),
});
export type CierreTurnoInput = z.infer<typeof cierreTurnoSchema>;
```

- [ ] **Step 2: Implementar `lib/validations/cobro.ts`**

```typescript
// lib/validations/cobro.ts
import { z } from "zod";

export const pagoSchema = z.object({
  metodo: z.enum(["efectivo", "nequi", "daviplata", "bancolombia_qr", "datafono", "otro"], "Elige un método de pago"),
  montoPesos: z
    .number("Escribe el monto")
    .int("No se admiten centavos")
    .min(1, "El monto debe ser mayor a cero"),
  referencia: z.string().max(100, "La referencia es demasiado larga").optional(),
});
export type PagoInput = z.infer<typeof pagoSchema>;

export const cobrarPedidoSchema = z.object({
  pagos: z.array(pagoSchema).min(1, "Agrega al menos un pago"),
});
export type CobrarPedidoInput = z.infer<typeof cobrarPedidoSchema>;
```

- [ ] **Step 3: Verificar suite**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 140/140 tests (esta tarea no agrega tests — esquemas Zod puros sin lógica propia más allá de lo que Zod ya valida, mismo precedente de `lib/validations/pedido.ts`).

- [ ] **Step 4: Commit**

```bash
git add lib/validations/turno.ts lib/validations/cobro.ts
git commit -m "feat: esquemas Zod de turno y cobro"
```

---

### Task 6: Server Actions de turno — abrir, movimiento, cerrar

**Files:**
- Create: `app/(cajera)/turno/actions.ts`

**Interfaces:**
- Consumes: `efectivoInicialSchema`, `movimientoSchema`, `cierreTurnoSchema` (Task 5); `montoDesdePesos` de `lib/money.ts`; RPC `cerrar_turno` (Task 2); `SEDE_DEFAULT_ID` de `lib/auth/roles.ts`.
- Produces: `abrirTurno(input: unknown): Promise<Result<{turnoId: string}, DomainError>>`; `registrarMovimiento(input: unknown): Promise<Result<null, DomainError>>`; `cerrarTurno(input: unknown): Promise<Result<null, DomainError>>` — usadas por las páginas de la Task 8.

- [ ] **Step 1: Implementar la Server Action**

```typescript
// app/(cajera)/turno/actions.ts
"use server";

import { revalidatePath } from "next/cache";

import { err, ok, type DomainError, type Result } from "@/lib/result";
import { createServerSupabase } from "@/lib/supabase/server";
import { montoDesdePesos } from "@/lib/money";
import { efectivoInicialSchema, movimientoSchema, cierreTurnoSchema } from "@/lib/validations/turno";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";

async function exigirCajera(): Promise<Result<{ cajeraId: string; sedeId: string }, DomainError>> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return err({ codigo: "NO_AUTORIZADO", mensaje: "Inicia sesión de nuevo" });
  if (user.app_metadata?.rol !== "cajera") {
    return err({ codigo: "NO_AUTORIZADO", mensaje: "Solo la cajera puede hacer esto" });
  }
  const sedeId = (user.app_metadata?.sede_id as string | undefined) ?? SEDE_DEFAULT_ID;
  return ok({ cajeraId: user.id, sedeId });
}

async function turnoAbiertoDe(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  cajeraId: string,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from("turnos_caja")
    .select("id")
    .eq("cajera_id", cajeraId)
    .eq("estado", "abierto")
    .maybeSingle();
  return data;
}

export async function abrirTurno(input: unknown): Promise<Result<{ turnoId: string }, DomainError>> {
  const ctx = await exigirCajera();
  if (!ctx.ok) return ctx;
  const parsed = efectivoInicialSchema.safeParse(input);
  if (!parsed.success) {
    return err({ codigo: "VALIDACION", mensaje: parsed.error.issues[0]?.message ?? "Datos inválidos" });
  }
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from("turnos_caja")
    .insert({
      sede_id: ctx.valor.sedeId,
      cajera_id: ctx.valor.cajeraId,
      efectivo_inicial_cop: Number(montoDesdePesos(parsed.data.efectivoInicialPesos)),
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return err({ codigo: "VALIDACION", mensaje: "Ya tienes un turno abierto" });
    }
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos abrir el turno. Intenta de nuevo." });
  }
  if (!data) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos abrir el turno. Intenta de nuevo." });
  }
  revalidatePath("/mi-turno");
  return ok({ turnoId: data.id });
}

export async function registrarMovimiento(input: unknown): Promise<Result<null, DomainError>> {
  const ctx = await exigirCajera();
  if (!ctx.ok) return ctx;
  const parsed = movimientoSchema.safeParse(input);
  if (!parsed.success) {
    return err({ codigo: "VALIDACION", mensaje: parsed.error.issues[0]?.message ?? "Datos inválidos" });
  }
  const supabase = await createServerSupabase();

  const turno = await turnoAbiertoDe(supabase, ctx.valor.cajeraId);
  if (!turno) {
    return err({ codigo: "VALIDACION", mensaje: "No tienes un turno abierto" });
  }

  const { error } = await supabase.from("movimientos_caja").insert({
    turno_id: turno.id,
    tipo: parsed.data.tipo,
    concepto: parsed.data.concepto,
    monto_cop: Number(montoDesdePesos(parsed.data.montoPesos)),
  });
  if (error) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos registrar el movimiento. Intenta de nuevo." });
  }
  revalidatePath("/mi-turno");
  return ok(null);
}

export async function cerrarTurno(input: unknown): Promise<Result<null, DomainError>> {
  const ctx = await exigirCajera();
  if (!ctx.ok) return ctx;
  const parsed = cierreTurnoSchema.safeParse(input);
  if (!parsed.success) {
    return err({ codigo: "VALIDACION", mensaje: parsed.error.issues[0]?.message ?? "Datos inválidos" });
  }
  const supabase = await createServerSupabase();

  const turno = await turnoAbiertoDe(supabase, ctx.valor.cajeraId);
  if (!turno) {
    return err({ codigo: "VALIDACION", mensaje: "No tienes un turno abierto" });
  }

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

- [ ] **Step 2: Verificar suite**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 140/140 tests (Server Action ligada a Supabase, sin test unitario dedicado — precedente de los Bloques 4-6).

- [ ] **Step 3: Commit**

```bash
git add "app/(cajera)/turno/actions.ts"
git commit -m "feat: server actions de turno (abrir, movimiento, cerrar)"
```

---

### Task 7: Server Action de cobro — cobrarPedido, impresión y reintento

**Files:**
- Create: `app/(cajera)/cobrar/actions.ts`

**Interfaces:**
- Consumes: `cobrarPedidoSchema`, `type CobrarPedidoInput` (Task 5); `montoDesdePesos` de `lib/money.ts`; `construirLineasTicket`, `type DatosTicket` (Task 4); `codificarEscPos` (Task 4); `ahoraBogota` de `lib/dates.ts`; RPC `cobrar_pedido` (Task 2).
- Produces: `cobrarPedido(pedidoId: string, input: CobrarPedidoInput): Promise<Result<null, DomainError>>`; `reintentarImpresion(impresionId: string): Promise<Result<null, DomainError>>` — usadas por la página `/cobrar/[pedidoId]` de la Task 9.

**Variables de entorno consumidas** (ya listadas en CLAUDE.md §14, sin crear ninguna nueva): `PRINT_BRIDGE_URL`, `PRINT_BRIDGE_TOKEN`.

- [ ] **Step 1: Implementar la Server Action**

```typescript
// app/(cajera)/cobrar/actions.ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { err, ok, type DomainError, type Result } from "@/lib/result";
import { createServerSupabase } from "@/lib/supabase/server";
import { montoDesdePesos } from "@/lib/money";
import { cobrarPedidoSchema, type CobrarPedidoInput } from "@/lib/validations/cobro";
import { construirLineasTicket, type DatosTicket } from "@/lib/escpos/contenido";
import { codificarEscPos } from "@/lib/escpos/codificar";
import { ahoraBogota } from "@/lib/dates";

const uuidValido = (valor: string): boolean => z.uuid().safeParse(valor).success;

async function exigirCajera(): Promise<Result<{ cajeraId: string }, DomainError>> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return err({ codigo: "NO_AUTORIZADO", mensaje: "Inicia sesión de nuevo" });
  if (user.app_metadata?.rol !== "cajera") {
    return err({ codigo: "NO_AUTORIZADO", mensaje: "Solo la cajera puede cobrar" });
  }
  return ok({ cajeraId: user.id });
}

async function enviarAlPrintBridge(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  impresionId: string,
  contenidoBase64: string,
): Promise<void> {
  try {
    const respuesta = await fetch(`${process.env.PRINT_BRIDGE_URL}/print`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Bridge-Token": process.env.PRINT_BRIDGE_TOKEN ?? "",
      },
      body: JSON.stringify({ printer: "caja-01", escpos_base64: contenidoBase64 }),
      signal: AbortSignal.timeout(5000),
    });
    await supabase
      .from("impresiones")
      .update({
        enviado_en: new Date().toISOString(),
        exito: respuesta.ok,
        error: respuesta.ok ? null : `HTTP ${respuesta.status}`,
      })
      .eq("id", impresionId);
  } catch (error) {
    await supabase
      .from("impresiones")
      .update({
        enviado_en: new Date().toISOString(),
        exito: false,
        error: error instanceof Error ? error.message : "Error de red",
      })
      .eq("id", impresionId);
  }
}

/** Arma el ticket y lo manda al print-bridge, después de que el cobro ya se
 *  confirmó (CLAUDE.md §10.2: el pago nunca depende de que la impresora
 *  esté disponible). Si algo falla aquí, no revierte el cobro. */
async function intentarImprimirTirilla(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  pedidoId: string,
  pagos: CobrarPedidoInput["pagos"],
): Promise<void> {
  const { data: pedidoFila } = await supabase
    .from("pedidos")
    .select("numero_corto, canal, mesa_id, subtotal_cop, total_cop, sede_id")
    .eq("id", pedidoId)
    .single();
  if (!pedidoFila) return;

  const { data: sedeFila } = await supabase
    .from("sedes")
    .select("nombre")
    .eq("id", pedidoFila.sede_id)
    .single();

  let origen = "Para llevar";
  if (pedidoFila.canal === "mesa" && pedidoFila.mesa_id) {
    const { data: mesaFila } = await supabase
      .from("mesas")
      .select("numero")
      .eq("id", pedidoFila.mesa_id)
      .single();
    origen = mesaFila ? `Mesa ${mesaFila.numero}` : "Mesa";
  } else if (pedidoFila.canal === "domicilio") {
    origen = "Domicilio";
  }

  const { data: itemsFilas } = await supabase
    .from("pedido_items")
    .select("cantidad, subtotal_cop, producto_id")
    .eq("pedido_id", pedidoId);
  const productoIds = [...new Set((itemsFilas ?? []).map((i) => i.producto_id))];
  const { data: productosFilas } = productoIds.length
    ? await supabase.from("productos").select("id, nombre").in("id", productoIds)
    : { data: [] as { id: string; nombre: string }[] };
  const nombrePorId = new Map((productosFilas ?? []).map((p) => [p.id, p.nombre]));

  const datosTicket: DatosTicket = {
    sedeNombre: sedeFila?.nombre ?? "Criollitas",
    numeroCorto: pedidoFila.numero_corto,
    fecha: ahoraBogota(),
    origen,
    items: (itemsFilas ?? []).map((i) => ({
      cantidad: i.cantidad,
      nombre: nombrePorId.get(i.producto_id) ?? "Producto",
      subtotalCop: BigInt(i.subtotal_cop),
    })),
    subtotalCop: BigInt(pedidoFila.subtotal_cop),
    totalCop: BigInt(pedidoFila.total_cop),
    pagos: pagos.map((p) => ({ metodo: p.metodo, montoCop: montoDesdePesos(p.montoPesos) })),
  };

  const contenidoBase64 = codificarEscPos(construirLineasTicket(datosTicket));

  const { data: impresionFila } = await supabase
    .from("impresiones")
    .insert({ pedido_id: pedidoId, tipo: "tirilla_cobro", contenido_escpos: contenidoBase64 })
    .select("id")
    .single();
  if (!impresionFila) return;

  await enviarAlPrintBridge(supabase, impresionFila.id, contenidoBase64);
}

export async function cobrarPedido(
  pedidoId: string,
  input: CobrarPedidoInput,
): Promise<Result<null, DomainError>> {
  const ctx = await exigirCajera();
  if (!ctx.ok) return ctx;
  if (!uuidValido(pedidoId)) {
    return err({ codigo: "VALIDACION", mensaje: "Identificador de pedido inválido" });
  }
  const parsed = cobrarPedidoSchema.safeParse(input);
  if (!parsed.success) {
    return err({ codigo: "VALIDACION", mensaje: parsed.error.issues[0]?.message ?? "Datos inválidos" });
  }
  const supabase = await createServerSupabase();

  const { data: turno } = await supabase
    .from("turnos_caja")
    .select("id")
    .eq("cajera_id", ctx.valor.cajeraId)
    .eq("estado", "abierto")
    .maybeSingle();
  if (!turno) {
    return err({ codigo: "VALIDACION", mensaje: "Abre tu turno antes de cobrar" });
  }

  const pagosParaRpc = parsed.data.pagos.map((pago) => ({
    metodo: pago.metodo,
    monto_cop: Number(montoDesdePesos(pago.montoPesos)),
    referencia: pago.referencia ?? null,
  }));

  const { error: errorCobro } = await supabase.rpc("cobrar_pedido", {
    p_pedido_id: pedidoId,
    p_turno_id: turno.id,
    p_pagos: pagosParaRpc,
  });
  if (errorCobro) {
    return err({
      codigo: "VALIDACION",
      mensaje: "No pudimos cobrar el pedido. Verifica el total e intenta de nuevo.",
    });
  }

  await intentarImprimirTirilla(supabase, pedidoId, parsed.data.pagos);

  revalidatePath("/pedidos");
  revalidatePath(`/cobrar/${pedidoId}`);
  return ok(null);
}

export async function reintentarImpresion(impresionId: string): Promise<Result<null, DomainError>> {
  const ctx = await exigirCajera();
  if (!ctx.ok) return ctx;
  if (!uuidValido(impresionId)) {
    return err({ codigo: "VALIDACION", mensaje: "Identificador inválido" });
  }
  const supabase = await createServerSupabase();
  const { data: impresionFila } = await supabase
    .from("impresiones")
    .select("id, contenido_escpos")
    .eq("id", impresionId)
    .single();
  if (!impresionFila) {
    return err({ codigo: "NO_ENCONTRADO", mensaje: "No encontramos esa impresión" });
  }
  await enviarAlPrintBridge(supabase, impresionFila.id, impresionFila.contenido_escpos);
  const { data: actualizada } = await supabase
    .from("impresiones")
    .select("exito")
    .eq("id", impresionId)
    .single();
  if (!actualizada?.exito) {
    return err({ codigo: "BASE_DATOS", mensaje: "La impresora no respondió. Intenta de nuevo." });
  }
  return ok(null);
}
```

- [ ] **Step 2: Verificar suite**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 140/140 tests.

- [ ] **Step 3: Commit**

```bash
git add "app/(cajera)/cobrar/actions.ts"
git commit -m "feat: server action de cobro con impresion de tirilla y reintento"
```

---

### Task 8: Páginas de turno — abrir, movimientos, cerrar, mi-turno

**Files:**
- Create: `app/(cajera)/turno/abrir/page.tsx`
- Create: `components/caja/FormularioAbrirTurno.tsx`
- Create: `app/(cajera)/turno/movimientos/page.tsx`
- Create: `components/caja/FormularioMovimiento.tsx`
- Create: `app/(cajera)/turno/cerrar/page.tsx`
- Create: `components/caja/FormularioCerrarTurno.tsx`
- Create: `app/(cajera)/mi-turno/page.tsx`

**Interfaces:**
- Consumes: `abrirTurno`, `registrarMovimiento`, `cerrarTurno` (Task 6); `calcularEsperado`, `type DatosArqueo` (Task 3); `formatearCOP`, `montoDesdePesos` de `lib/money.ts`; `ClayButton`, `ClayCard`, `ClayInput`, `ClayModal` de `components/ui/`.

- [ ] **Step 1: Página y formulario de apertura**

```typescript
// components/caja/FormularioAbrirTurno.tsx
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

```typescript
// app/(cajera)/turno/abrir/page.tsx
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { FormularioAbrirTurno } from "@/components/caja/FormularioAbrirTurno";

export default async function AbrirTurnoPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.rol !== "cajera") {
    redirect("/login");
  }

  const { data: turnoAbierto } = await supabase
    .from("turnos_caja")
    .select("id")
    .eq("cajera_id", user.id)
    .eq("estado", "abierto")
    .maybeSingle();
  if (turnoAbierto) {
    redirect("/mi-turno");
  }

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Abrir turno</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">Declara el efectivo con el que empiezas la caja.</p>
      <FormularioAbrirTurno />
    </main>
  );
}
```

- [ ] **Step 2: Página y formulario de movimientos**

```typescript
// components/caja/FormularioMovimiento.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayInput } from "@/components/ui/ClayInput";
import { movimientoSchema, type MovimientoInput } from "@/lib/validations/turno";
import { registrarMovimiento } from "@/app/(cajera)/turno/actions";

const ETIQUETA_TIPO: Record<MovimientoInput["tipo"], string> = {
  retiro: "Retiro",
  gasto: "Gasto",
  ingreso_extra: "Ingreso extra",
};

export function FormularioMovimiento() {
  const router = useRouter();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MovimientoInput>({ resolver: zodResolver(movimientoSchema) });

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

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="tipo-movimiento" className="font-display text-sm font-medium text-text-primary">
          Tipo de movimiento
        </label>
        <select
          id="tipo-movimiento"
          className="h-12 rounded-clay-md bg-surface-sunken px-4 text-base text-text-primary shadow-clay-pressed"
          {...register("tipo")}
        >
          {(Object.keys(ETIQUETA_TIPO) as MovimientoInput["tipo"][]).map((tipo) => (
            <option key={tipo} value={tipo}>
              {ETIQUETA_TIPO[tipo]}
            </option>
          ))}
        </select>
        {errors.tipo ? <p className="text-sm text-brand-tomate-2">{errors.tipo.message}</p> : null}
      </div>
      <ClayInput label="Concepto" placeholder="Ej: compra de bolsas" error={errors.concepto?.message} {...register("concepto")} />
      <ClayInput
        label="Monto (pesos)"
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        error={errors.montoPesos?.message}
        {...register("montoPesos", { valueAsNumber: true })}
      />
      {errorGeneral ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {errorGeneral}
        </p>
      ) : null}
      <ClayButton type="submit" variant="primary" disabled={isSubmitting}>
        {isSubmitting ? "Guardando…" : "Registrar movimiento"}
      </ClayButton>
    </form>
  );
}
```

```typescript
// app/(cajera)/turno/movimientos/page.tsx
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { FormularioMovimiento } from "@/components/caja/FormularioMovimiento";
import { formatearCOP } from "@/lib/money";

export default async function MovimientosPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.rol !== "cajera") {
    redirect("/login");
  }

  const { data: turno } = await supabase
    .from("turnos_caja")
    .select("id")
    .eq("cajera_id", user.id)
    .eq("estado", "abierto")
    .maybeSingle();
  if (!turno) {
    redirect("/turno/abrir");
  }

  const { data: movimientos } = await supabase
    .from("movimientos_caja")
    .select("id, tipo, concepto, monto_cop, creado_en")
    .eq("turno_id", turno.id)
    .order("creado_en", { ascending: false });

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Movimientos de caja</h1>
      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <FormularioMovimiento />
        <div className="flex flex-col gap-2">
          {(movimientos ?? []).map((m) => (
            <div key={m.id} className="rounded-clay-md bg-brand-crema-2 p-3 text-sm text-brand-chocolate">
              <p className="font-medium">{m.concepto}</p>
              <p className="text-brand-chocolate/70">{formatearCOP(BigInt(m.monto_cop))}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Página y formulario de cierre**

```typescript
// components/caja/FormularioCerrarTurno.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayInput } from "@/components/ui/ClayInput";
import { formatearCOP, type MontoCOP } from "@/lib/money";
import { cierreTurnoSchema, type CierreTurnoInput } from "@/lib/validations/turno";
import { cerrarTurno } from "@/app/(cajera)/turno/actions";

interface FormularioCerrarTurnoProps {
  esperadoCop: MontoCOP;
}

export function FormularioCerrarTurno({ esperadoCop }: FormularioCerrarTurnoProps) {
  const router = useRouter();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CierreTurnoInput>({ resolver: zodResolver(cierreTurnoSchema) });

  const onSubmit = handleSubmit(async (datos) => {
    setErrorGeneral(null);
    const resultado = await cerrarTurno(datos);
    if (!resultado.ok) {
      setErrorGeneral(resultado.error.mensaje);
      return;
    }
    router.push("/turno/abrir");
  });

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-4" noValidate>
      <p className="text-sm text-brand-chocolate/70">
        Efectivo esperado: <span className="font-mono font-semibold">{formatearCOP(esperadoCop)}</span>
      </p>
      <ClayInput
        label="Efectivo contado (pesos)"
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        error={errors.efectivoDeclaradoPesos?.message}
        {...register("efectivoDeclaradoPesos", { valueAsNumber: true })}
      />
      {errorGeneral ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {errorGeneral}
        </p>
      ) : null}
      <ClayButton type="submit" variant="destructive" size="lg" disabled={isSubmitting}>
        {isSubmitting ? "Cerrando…" : "Cerrar turno"}
      </ClayButton>
    </form>
  );
}
```

```typescript
// app/(cajera)/turno/cerrar/page.tsx
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { FormularioCerrarTurno } from "@/components/caja/FormularioCerrarTurno";
import { calcularEsperado } from "@/lib/caja/arqueo";

export default async function CerrarTurnoPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.rol !== "cajera") {
    redirect("/login");
  }

  const { data: turno } = await supabase
    .from("turnos_caja")
    .select("id, efectivo_inicial_cop")
    .eq("cajera_id", user.id)
    .eq("estado", "abierto")
    .maybeSingle();
  if (!turno) {
    redirect("/turno/abrir");
  }

  const { data: pagos } = await supabase
    .from("pagos")
    .select("monto_cop, metodo")
    .eq("turno_id", turno.id);
  const { data: movimientos } = await supabase
    .from("movimientos_caja")
    .select("monto_cop, tipo")
    .eq("turno_id", turno.id);

  const esperadoCop = calcularEsperado({
    efectivoInicialCop: BigInt(turno.efectivo_inicial_cop),
    pagosEfectivoCop: (pagos ?? []).filter((p) => p.metodo === "efectivo").map((p) => BigInt(p.monto_cop)),
    retirosCop: (movimientos ?? []).filter((m) => m.tipo === "retiro").map((m) => BigInt(m.monto_cop)),
    gastosCop: (movimientos ?? []).filter((m) => m.tipo === "gasto").map((m) => BigInt(m.monto_cop)),
    ingresosExtraCop: (movimientos ?? []).filter((m) => m.tipo === "ingreso_extra").map((m) => BigInt(m.monto_cop)),
  });

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Cerrar turno</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">Cuenta el efectivo en caja y declara el total.</p>
      <FormularioCerrarTurno esperadoCop={esperadoCop} />
    </main>
  );
}
```

- [ ] **Step 4: Página de solo lectura `/mi-turno`**

```typescript
// app/(cajera)/mi-turno/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { ClayButton } from "@/components/ui/ClayButton";
import { formatearCOP } from "@/lib/money";
import { calcularEsperado } from "@/lib/caja/arqueo";

export default async function MiTurnoPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.rol !== "cajera") {
    redirect("/login");
  }

  const { data: turno } = await supabase
    .from("turnos_caja")
    .select("id, abierto_en, efectivo_inicial_cop")
    .eq("cajera_id", user.id)
    .eq("estado", "abierto")
    .maybeSingle();
  if (!turno) {
    redirect("/turno/abrir");
  }

  const { data: pagos } = await supabase
    .from("pagos")
    .select("monto_cop, metodo")
    .eq("turno_id", turno.id);
  const { data: movimientos } = await supabase
    .from("movimientos_caja")
    .select("monto_cop, tipo")
    .eq("turno_id", turno.id);

  const esperadoCop = calcularEsperado({
    efectivoInicialCop: BigInt(turno.efectivo_inicial_cop),
    pagosEfectivoCop: (pagos ?? []).filter((p) => p.metodo === "efectivo").map((p) => BigInt(p.monto_cop)),
    retirosCop: (movimientos ?? []).filter((m) => m.tipo === "retiro").map((m) => BigInt(m.monto_cop)),
    gastosCop: (movimientos ?? []).filter((m) => m.tipo === "gasto").map((m) => BigInt(m.monto_cop)),
    ingresosExtraCop: (movimientos ?? []).filter((m) => m.tipo === "ingreso_extra").map((m) => BigInt(m.monto_cop)),
  });

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Mi turno</h1>
      <p className="mt-2 text-brand-crema/80">
        Abierto con {formatearCOP(BigInt(turno.efectivo_inicial_cop))} de efectivo inicial.
      </p>
      <p className="mt-2 text-lg text-brand-crema">
        Efectivo esperado ahora: <span className="font-mono font-semibold">{formatearCOP(esperadoCop)}</span>
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/pedidos">
          <ClayButton type="button" variant="primary">Cobrar pedidos</ClayButton>
        </Link>
        <Link href="/turno/movimientos">
          <ClayButton type="button" variant="secondary">Registrar movimiento</ClayButton>
        </Link>
        <Link href="/turno/cerrar">
          <ClayButton type="button" variant="destructive">Cerrar turno</ClayButton>
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Verificar suite**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 140/140 tests.

- [ ] **Step 6: Commit**

```bash
git add "app/(cajera)/turno" "app/(cajera)/mi-turno" components/caja/FormularioAbrirTurno.tsx components/caja/FormularioMovimiento.tsx components/caja/FormularioCerrarTurno.tsx
git commit -m "feat: paginas de turno (abrir, movimientos, cerrar, mi-turno)"
```

---

### Task 9: Cola de cobro y página de cobro — `/pedidos`, `/cobrar/[pedidoId]`

**Files:**
- Modify: `app/(cajera)/pedidos/page.tsx` (reemplaza el placeholder)
- Create: `components/caja/ColaCobro.tsx`
- Create: `components/caja/tipos.ts`
- Create: `app/(cajera)/cobrar/[pedidoId]/page.tsx`
- Create: `components/caja/FormularioCobro.tsx`

**Interfaces:**
- Consumes: `cobrarPedido`, `reintentarImpresion` (Task 7); `pagosCuadranConTotal` (Task 3); `pagoSchema`, `type PagoInput` (Task 5); `createClient` de `lib/supabase/client.ts`; `SEDE_DEFAULT_ID` de `lib/auth/roles.ts`.

- [ ] **Step 1: Tipos de vista**

```typescript
// components/caja/tipos.ts
export type CanalPedidoCaja = "mesa" | "domicilio" | "llevar";
export type EstadoPedidoCaja = "listo" | "entregado";

export interface PedidoColaVista {
  id: string;
  numeroCorto: number;
  canal: CanalPedidoCaja;
  estado: EstadoPedidoCaja;
  mesaNumero: number | null;
  clienteNombre: string | null;
  totalCop: number;
}
```

- [ ] **Step 2: Cola de cobro con Realtime**

```typescript
// components/caja/ColaCobro.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ClayCard } from "@/components/ui/ClayCard";
import { formatearCOP } from "@/lib/money";
import type { PedidoColaVista } from "@/components/caja/tipos";
import type { Database } from "@/lib/supabase/types";

type PedidoFila = Database["public"]["Tables"]["pedidos"]["Row"];

const ESTADOS_VISIBLES = new Set(["listo", "entregado"]);

interface ColaCobroProps {
  pedidosIniciales: PedidoColaVista[];
  sedeId: string;
}

function etiquetaOrigen(pedido: PedidoColaVista): string {
  if (pedido.canal === "mesa") return pedido.mesaNumero ? `Mesa ${pedido.mesaNumero}` : "Mesa";
  if (pedido.canal === "domicilio") return pedido.clienteNombre ?? "Domicilio";
  return "Para llevar";
}

async function cargarPedidoColaCompleto(
  supabase: ReturnType<typeof createClient>,
  pedidoId: string,
): Promise<PedidoColaVista | null> {
  const { data: pedidoFila } = await supabase
    .from("pedidos")
    .select("id, numero_corto, canal, estado, mesa_id, cliente_id, total_cop")
    .eq("id", pedidoId)
    .single();
  if (!pedidoFila) return null;

  let mesaNumero: number | null = null;
  if (pedidoFila.mesa_id) {
    const { data: mesaFila } = await supabase.from("mesas").select("numero").eq("id", pedidoFila.mesa_id).single();
    mesaNumero = mesaFila?.numero ?? null;
  }
  let clienteNombre: string | null = null;
  if (pedidoFila.cliente_id) {
    const { data: clienteFila } = await supabase
      .from("clientes_domicilio")
      .select("nombre")
      .eq("id", pedidoFila.cliente_id)
      .single();
    clienteNombre = clienteFila?.nombre ?? null;
  }

  return {
    id: pedidoFila.id,
    numeroCorto: pedidoFila.numero_corto,
    canal: pedidoFila.canal as PedidoColaVista["canal"],
    estado: pedidoFila.estado as PedidoColaVista["estado"],
    mesaNumero,
    clienteNombre,
    totalCop: pedidoFila.total_cop,
  };
}

/** Cola de pedidos por cobrar. Realtime sobre `pedidos` filtrado por sede —
 *  mismo patrón de 2 casos (patch in place / fetch completo al entrar) que
 *  `TableroKDS` del Bloque 6, sin canal de ítems porque esta cola no los
 *  necesita. */
export function ColaCobro({ pedidosIniciales, sedeId }: ColaCobroProps) {
  const [pedidos, setPedidos] = useState<PedidoColaVista[]>(pedidosIniciales);
  const pedidosRef = useRef(pedidos);
  pedidosRef.current = pedidos;

  useEffect(() => {
    setPedidos(pedidosIniciales);
  }, [pedidosIniciales]);

  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel(`cola_cobro:sede_${sedeId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pedidos", filter: `sede_id=eq.${sedeId}` },
        (payload: { new: Partial<PedidoFila> }) => {
          const fila = payload.new;
          if (!fila.id) return;
          const visible = fila.estado ? ESTADOS_VISIBLES.has(fila.estado) : false;
          const yaEstaba = pedidosRef.current.some((p) => p.id === fila.id);

          if (!visible) {
            if (yaEstaba) setPedidos((actual) => actual.filter((p) => p.id !== fila.id));
            return;
          }
          if (yaEstaba) {
            setPedidos((actual) =>
              actual.map((p) => (p.id === fila.id ? { ...p, estado: fila.estado as PedidoColaVista["estado"] } : p)),
            );
            return;
          }
          void cargarPedidoColaCompleto(supabase, fila.id).then((pedidoCompleto) => {
            if (!pedidoCompleto) return;
            setPedidos((actual) => (actual.some((p) => p.id === pedidoCompleto.id) ? actual : [...actual, pedidoCompleto]));
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [sedeId]);

  if (pedidos.length === 0) {
    return (
      <p className="rounded-clay-md bg-brand-chocolate-2 p-6 text-center text-xl text-brand-crema/70">
        No hay pedidos por cobrar.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
      {pedidos.map((pedido) => (
        <Link key={pedido.id} href={`/cobrar/${pedido.id}`}>
          <ClayCard variant="elevated" className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-2xl font-bold text-text-primary">#{pedido.numeroCorto}</span>
              <span className="text-sm text-text-secondary">{etiquetaOrigen(pedido)}</span>
            </div>
            <span className="font-mono text-lg text-text-primary">{formatearCOP(BigInt(pedido.totalCop))}</span>
          </ClayCard>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Página de la cola (reemplaza el placeholder)**

```typescript
// app/(cajera)/pedidos/page.tsx
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { ColaCobro } from "@/components/caja/ColaCobro";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";
import type { PedidoColaVista } from "@/components/caja/tipos";

export default async function PedidosCajaPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.rol !== "cajera") {
    redirect("/login");
  }
  const sedeId = (user.app_metadata?.sede_id as string | undefined) ?? SEDE_DEFAULT_ID;

  const { data: pedidosFilas } = await supabase
    .from("pedidos")
    .select("id, numero_corto, canal, estado, mesa_id, cliente_id, total_cop")
    .in("estado", ["listo", "entregado"])
    .order("numero_corto", { ascending: true });

  const mesaIds = [...new Set((pedidosFilas ?? []).map((p) => p.mesa_id).filter((id): id is string => !!id))];
  const { data: mesasFilas } = mesaIds.length
    ? await supabase.from("mesas").select("id, numero").in("id", mesaIds)
    : { data: [] as { id: string; numero: number }[] };
  const numeroMesaPorId = new Map((mesasFilas ?? []).map((m) => [m.id, m.numero]));

  const clienteIds = [...new Set((pedidosFilas ?? []).map((p) => p.cliente_id).filter((id): id is string => !!id))];
  const { data: clientesFilas } = clienteIds.length
    ? await supabase.from("clientes_domicilio").select("id, nombre").in("id", clienteIds)
    : { data: [] as { id: string; nombre: string }[] };
  const nombreClientePorId = new Map((clientesFilas ?? []).map((c) => [c.id, c.nombre]));

  const pedidos: PedidoColaVista[] = (pedidosFilas ?? []).map((p) => ({
    id: p.id,
    numeroCorto: p.numero_corto,
    canal: p.canal as PedidoColaVista["canal"],
    estado: p.estado as PedidoColaVista["estado"],
    mesaNumero: p.mesa_id ? (numeroMesaPorId.get(p.mesa_id) ?? null) : null,
    clienteNombre: p.cliente_id ? (nombreClientePorId.get(p.cliente_id) ?? null) : null,
    totalCop: p.total_cop,
  }));

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Pedidos por cobrar</h1>
      <div className="mt-6">
        <ColaCobro pedidosIniciales={pedidos} sedeId={sedeId} />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Formulario de cobro (cliente)**

```typescript
// components/caja/FormularioCobro.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayInput } from "@/components/ui/ClayInput";
import { formatearCOP, montoDesdePesos, sumar, type MontoCOP } from "@/lib/money";
import { pagosCuadranConTotal } from "@/lib/caja/cuadrePago";
import type { PagoInput } from "@/lib/validations/cobro";
import { cobrarPedido } from "@/app/(cajera)/cobrar/actions";

const ETIQUETA_METODO: Record<PagoInput["metodo"], string> = {
  efectivo: "Efectivo",
  nequi: "Nequi",
  daviplata: "Daviplata",
  bancolombia_qr: "Bancolombia QR",
  datafono: "Datáfono",
  otro: "Otro",
};

interface FilaPago {
  clave: string;
  metodo: PagoInput["metodo"];
  montoPesos: number;
}

interface FormularioCobroProps {
  pedidoId: string;
  totalCop: MontoCOP;
}

export function FormularioCobro({ pedidoId, totalCop }: FormularioCobroProps) {
  const router = useRouter();
  const [pagos, setPagos] = useState<FilaPago[]>([{ clave: crypto.randomUUID(), metodo: "efectivo", montoPesos: 0 }]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const montosCop = pagos.map((p) => montoDesdePesos(p.montoPesos || 0));
  const sumaCop = sumar(...montosCop);
  const cuadra = pagosCuadranConTotal(montosCop, totalCop);

  function agregarPago() {
    setPagos((actual) => [...actual, { clave: crypto.randomUUID(), metodo: "efectivo", montoPesos: 0 }]);
  }

  function quitarPago(clave: string) {
    setPagos((actual) => actual.filter((p) => p.clave !== clave));
  }

  function actualizarPago(clave: string, cambios: Partial<Pick<FilaPago, "metodo" | "montoPesos">>) {
    setPagos((actual) => actual.map((p) => (p.clave === clave ? { ...p, ...cambios } : p)));
  }

  async function confirmar() {
    if (!cuadra) return;
    setError(null);
    setEnviando(true);
    const resultado = await cobrarPedido(pedidoId, {
      pagos: pagos.map((p) => ({ metodo: p.metodo, montoPesos: p.montoPesos })),
    });
    setEnviando(false);
    if (!resultado.ok) {
      setError(resultado.error.mensaje);
      return;
    }
    router.push("/pedidos");
  }

  return (
    <div className="flex flex-col gap-4">
      {pagos.map((pago) => (
        <div key={pago.clave} className="flex items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="font-display text-sm font-medium text-text-primary">Método</label>
            <select
              value={pago.metodo}
              onChange={(evento) => actualizarPago(pago.clave, { metodo: evento.target.value as PagoInput["metodo"] })}
              className="h-12 rounded-clay-md bg-surface-sunken px-4 text-base text-text-primary shadow-clay-pressed"
            >
              {(Object.keys(ETIQUETA_METODO) as PagoInput["metodo"][]).map((metodo) => (
                <option key={metodo} value={metodo}>
                  {ETIQUETA_METODO[metodo]}
                </option>
              ))}
            </select>
          </div>
          <ClayInput
            label="Monto (pesos)"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={pago.montoPesos || ""}
            onChange={(evento) => actualizarPago(pago.clave, { montoPesos: Number(evento.target.value) || 0 })}
          />
          {pagos.length > 1 ? (
            <button
              type="button"
              aria-label="Quitar pago"
              onClick={() => quitarPago(pago.clave)}
              className="mb-1 text-brand-tomate-2 hover:text-brand-tomate"
            >
              ✕
            </button>
          ) : null}
        </div>
      ))}
      <ClayButton type="button" variant="secondary" size="sm" onClick={agregarPago}>
        + Agregar otro pago
      </ClayButton>

      <div className="flex items-center justify-between border-t border-black/10 pt-3">
        <span className="text-sm text-text-secondary">Total del pedido</span>
        <span className="font-mono text-lg font-semibold text-text-primary">{formatearCOP(totalCop)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-secondary">Suma de pagos</span>
        <span className={`font-mono text-lg font-semibold ${cuadra ? "text-brand-verde-2" : "text-brand-tomate-2"}`}>
          {formatearCOP(sumaCop)}
        </span>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {error}
        </p>
      ) : null}

      <ClayButton type="button" variant="primary" size="lg" disabled={!cuadra || enviando} onClick={confirmar}>
        {enviando ? "Cobrando…" : "Confirmar cobro"}
      </ClayButton>
    </div>
  );
}
```

- [ ] **Step 5: Página de cobro**

```typescript
// app/(cajera)/cobrar/[pedidoId]/page.tsx
import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { FormularioCobro } from "@/components/caja/FormularioCobro";
import { formatearCOP } from "@/lib/money";

interface PageProps {
  params: Promise<{ pedidoId: string }>;
}

export default async function CobrarPedidoPage({ params }: PageProps) {
  const { pedidoId } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.rol !== "cajera") {
    redirect("/login");
  }

  const { data: pedidoFila } = await supabase
    .from("pedidos")
    .select("id, numero_corto, estado, canal, mesa_id, cliente_id, total_cop")
    .eq("id", pedidoId)
    .single();
  if (!pedidoFila || !["listo", "entregado", "cobrado"].includes(pedidoFila.estado)) {
    notFound();
  }

  const { data: itemsFilas } = await supabase
    .from("pedido_items")
    .select("id, producto_id, cantidad, subtotal_cop, notas")
    .eq("pedido_id", pedidoId);
  const productoIds = [...new Set((itemsFilas ?? []).map((i) => i.producto_id))];
  const { data: productosFilas } = productoIds.length
    ? await supabase.from("productos").select("id, nombre").in("id", productoIds)
    : { data: [] as { id: string; nombre: string }[] };
  const nombrePorId = new Map((productosFilas ?? []).map((p) => [p.id, p.nombre]));

  const yaEstaCobrado = pedidoFila.estado === "cobrado";

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Pedido #{pedidoFila.numero_corto}</h1>
      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          {(itemsFilas ?? []).map((item) => (
            <div key={item.id} className="rounded-clay-md bg-brand-crema-2 p-3 text-sm text-brand-chocolate">
              <p className="font-medium">
                {item.cantidad}× {nombrePorId.get(item.producto_id) ?? "Producto"}
              </p>
              <p className="text-brand-chocolate/70">{formatearCOP(BigInt(item.subtotal_cop))}</p>
            </div>
          ))}
        </div>
        {yaEstaCobrado ? (
          <p className="rounded-clay-md bg-brand-chocolate-2 p-6 text-center text-xl text-brand-crema/70">
            Este pedido ya fue cobrado.
          </p>
        ) : (
          <FormularioCobro pedidoId={pedidoFila.id} totalCop={BigInt(pedidoFila.total_cop)} />
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Verificar suite**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 140/140 tests. `/pedidos` y `/cobrar/[pedidoId]` deben quedar como rutas dinámicas (`ƒ`).

- [ ] **Step 7: Commit**

```bash
git add "app/(cajera)/pedidos" "app/(cajera)/cobrar" components/caja/ColaCobro.tsx components/caja/tipos.ts components/caja/FormularioCobro.tsx
git commit -m "feat: cola de cobro con realtime y pagina de cobro"
```

---

### Task 10: Verificación RLS en vivo, reconciliación y cierre

**Files:**
- Modify: `CLAUDE.md` (§6.2 — quitar la nota de "pendiente" sobre `pedidos_cajera_update`; §7 si hace falta agregar alguna columna)

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Crear un usuario de prueba `cajera` real (cloud, mismo patrón que vendedora/cocina)**

```bash
cd /c/PROYECTOS/CRIOLLITAS
set -a; source .env.local; set +a
curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "cajera.prueba@criollitas.test",
    "password": "PruebaRLS2026!",
    "email_confirm": true,
    "app_metadata": {"rol": "cajera", "sede_id": "00000000-0000-4000-8000-000000000001"}
  }'
```

Insertar la fila correspondiente en `public.usuarios` (`rol: "cajera"`, `sede_id` de Armenia, `activo: true`).

- [ ] **Step 2: Verificación RLS en vivo (documentar status + body de cada llamada)**

a. Iniciar sesión como `cajera.prueba@criollitas.test`, guardar el `access_token`.

b. Abrir turno vía `abrirTurno` (o INSERT directo con el token de cajera) — confirmar éxito.

c. Intentar abrir un SEGUNDO turno mientras el primero sigue abierto → esperar rechazo (por el índice único; el mensaje que ve la cajera viene de `abrirTurno` mapeando el código `23505`).

d. Con `service_role`, crear un pedido de prueba en estado `listo` con un ítem, `total_cop` conocido.

e. Con el token de cajera, llamar `cobrar_pedido` con un pago cuya suma NO coincide con el total → esperar rechazo (mensaje del RPC "La suma de los pagos no coincide").

f. Repetir con la suma correcta (pago simple) → esperar éxito; confirmar con `service_role` que `pedidos.estado = 'cobrado'` y que se insertó la fila en `pagos` con el `turno_id` correcto.

g. Repetir el flujo completo (nuevo pedido de prueba) con pago mixto (2 pagos que sumen el total) → confirmar 2 filas en `pagos`.

h. Intentar, con el token de cajera, un UPDATE crudo sobre `pedidos` tocando `total_cop` junto con `estado` → esperar bloqueo por el trigger de columnas (`pedidos_cajera_solo_estado`).

i. Cerrar el turno (`cerrar_turno`) → confirmar que `esperado_cop`/`diferencia_cop` se calcularon correctamente contra los pagos en efectivo del turno, y que el turno queda `cerrado`.

j. Intentar cobrar otro pedido DESPUÉS de cerrar el turno (sin abrir uno nuevo) → esperar el mensaje "Abre tu turno antes de cobrar" desde `cobrarPedido`.

k. Limpieza: borrar pedidos/pagos/movimientos/turno de prueba con `service_role`. Usuario de prueba conservado para QA de bloques futuros.

- [ ] **Step 3: Reconciliar CLAUDE.md**

En §6.2, la línea de Cajera decía "INSERT sobre `pagos`, `turnos_caja`, `movimientos_caja`. UPDATE sobre `pedidos` para cambiar a `cobrado`" — ya estaba correcta en su redacción original (a diferencia de vendedora/cocina, no necesitaba reconciliación de fondo), pero si la verificación en vivo revela cualquier matiz no capturado (p. ej. el índice único de un solo turno abierto, o el trigger de columnas), documentarlo ahí. Revisar también si `pedidos.cerrado_en` amerita una nota en §7 explicando que este bloque NO lo toca (se deja para un futuro estado `cerrado`, fuera de alcance).

- [ ] **Step 4: Verificación final**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 140/140 tests. Flujo dev: login cajera → abrir turno → `/pedidos` → `/cobrar/[id]` con formulario de pago funcionando → `/mi-turno` → `/turno/cerrar`.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: reconciliar CLAUDE.md con el bloque 7 (turnos y cobro)"
```

(Si no hubo cambios en CLAUDE.md, omitir este commit y dejarlo anotado en el reporte de la tarea.)

---

## Self-Review (del autor del plan)

**Cobertura del spec:** Modelo de datos (Task 1), RPCs atómicos con lock y validación server-side (Task 2), fórmula de arqueo y cuadre de pago mixto con TDD (Task 3), builder ESC/POS con TDD (Task 4), validaciones Zod (Task 5), flujo de turno completo — abrir/movimiento/cerrar (Tasks 6, 8), flujo de cobro completo incluyendo impresión y reintento (Tasks 7, 9), verificación RLS en vivo + reconciliación (Task 10). Las 4 decisiones de negocio del spec (fusión de bloques, alcance de impresión, cuadre exacto, transición a entregado sin paso manual) están reflejadas: la Task 9 muestra `listo` y `entregado` indistintamente en la cola, y `cobrar_pedido` (Task 2) acepta ambos como origen válido.

**Placeholders:** ninguno — todo el código de cada step está completo.

**Consistencia de tipos:** `PedidoColaVista` (Task 9) usa los mismos nombres de campo en `ColaCobro`, `cargarPedidoColaCompleto` y `page.tsx`. `DatosTicket`/`ItemTicket`/`PagoTicket` (Task 4) se consumen sin modificación en `intentarImprimirTirilla` (Task 7). `MontoCOP` (bigint) se usa consistentemente en `arqueo.ts`, `cuadrePago.ts`, `FormularioCerrarTurno`, `FormularioCobro` — nunca `number` fuera de la frontera con Supabase (`Number(montoDesdePesos(...))` al escribir, `BigInt(fila.campo)` al leer), igual patrón que los Bloques 5-6. `PagoInput["metodo"]` (Task 5) es el mismo union usado en `ETIQUETA_METODO` de `FormularioMovimiento` y `FormularioCobro`.
