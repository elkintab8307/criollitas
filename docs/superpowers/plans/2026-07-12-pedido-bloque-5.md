# Toma de pedido — Vendedora (Bloque 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La vendedora elige el origen de un pedido (mesa/domicilio/llevar), arma un carrito desde el menú con modificadores, y lo envía a cocina; puede seguir agregando ítems a un pedido ya enviado.

**Architecture:** Migración SQL nueva (`pedidos`/`pedido_items`/`pedido_item_mods`/`clientes_domicilio` con RLS para los 4 roles + Realtime); carrito en curso en **zustand** en el cliente, persistido de un tirón por una Server Action que recalcula precios desde la base (nunca confía en precios del cliente); `GrillaMesas` gana un modo de selección reutilizable del bloque 4.

**Tech Stack:** Next 15, zod v4, react-hook-form, zustand (nuevo — se instala en Task 4), @supabase/supabase-js/ssr, vitest. Un solo paquete nuevo: `zustand`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-12-pedido-bloque-5-design.md`. CLAUDE.md manda.
- Dinero `bigint` centavos (`_cop`). La UI captura pesos enteros; la conversión pesos↔centavos usa `montoDesdePesos`/`pesosDesdeMonto` de `@/lib/money`.
- **Nunca confiar en un precio enviado por el cliente** (CLAUDE.md §13.2): las Server Actions de envío recalculan `precio_unit_cop`/`precio_delta_cop` desde `productos`/`modificadores` en la base, usando solo `productoId`/`modificadorIds` del cliente.
- Soft delete siempre; jamás DELETE de datos operativos (§13.8). `pedidos`/`pedido_items` nunca se eliminan, solo cambian de estado.
- Español CO en todo texto visible; dominio en español, infra en inglés.
- Server Components por defecto; `"use client"` solo interactividad. Mutaciones SOLO por Server Actions (§12).
- Errores de dominio: `Result<T, DomainError>` de `@/lib/result` (ya existe, no se toca).
- Autorización: rol/sede se leen de **`app_metadata`** (nunca `user_metadata`). Patrón `exigirVendedora()` idéntico a `exigirAdmin()` en `app/(admin)/mesas/actions.ts` (léelo antes de escribir Server Actions).
- TDD para lógica de negocio. `pnpm lint && pnpm test && pnpm build` verdes antes del commit final de cada task (suite base: 80 tests).
- Commits: Conventional español + trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. PowerShell 5.1: `git commit -F <tempfile>` (here-strings fallan). Regenerar tipos con `supabase gen types typescript --linked | Out-File -Encoding utf8 lib/supabase/types.ts`.
- Cloud: ref `btiejgeljpwsqwckuocs`; migraciones `supabase db push` con `$env:SUPABASE_ACCESS_TOKEN` (el controller lo provee); SQL ad-hoc y verificación vía Management API `POST https://api.supabase.com/v1/projects/btiejgeljpwsqwckuocs/database/query` (Bearer = access token).
- Sede seed: `00000000-0000-4000-8000-000000000001`.
- Rama: `feature/pedido-bloque-5`, apuntada directo a `main` (no apilar sobre otra rama feature — lección de los bloques 3-4).
- No commitear reportes de `.superpowers/` (gitignored).

---

### Task 1: Migración de pedidos + tipos

**Files:**
- Create: `supabase/migrations/<timestamp>_pedidos_base.sql` (timestamp real posterior a `20260712130000_mesas_base.sql`, p. ej. `20260712140000_pedidos_base.sql`)
- Modify: `lib/supabase/types.ts` (regenerado)

**Interfaces:**
- Produces: enums `public.canal_pedido`, `public.estado_pedido`, `public.estado_item_pedido`; tablas `public.clientes_domicilio`, `public.pedidos`, `public.pedido_items`, `public.pedido_item_mods`; RLS completa para vendedora/cajera/cocina/admin; `pedidos`/`pedido_items` en la publicación Realtime; tipos regenerados con estas tablas en `Database`.

- [ ] **Step 1: Escribir la migración completa**

```sql
create type public.canal_pedido as enum ('mesa', 'domicilio', 'llevar');
create type public.estado_pedido as enum (
  'abierto', 'enviado_cocina', 'en_preparacion', 'listo', 'entregado', 'cobrado', 'cerrado', 'anulado'
);
create type public.estado_item_pedido as enum ('pendiente', 'en_preparacion', 'listo', 'entregado');

create table public.clientes_domicilio (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references public.sedes (id),
  nombre text not null,
  telefono text not null,
  direccion text not null,
  referencia text,
  notas text,
  creado_en timestamptz not null default now(),
  unique (sede_id, telefono)
);

create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references public.sedes (id),
  -- Sin unicidad a nivel de BD: se calcula por sede+día en la Server Action
  -- (ver lib/pedido/numeroCorto.ts); una carrera entre dos pedidos simultáneos
  -- de la misma sede en el mismo instante podría repetir número. Riesgo bajo
  -- a la escala de un solo local; se documenta en vez de resolverse con una
  -- función SQL por ahora (YAGNI).
  numero_corto integer not null,
  canal public.canal_pedido not null,
  mesa_id uuid references public.mesas (id),
  cliente_id uuid references public.clientes_domicilio (id),
  vendedora_id uuid not null references public.usuarios (id),
  estado public.estado_pedido not null default 'abierto',
  subtotal_cop bigint not null default 0,
  descuento_cop bigint not null default 0,
  propina_cop bigint not null default 0,
  total_cop bigint not null default 0,
  notas text,
  creado_en timestamptz not null default now(),
  cerrado_en timestamptz
);

create table public.pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos (id),
  producto_id uuid not null references public.productos (id),
  cantidad integer not null check (cantidad > 0),
  precio_unit_cop bigint not null,
  subtotal_cop bigint not null,
  notas text,
  estado_item public.estado_item_pedido not null default 'pendiente',
  tiempo_listo_en timestamptz
);

create table public.pedido_item_mods (
  id uuid primary key default gen_random_uuid(),
  pedido_item_id uuid not null references public.pedido_items (id),
  modificador_id uuid not null references public.modificadores (id),
  precio_delta_cop bigint not null
);

create index pedidos_sede_estado on public.pedidos (sede_id, estado);
create index pedidos_vendedora on public.pedidos (vendedora_id, estado);
create index pedido_items_pedido on public.pedido_items (pedido_id);
create index pedido_item_mods_item on public.pedido_item_mods (pedido_item_id);

alter table public.clientes_domicilio enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_items enable row level security;
alter table public.pedido_item_mods enable row level security;

-- clientes_domicilio: vendedora y admin de la sede ven/crean/actualizan
-- (actualizar hace falta para "reutilizar por teléfono" vía upsert). Sin
-- DELETE: nunca se borra un cliente.
create policy clientes_domicilio_select on public.clientes_domicilio
  for select to authenticated using (sede_id = public.current_sede_id());
create policy clientes_domicilio_insert on public.clientes_domicilio
  for insert to authenticated
  with check (sede_id = public.current_sede_id() and public.current_rol() in ('vendedora', 'admin'));
create policy clientes_domicilio_update on public.clientes_domicilio
  for update to authenticated
  using (sede_id = public.current_sede_id() and public.current_rol() in ('vendedora', 'admin'))
  with check (sede_id = public.current_sede_id() and public.current_rol() in ('vendedora', 'admin'));

-- pedidos
create policy pedidos_vendedora_select on public.pedidos
  for select to authenticated
  using (
    public.current_rol() = 'vendedora' and vendedora_id = auth.uid() and sede_id = public.current_sede_id()
  );
create policy pedidos_vendedora_insert on public.pedidos
  for insert to authenticated
  with check (
    public.current_rol() = 'vendedora' and vendedora_id = auth.uid() and sede_id = public.current_sede_id()
  );
create policy pedidos_vendedora_update on public.pedidos
  for update to authenticated
  using (
    public.current_rol() = 'vendedora' and vendedora_id = auth.uid() and sede_id = public.current_sede_id()
    and estado not in ('cobrado', 'cerrado', 'anulado')
  )
  with check (
    public.current_rol() = 'vendedora' and vendedora_id = auth.uid() and sede_id = public.current_sede_id()
  );

create policy pedidos_cajera_select on public.pedidos
  for select to authenticated
  using (
    public.current_rol() = 'cajera' and sede_id = public.current_sede_id()
    and estado in ('listo', 'entregado', 'cobrado')
  );

create policy pedidos_cocina_select on public.pedidos
  for select to authenticated
  using (
    public.current_rol() = 'cocina' and sede_id = public.current_sede_id()
    and estado in ('enviado_cocina', 'en_preparacion', 'listo')
  );

create policy pedidos_admin_all on public.pedidos
  for all to authenticated
  using (public.current_rol() = 'admin' and sede_id = public.current_sede_id())
  with check (public.current_rol() = 'admin' and sede_id = public.current_sede_id());

-- pedido_items: heredan permisos vía join a pedidos
create policy pedido_items_select on public.pedido_items
  for select to authenticated using (exists (
    select 1 from public.pedidos p where p.id = pedido_id and (
      (public.current_rol() = 'vendedora' and p.vendedora_id = auth.uid() and p.sede_id = public.current_sede_id())
      or (public.current_rol() = 'cajera' and p.sede_id = public.current_sede_id() and p.estado in ('listo', 'entregado', 'cobrado'))
      or (public.current_rol() = 'cocina' and p.sede_id = public.current_sede_id() and p.estado in ('enviado_cocina', 'en_preparacion', 'listo'))
      or (public.current_rol() = 'admin' and p.sede_id = public.current_sede_id())
    )
  ));

create policy pedido_items_vendedora_insert on public.pedido_items
  for insert to authenticated
  with check (exists (
    select 1 from public.pedidos p where p.id = pedido_id
      and public.current_rol() = 'vendedora' and p.vendedora_id = auth.uid()
      and p.sede_id = public.current_sede_id() and p.estado not in ('cobrado', 'cerrado', 'anulado')
  ));

create policy pedido_items_cocina_update on public.pedido_items
  for update to authenticated
  using (exists (
    select 1 from public.pedidos p where p.id = pedido_id
      and public.current_rol() = 'cocina' and p.sede_id = public.current_sede_id()
      and p.estado in ('enviado_cocina', 'en_preparacion', 'listo')
  ))
  with check (exists (
    select 1 from public.pedidos p where p.id = pedido_id
      and public.current_rol() = 'cocina' and p.sede_id = public.current_sede_id()
  ));

create policy pedido_items_admin_all on public.pedido_items
  for all to authenticated
  using (exists (
    select 1 from public.pedidos p where p.id = pedido_id and public.current_rol() = 'admin' and p.sede_id = public.current_sede_id()
  ))
  with check (exists (
    select 1 from public.pedidos p where p.id = pedido_id and public.current_rol() = 'admin' and p.sede_id = public.current_sede_id()
  ));

-- Cocina (y cualquier otro rol) solo puede actualizar el estado del ítem y su
-- marca de tiempo, nunca cantidad/producto/precio vía la API — ajustes reales
-- se modelan como filas nuevas o una función con service role, no un UPDATE
-- libre (CLAUDE.md §6.2: "cocina: UPDATE solo del campo estado_item").
revoke update on public.pedido_items from authenticated;
grant update (estado_item, tiempo_listo_en) on public.pedido_items to authenticated;

-- pedido_item_mods: heredan vía join a pedido_items→pedidos
create policy pedido_item_mods_select on public.pedido_item_mods
  for select to authenticated using (exists (
    select 1 from public.pedido_items pi join public.pedidos p on p.id = pi.pedido_id
    where pi.id = pedido_item_id and (
      (public.current_rol() = 'vendedora' and p.vendedora_id = auth.uid() and p.sede_id = public.current_sede_id())
      or (public.current_rol() = 'cajera' and p.sede_id = public.current_sede_id() and p.estado in ('listo', 'entregado', 'cobrado'))
      or (public.current_rol() = 'cocina' and p.sede_id = public.current_sede_id() and p.estado in ('enviado_cocina', 'en_preparacion', 'listo'))
      or (public.current_rol() = 'admin' and p.sede_id = public.current_sede_id())
    )
  ));

create policy pedido_item_mods_vendedora_insert on public.pedido_item_mods
  for insert to authenticated
  with check (exists (
    select 1 from public.pedido_items pi join public.pedidos p on p.id = pi.pedido_id
    where pi.id = pedido_item_id and public.current_rol() = 'vendedora' and p.vendedora_id = auth.uid()
      and p.sede_id = public.current_sede_id() and p.estado not in ('cobrado', 'cerrado', 'anulado')
  ));

create policy pedido_item_mods_admin_all on public.pedido_item_mods
  for all to authenticated
  using (exists (
    select 1 from public.pedido_items pi join public.pedidos p on p.id = pi.pedido_id
    where pi.id = pedido_item_id and public.current_rol() = 'admin' and p.sede_id = public.current_sede_id()
  ))
  with check (exists (
    select 1 from public.pedido_items pi join public.pedidos p on p.id = pi.pedido_id
    where pi.id = pedido_item_id and public.current_rol() = 'admin' and p.sede_id = public.current_sede_id()
  ));

alter publication supabase_realtime add table public.pedidos;
alter publication supabase_realtime add table public.pedido_items;
```

- [ ] **Step 2: Aplicar** — `supabase db push`. Verificar por Management API: `select count(*) from pg_tables where schemaname='public' and tablename in ('clientes_domicilio','pedidos','pedido_items','pedido_item_mods');` → 4. `select count(*) from pg_policies where tablename in ('clientes_domicilio','pedidos','pedido_items','pedido_item_mods');` → 14 (3+4+3+3, ver conteo exacto arriba). `select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename in ('pedidos','pedido_items');` → 2.

- [ ] **Step 3: Regenerar tipos** — `supabase gen types typescript --linked | Out-File -Encoding utf8 lib/supabase/types.ts`. Confirmar que contiene `pedidos`, `pedido_items`, `pedido_item_mods`, `clientes_domicilio`. `pnpm build` → exit 0.

- [ ] **Step 4: Commit** — `feat: migración de pedidos (pedidos, items, mods, clientes domicilio) con RLS`

---

### Task 2: Funciones puras de pedido (número corto + totales) — TDD

**Files:**
- Create: `lib/pedido/numeroCorto.ts`, `lib/pedido/totales.ts`, `tests/unit/numero-corto.test.ts`, `tests/unit/totales-pedido.test.ts`
- Modify: `lib/dates.ts` (agregar `limitesDeHoyBogota`)

**Interfaces:**
- Produces: `siguienteNumeroCorto(numerosHoy: number[]): number`; `interface ItemParaTotal { precioUnitCop: MontoCOP; cantidad: number; modificadoresDeltaCop: MontoCOP[] }`; `calcularSubtotalItem(item: ItemParaTotal): MontoCOP`; `calcularTotalesPedido(items: ItemParaTotal[]): { subtotalCop: MontoCOP; totalCop: MontoCOP }`; `limitesDeHoyBogota(): { desde: Date; hasta: Date }`.
- Consumes: `MontoCOP`, `sumar`, `multiplicar` de `@/lib/money`; `TZDate` de `@date-fns/tz`; `TZ_BOGOTA` (ya existe en `lib/dates.ts`).

- [ ] **Step 1: Tests que fallan**

`tests/unit/numero-corto.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { siguienteNumeroCorto } from "@/lib/pedido/numeroCorto";

describe("siguienteNumeroCorto", () => {
  it("devuelve 1 si no hay pedidos hoy", () => {
    expect(siguienteNumeroCorto([])).toBe(1);
  });
  it("devuelve el máximo más 1", () => {
    expect(siguienteNumeroCorto([1, 2, 3])).toBe(4);
  });
  it("no depende del orden del arreglo", () => {
    expect(siguienteNumeroCorto([5, 1, 3])).toBe(6);
  });
});
```

`tests/unit/totales-pedido.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calcularSubtotalItem, calcularTotalesPedido } from "@/lib/pedido/totales";

describe("calcularSubtotalItem", () => {
  it("multiplica precio por cantidad sin modificadores", () => {
    expect(calcularSubtotalItem({ precioUnitCop: 1500000n, cantidad: 2, modificadoresDeltaCop: [] })).toBe(
      3000000n,
    );
  });
  it("suma los modificadores antes de multiplicar", () => {
    expect(
      calcularSubtotalItem({ precioUnitCop: 1500000n, cantidad: 2, modificadoresDeltaCop: [350000n, 200000n] }),
    ).toBe(4100000n); // (1.500.000 + 350.000 + 200.000) * 2
  });
});

describe("calcularTotalesPedido", () => {
  it("suma el subtotal de varios ítems", () => {
    const { subtotalCop, totalCop } = calcularTotalesPedido([
      { precioUnitCop: 1500000n, cantidad: 1, modificadoresDeltaCop: [] },
      { precioUnitCop: 700000n, cantidad: 2, modificadoresDeltaCop: [] },
    ]);
    expect(subtotalCop).toBe(2900000n);
    expect(totalCop).toBe(2900000n);
  });
  it("da 0 con lista vacía", () => {
    const { subtotalCop, totalCop } = calcularTotalesPedido([]);
    expect(subtotalCop).toBe(0n);
    expect(totalCop).toBe(0n);
  });
});
```

- [ ] **Step 2: Verificar FAIL** — `pnpm test` → módulos no encontrados.

- [ ] **Step 3: Implementar**

`lib/pedido/numeroCorto.ts`:

```ts
/** Siguiente número corto de pedido dado los números ya usados hoy en la sede.
 *  Reinicia porque el llamador filtra por el día (ver `limitesDeHoyBogota` en
 *  `lib/dates.ts`); esta función en sí no sabe nada de fechas. */
export function siguienteNumeroCorto(numerosHoy: number[]): number {
  if (numerosHoy.length === 0) return 1;
  return Math.max(...numerosHoy) + 1;
}
```

`lib/pedido/totales.ts`:

```ts
import { multiplicar, sumar, type MontoCOP } from "@/lib/money";

export interface ItemParaTotal {
  precioUnitCop: MontoCOP;
  cantidad: number;
  modificadoresDeltaCop: MontoCOP[];
}

export function calcularSubtotalItem(item: ItemParaTotal): MontoCOP {
  const precioConMods = sumar(item.precioUnitCop, ...item.modificadoresDeltaCop);
  return multiplicar(precioConMods, item.cantidad);
}

export function calcularTotalesPedido(
  items: ItemParaTotal[],
): { subtotalCop: MontoCOP; totalCop: MontoCOP } {
  const subtotalCop = sumar(...items.map(calcularSubtotalItem));
  return { subtotalCop, totalCop: subtotalCop };
}
```

Modificar `lib/dates.ts` (contenido actual completo abajo — agregar la función al final, sin tocar lo existente):

```ts
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export const TZ_BOGOTA = "America/Bogota";

export function ahoraBogota(): Date {
  return new TZDate(Date.now(), TZ_BOGOTA);
}

export function formatearFecha(
  fecha: Date,
  patron = "d 'de' MMMM 'de' yyyy, h:mm a"
): string {
  return format(new TZDate(fecha.getTime(), TZ_BOGOTA), patron, { locale: es });
}

export function formatearHora(fecha: Date): string {
  return formatearFecha(fecha, "h:mm a");
}

/** Límites [desde, hasta) de "hoy" en Bogotá, como instantes — para filtrar
 *  filas de un día calendario local sin que el corte caiga a medianoche UTC. */
export function limitesDeHoyBogota(): { desde: Date; hasta: Date } {
  const ahora = new TZDate(Date.now(), TZ_BOGOTA);
  const desde = new TZDate(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0, 0, TZ_BOGOTA);
  const hasta = new TZDate(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1, 0, 0, 0, 0, TZ_BOGOTA);
  return { desde, hasta };
}
```

- [ ] **Step 4: Verificar PASS** — `pnpm test` → verde (suite completa, sin regresión en `tests/unit/dates.test.ts`).
- [ ] **Step 5: Commit** — `feat: funciones puras de numero corto y totales de pedido (TDD)`

---

### Task 3: Validaciones Zod de pedido — TDD

**Files:**
- Create: `lib/validations/pedido.ts`, `tests/unit/validations-pedido.test.ts`

**Interfaces:**
- Produces: `clienteDomicilioSchema`/`ClienteDomicilioInput`; `itemPedidoEnvioSchema`/`ItemPedidoEnvioInput` (**sin campos de precio** — solo `productoId`, `cantidad`, `modificadorIds`, `nota`; el precio se recalcula siempre en el servidor); `enviarPedidoSchema`/`EnviarPedidoInput`.

- [ ] **Step 1: Test que falla**

```ts
import { describe, expect, it } from "vitest";
import { clienteDomicilioSchema, enviarPedidoSchema, itemPedidoEnvioSchema } from "@/lib/validations/pedido";

const productoId = "00000000-0000-4000-8000-000000000301";

describe("clienteDomicilioSchema", () => {
  it("acepta datos válidos sin referencia", () => {
    expect(
      clienteDomicilioSchema.safeParse({
        nombre: "María Pérez",
        telefono: "3211234567",
        direccion: "Cra 14 # 8-28",
      }).success,
    ).toBe(true);
  });
  it("rechaza nombre, teléfono o dirección demasiado cortos", () => {
    expect(
      clienteDomicilioSchema.safeParse({ nombre: "M", telefono: "3211234567", direccion: "Cra 14 # 8-28" })
        .success,
    ).toBe(false);
    expect(
      clienteDomicilioSchema.safeParse({ nombre: "María", telefono: "123", direccion: "Cra 14 # 8-28" }).success,
    ).toBe(false);
    expect(
      clienteDomicilioSchema.safeParse({ nombre: "María", telefono: "3211234567", direccion: "Cra" }).success,
    ).toBe(false);
  });
});

describe("itemPedidoEnvioSchema", () => {
  it("acepta un ítem válido con modificadores", () => {
    expect(
      itemPedidoEnvioSchema.safeParse({
        productoId,
        cantidad: 2,
        modificadorIds: [productoId],
        nota: "sin cebolla",
      }).success,
    ).toBe(true);
  });
  it("acepta sin modificadores ni nota (usa el default)", () => {
    const resultado = itemPedidoEnvioSchema.safeParse({ productoId, cantidad: 1 });
    expect(resultado.success).toBe(true);
    if (resultado.success) expect(resultado.data.modificadorIds).toEqual([]);
  });
  it("rechaza cantidad 0, negativa o mayor a 50", () => {
    for (const cantidad of [0, -1, 51]) {
      expect(itemPedidoEnvioSchema.safeParse({ productoId, cantidad }).success).toBe(false);
    }
  });
});

describe("enviarPedidoSchema", () => {
  it("rechaza un carrito vacío", () => {
    expect(enviarPedidoSchema.safeParse({ items: [] }).success).toBe(false);
  });
  it("acepta al menos un ítem", () => {
    expect(enviarPedidoSchema.safeParse({ items: [{ productoId, cantidad: 1 }] }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Verificar FAIL** — `pnpm test` → módulo no encontrado.

- [ ] **Step 3: Implementar `lib/validations/pedido.ts`**

```ts
import { z } from "zod";

export const clienteDomicilioSchema = z.object({
  nombre: z.string().min(2, "Escribe el nombre del cliente"),
  telefono: z.string().min(7, "Escribe un teléfono válido").max(15, "El teléfono es demasiado largo"),
  direccion: z.string().min(5, "Escribe la dirección de entrega"),
  referencia: z.string().optional(),
});
export type ClienteDomicilioInput = z.infer<typeof clienteDomicilioSchema>;

export const itemPedidoEnvioSchema = z.object({
  productoId: z.uuid("Producto inválido"),
  cantidad: z
    .number("Escribe la cantidad")
    .int("La cantidad no lleva decimales")
    .min(1, "La cantidad mínima es 1")
    .max(50, "La cantidad máxima es 50"),
  modificadorIds: z.array(z.uuid("Modificador inválido")).default([]),
  nota: z.string().max(200, "La nota es demasiado larga").optional(),
});
export type ItemPedidoEnvioInput = z.infer<typeof itemPedidoEnvioSchema>;

export const enviarPedidoSchema = z.object({
  items: z.array(itemPedidoEnvioSchema).min(1, "Agrega al menos un producto"),
});
export type EnviarPedidoInput = z.infer<typeof enviarPedidoSchema>;
```

Nota zod v4: si `z.number("…")` no compila, usar la forma equivalente conservando los TEXTOS exactos (contratos de los tests).

- [ ] **Step 4: Verificar PASS** — `pnpm test` → verde.
- [ ] **Step 5: Commit** — `feat: validaciones Zod de pedido (TDD)`

---

### Task 4: Store zustand del carrito — TDD

**Files:**
- Create: `lib/pedido/carritoStore.ts`, `tests/unit/carrito-store.test.ts`

**Interfaces:**
- Produces:
  - `interface ModificadorSeleccionado { modificadorId: string; nombre: string; precioDeltaPesos: number }`
  - `interface ItemCarrito { clave: string; productoId: string; nombre: string; precioUnitPesos: number; cantidad: number; modificadores: ModificadorSeleccionado[]; nota: string }`
  - `useCarritoStore` (hook zustand) con estado `{ items: ItemCarrito[] }` y acciones `agregar(item: Omit<ItemCarrito, "clave">): void`, `quitar(clave: string): void`, `cambiarCantidad(clave: string, cantidad: number): void`, `cambiarNota(clave: string, nota: string): void`, `vaciar(): void`.
  - Todos los precios del store están **en pesos**, no en centavos — la UI del carrito los convierte con `montoDesdePesos` al mostrar el total; el servidor nunca lee estos precios (recalcula siempre).

- [ ] **Step 1: Instalar zustand** — `pnpm add zustand`

- [ ] **Step 2: Test que falla**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { useCarritoStore } from "@/lib/pedido/carritoStore";

const itemBase = {
  productoId: "p1",
  nombre: "Arepa",
  precioUnitPesos: 15000,
  cantidad: 1,
  modificadores: [],
  nota: "",
};

describe("useCarritoStore", () => {
  beforeEach(() => {
    useCarritoStore.setState({ items: [] });
  });

  it("agrega un ítem con una clave generada", () => {
    useCarritoStore.getState().agregar(itemBase);
    const items = useCarritoStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]?.nombre).toBe("Arepa");
    expect(typeof items[0]?.clave).toBe("string");
  });

  it("quita un ítem por clave", () => {
    useCarritoStore.getState().agregar(itemBase);
    const clave = useCarritoStore.getState().items[0]!.clave;
    useCarritoStore.getState().quitar(clave);
    expect(useCarritoStore.getState().items).toHaveLength(0);
  });

  it("cambia la cantidad de un ítem", () => {
    useCarritoStore.getState().agregar(itemBase);
    const clave = useCarritoStore.getState().items[0]!.clave;
    useCarritoStore.getState().cambiarCantidad(clave, 3);
    expect(useCarritoStore.getState().items[0]?.cantidad).toBe(3);
  });

  it("cambia la nota de un ítem", () => {
    useCarritoStore.getState().agregar(itemBase);
    const clave = useCarritoStore.getState().items[0]!.clave;
    useCarritoStore.getState().cambiarNota(clave, "sin cebolla");
    expect(useCarritoStore.getState().items[0]?.nota).toBe("sin cebolla");
  });

  it("vacía el carrito", () => {
    useCarritoStore.getState().agregar(itemBase);
    useCarritoStore.getState().vaciar();
    expect(useCarritoStore.getState().items).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Verificar FAIL** — `pnpm test` → módulo no encontrado.

- [ ] **Step 4: Implementar `lib/pedido/carritoStore.ts`**

```ts
"use client";

import { create } from "zustand";

export interface ModificadorSeleccionado {
  modificadorId: string;
  nombre: string;
  precioDeltaPesos: number;
}

export interface ItemCarrito {
  clave: string;
  productoId: string;
  nombre: string;
  precioUnitPesos: number;
  cantidad: number;
  modificadores: ModificadorSeleccionado[];
  nota: string;
}

interface CarritoState {
  items: ItemCarrito[];
  agregar: (item: Omit<ItemCarrito, "clave">) => void;
  quitar: (clave: string) => void;
  cambiarCantidad: (clave: string, cantidad: number) => void;
  cambiarNota: (clave: string, nota: string) => void;
  vaciar: () => void;
}

/** Carrito de pedido en curso: estado UI local del cliente (CLAUDE.md §3),
 *  nunca la fuente de verdad de precios — se recalculan siempre en el
 *  servidor al confirmar. */
export const useCarritoStore = create<CarritoState>((set) => ({
  items: [],
  agregar: (item) =>
    set((state) => ({ items: [...state.items, { ...item, clave: crypto.randomUUID() }] })),
  quitar: (clave) => set((state) => ({ items: state.items.filter((i) => i.clave !== clave) })),
  cambiarCantidad: (clave, cantidad) =>
    set((state) => ({
      items: state.items.map((i) => (i.clave === clave ? { ...i, cantidad } : i)),
    })),
  cambiarNota: (clave, nota) =>
    set((state) => ({ items: state.items.map((i) => (i.clave === clave ? { ...i, nota } : i)) })),
  vaciar: () => set({ items: [] }),
}));
```

- [ ] **Step 5: Verificar PASS** — `pnpm test` → verde.
- [ ] **Step 6: Commit** — `feat: store zustand del carrito de pedido (TDD)`

---

### Task 5: GrillaMesas modo selección

**Files:**
- Modify: `components/mesas/GrillaMesas.tsx`

**Interfaces:**
- Consumes: `MesaVista` (`@/components/mesas/tipos`, sin cambios).
- Produces: nuevas props opcionales `modo?: "gestion" | "seleccion"` (default `"gestion"`, retrocompatible) y `onSeleccionarMesa?: (mesa: MesaVista) => void`. En `modo="seleccion"`, cada tile con `activa && estado === "libre"` es clickeable y llama `onSeleccionarMesa`; las demás no reaccionan al clic. El header "+ Nueva mesa" y el modal `EditorMesa` solo aparecen en `modo="gestion"`.

Este es el contenido ACTUAL completo del archivo (146 líneas) — reemplázalo por la versión modificada de abajo, que preserva toda la lógica existente y solo agrega lo necesario para el modo selección:

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ClayButton } from "@/components/ui/ClayButton";
import { MesaTile } from "@/components/ui/MesaTile";
import { EditorMesa } from "@/components/mesas/EditorMesa";
import type { MesaVista } from "@/components/mesas/tipos";
import type { Database } from "@/lib/supabase/types";

type MesaFila = Database["public"]["Tables"]["mesas"]["Row"];

interface GrillaMesasProps {
  mesasIniciales: MesaVista[];
  sedeId: string;
  puedeEditar: boolean;
  /** "gestion" (default): clic abre el editor de admin. "seleccion": clic
   *  en una mesa libre y activa llama `onSeleccionarMesa` (flujo de la
   *  vendedora al iniciar un pedido). */
  modo?: "gestion" | "seleccion";
  onSeleccionarMesa?: (mesa: MesaVista) => void;
}

function ordenarPorNumero(mesas: MesaVista[]): MesaVista[] {
  return [...mesas].sort((a, b) => a.numero - b.numero);
}

function filaAMesaVista(fila: MesaFila): MesaVista {
  return {
    id: fila.id,
    numero: fila.numero,
    nombre: fila.nombre,
    capacidad: fila.capacidad,
    estado: fila.estado,
    activa: fila.activa,
  };
}

/** Parrilla de mesas con actualización en vivo (Supabase Realtime). */
export function GrillaMesas({
  mesasIniciales,
  sedeId,
  puedeEditar,
  modo = "gestion",
  onSeleccionarMesa,
}: GrillaMesasProps) {
  const [mesas, setMesas] = useState<MesaVista[]>(() => ordenarPorNumero(mesasIniciales));
  const [editorAbierto, setEditorAbierto] = useState(false);
  const [mesaSeleccionada, setMesaSeleccionada] = useState<MesaVista | null>(null);

  // Resincroniza con los props del servidor (ej. tras `router.refresh()` en EditorMesa)
  // en vez de depender solo del round-trip de Realtime, que puede fallar o tardar.
  useEffect(() => {
    setMesas(ordenarPorNumero(mesasIniciales));
  }, [mesasIniciales]);

  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel(`mesas:sede_${sedeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mesas", filter: `sede_id=eq.${sedeId}` },
        (payload: { eventType: string; new: Partial<MesaFila>; old: Partial<MesaFila> }) => {
          // DELETE nunca ocurre en operación normal (soft delete vía `activa`),
          // pero se ignora por seguridad: `payload.old` puede no traer todas las
          // columnas y no hay nada útil que insertar/actualizar.
          if (payload.eventType === "DELETE") return;
          const fila = payload.new;
          if (!fila.id || fila.numero === undefined || fila.nombre === undefined) return;
          const vista = filaAMesaVista(fila as MesaFila);
          setMesas((actual) =>
            ordenarPorNumero([...actual.filter((mesa) => mesa.id !== vista.id), vista]),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [sedeId]);

  function abrirNueva() {
    setMesaSeleccionada(null);
    setEditorAbierto(true);
  }

  function abrirExistente(mesa: MesaVista) {
    setMesaSeleccionada(mesa);
    setEditorAbierto(true);
  }

  function cerrarEditor() {
    setEditorAbierto(false);
    setMesaSeleccionada(null);
  }

  function alClicMesa(mesa: MesaVista): (() => void) | undefined {
    if (modo === "seleccion") {
      if (!mesa.activa || mesa.estado !== "libre") return undefined;
      return () => onSeleccionarMesa?.(mesa);
    }
    return puedeEditar ? () => abrirExistente(mesa) : undefined;
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Mesas de la sede">
      {modo === "gestion" && puedeEditar ? (
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-xl font-semibold text-brand-crema">Mesas</h2>
          <ClayButton type="button" variant="primary" size="sm" onClick={abrirNueva}>
            + Nueva mesa
          </ClayButton>
        </div>
      ) : null}

      {mesas.length === 0 ? (
        <p className="rounded-clay-md bg-brand-chocolate-2 p-6 text-center text-sm text-brand-crema/70">
          Aún no hay mesas registradas.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
          {mesas.map((mesa) => (
            <MesaTile
              key={mesa.id}
              numero={mesa.numero}
              nombre={mesa.nombre}
              capacidad={mesa.capacidad}
              estado={mesa.estado}
              activa={mesa.activa}
              onClick={alClicMesa(mesa)}
            />
          ))}
        </div>
      )}

      {modo === "gestion" && puedeEditar && editorAbierto ? (
        <EditorMesa
          key={mesaSeleccionada?.id ?? "nueva"}
          mesa={mesaSeleccionada}
          abierto={editorAbierto}
          onCerrar={cerrarEditor}
        />
      ) : null}
    </section>
  );
}
```

- [ ] **Step 2: Verificar** — `pnpm lint`, `pnpm test` (80), `pnpm build` verdes. La página `/mesas` del admin (que llama `GrillaMesas` sin `modo`, es decir `modo="gestion"` por default) debe seguir compilando y comportándose exactamente igual — no le cambia ningún prop.
- [ ] **Step 3: Commit** — `feat: modo de selección en GrillaMesas para elegir mesa de un pedido`

---

### Task 6: Server Actions de creación de pedido

**Files:**
- Create: `app/(vendedora)/inicio/actions.ts`

**Interfaces:**
- Consumes: `clienteDomicilioSchema`/`ClienteDomicilioInput` (`@/lib/validations/pedido`), `siguienteNumeroCorto` (`@/lib/pedido/numeroCorto`), `limitesDeHoyBogota` (`@/lib/dates`), `createServerSupabase`, `SEDE_DEFAULT_ID`, `ok`/`err`/`Result`/`DomainError`.
- Produces:
  - `crearPedidoMesa(mesaId: string): Promise<Result<{ pedidoId: string }, DomainError>>`
  - `crearPedidoDomicilio(input: ClienteDomicilioInput): Promise<Result<{ pedidoId: string }, DomainError>>`
  - `crearPedidoLlevar(): Promise<Result<{ pedidoId: string }, DomainError>>`

- [ ] **Step 1: Implementar `app/(vendedora)/inicio/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { err, ok, type DomainError, type Result } from "@/lib/result";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";
import { createServerSupabase } from "@/lib/supabase/server";
import { clienteDomicilioSchema, type ClienteDomicilioInput } from "@/lib/validations/pedido";
import { siguienteNumeroCorto } from "@/lib/pedido/numeroCorto";
import { limitesDeHoyBogota } from "@/lib/dates";
import type { Database } from "@/lib/supabase/types";

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

async function calcularSiguienteNumero(
  supabase: SupabaseClient<Database>,
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

  const { error: errorOcupar } = await supabase
    .from("mesas")
    .update({ estado: "ocupada" })
    .eq("id", mesaId);
  if (errorOcupar) {
    // El pedido ya se creó; no lo revertimos (perder el trabajo de la vendedora
    // sería peor). La mesa queda desincronizada del pedido — caso raro, se
    // corrige a mano desde /mesas.
    return err({
      codigo: "BASE_DATOS",
      mensaje: "El pedido se creó, pero no pudimos marcar la mesa como ocupada. Avisa al administrador.",
    });
  }

  revalidatePath("/inicio");
  return ok({ pedidoId: pedido.id });
}

export async function crearPedidoDomicilio(
  input: ClienteDomicilioInput,
): Promise<Result<{ pedidoId: string }, DomainError>> {
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

  const numeroCorto = await calcularSiguienteNumero(supabase, ctx.valor.sedeId);
  const { data: pedido, error: errorPedido } = await supabase
    .from("pedidos")
    .insert({
      sede_id: ctx.valor.sedeId,
      numero_corto: numeroCorto,
      canal: "domicilio",
      cliente_id: cliente.id,
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

export async function crearPedidoLlevar(): Promise<Result<{ pedidoId: string }, DomainError>> {
  const ctx = await exigirVendedora();
  if (!ctx.ok) return ctx;
  const supabase = await createServerSupabase();
  const numeroCorto = await calcularSiguienteNumero(supabase, ctx.valor.sedeId);
  const { data: pedido, error } = await supabase
    .from("pedidos")
    .insert({
      sede_id: ctx.valor.sedeId,
      numero_corto: numeroCorto,
      canal: "llevar",
      vendedora_id: ctx.valor.vendedoraId,
    })
    .select("id")
    .single();
  if (error || !pedido) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos crear el pedido. Intenta de nuevo." });
  }
  revalidatePath("/inicio");
  return ok({ pedidoId: pedido.id });
}
```

Nota de tipo: si `SupabaseClient<Database>` no es el tipo exacto que devuelve `createServerSupabase()` en este proyecto (revisa `lib/supabase/server.ts`), usa `Awaited<ReturnType<typeof createServerSupabase>>` como tipo del parámetro `supabase` en `calcularSiguienteNumero` en su lugar — es el patrón más robusto porque no depende de adivinar el tipo genérico exacto.

- [ ] **Step 2: Verificar** — `pnpm lint`, `pnpm test` (80), `pnpm build` verdes.
- [ ] **Step 3: Commit** — `feat: server actions de creación de pedido (mesa, domicilio, llevar)`

---

### Task 7: Server Action de envío de ítems

**Files:**
- Create: `app/(vendedora)/pedido/actions.ts`

**Interfaces:**
- Consumes: `enviarPedidoSchema`/`EnviarPedidoInput` (`@/lib/validations/pedido`), `calcularSubtotalItem`/`ItemParaTotal` (`@/lib/pedido/totales`), `createServerSupabase`, `ok`/`err`/`Result`/`DomainError`.
- Produces: `confirmarItemsPedido(pedidoId: string, input: EnviarPedidoInput): Promise<Result<null, DomainError>>` — inserta los ítems con precios **recalculados desde `productos`/`modificadores`** (nunca confía en un precio del cliente), actualiza `pedidos.subtotal_cop`/`total_cop`, y transiciona `pedidos.estado` de `abierto` a `enviado_cocina` **solo si ese es el estado actual en la base** (la decisión de si es "primer envío" es del servidor, no del cliente que llama la acción — evita que un botón obsoleto regrese el estado).

- [ ] **Step 1: Implementar `app/(vendedora)/pedido/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { err, ok, type DomainError, type Result } from "@/lib/result";
import { createServerSupabase } from "@/lib/supabase/server";
import { enviarPedidoSchema, type EnviarPedidoInput } from "@/lib/validations/pedido";
import { calcularSubtotalItem, type ItemParaTotal } from "@/lib/pedido/totales";

const uuidValido = (valor: string): boolean => z.uuid().safeParse(valor).success;

async function exigirVendedora(): Promise<Result<{ vendedoraId: string }, DomainError>> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return err({ codigo: "NO_AUTORIZADO", mensaje: "Inicia sesión de nuevo" });
  if (user.app_metadata?.rol !== "vendedora") {
    return err({ codigo: "NO_AUTORIZADO", mensaje: "Solo la vendedora puede editar este pedido" });
  }
  return ok({ vendedoraId: user.id });
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
    .select("id, estado, subtotal_cop")
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
  const { data: modificadores } = modificadorIds.length
    ? await supabase
        .from("modificadores")
        .select("id, producto_id, precio_delta_cop, activo")
        .in("id", modificadorIds)
    : { data: [] as { id: string; producto_id: string; precio_delta_cop: number; activo: boolean }[] };
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

  for (const fila of filasItems) {
    const { data: itemInsertado, error: errorItem } = await supabase
      .from("pedido_items")
      .insert({
        pedido_id: pedidoId,
        producto_id: fila.producto_id,
        cantidad: fila.cantidad,
        precio_unit_cop: fila.precio_unit_cop,
        subtotal_cop: fila.subtotal_cop,
        notas: fila.notas,
      })
      .select("id")
      .single();
    if (errorItem || !itemInsertado) {
      return err({ codigo: "BASE_DATOS", mensaje: "No pudimos guardar el pedido. Intenta de nuevo." });
    }
    if (fila.modificadorIds.length > 0) {
      const filasMods = fila.modificadorIds.map((modificadorId) => ({
        pedido_item_id: itemInsertado.id,
        modificador_id: modificadorId,
        precio_delta_cop: modificadorPorId.get(modificadorId)!.precio_delta_cop,
      }));
      const { error: errorMods } = await supabase.from("pedido_item_mods").insert(filasMods);
      if (errorMods) {
        return err({
          codigo: "BASE_DATOS",
          mensaje: "No pudimos guardar los adicionales. Intenta de nuevo.",
        });
      }
    }
  }

  const nuevoSubtotal = filasItems.reduce(
    (acc, fila) => acc + BigInt(fila.subtotal_cop),
    BigInt(pedido.subtotal_cop),
  );
  const actualizacion: { subtotal_cop: number; total_cop: number; estado?: "enviado_cocina" } = {
    subtotal_cop: Number(nuevoSubtotal),
    total_cop: Number(nuevoSubtotal),
  };
  if (pedido.estado === "abierto") {
    actualizacion.estado = "enviado_cocina";
  }
  const { error: errorTotales } = await supabase
    .from("pedidos")
    .update(actualizacion)
    .eq("id", pedidoId);
  if (errorTotales) {
    return err({
      codigo: "BASE_DATOS",
      mensaje: "Los productos se guardaron, pero no pudimos actualizar el total. Recarga la página.",
    });
  }

  revalidatePath(`/pedido/${pedidoId}`);
  return ok(null);
}
```

- [ ] **Step 2: Verificar** — `pnpm lint`, `pnpm test` (80), `pnpm build` verdes.
- [ ] **Step 3: Commit** — `feat: server action de envio de items con precios recalculados en el servidor`

---

### Task 8: Página `/inicio` — selector de origen

**Files:**
- Modify: `app/(vendedora)/inicio/page.tsx`
- Create: `components/pedido/SelectorOrigen.tsx`

**Interfaces:**
- Consumes: `GrillaMesas` con `modo="seleccion"` (Task 5), `crearPedidoMesa`/`crearPedidoDomicilio`/`crearPedidoLlevar` (Task 6), `clienteDomicilioSchema`/`ClienteDomicilioInput` (Task 3), `MesaVista` (`@/components/mesas/tipos`).
- Produces: ruta `/inicio` operativa; al crear cualquier pedido, navega a `/pedido/[pedidoId]`.

- [ ] **Step 1: Reemplazar `app/(vendedora)/inicio/page.tsx`** (contenido actual: placeholder estático con "Disponible en el próximo bloque.")

```tsx
import { createServerSupabase } from "@/lib/supabase/server";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";
import { ClayCard } from "@/components/ui/ClayCard";
import { SelectorOrigen } from "@/components/pedido/SelectorOrigen";
import type { MesaVista } from "@/components/mesas/tipos";

// Fallback solo si el JWT no trae `app_metadata.sede_id` (mismo criterio que
// `app/(admin)/mesas/page.tsx`): la fuente de verdad es la sesión.
const SEDE_ID_FALLBACK = process.env.NEXT_PUBLIC_SEDE_ID ?? SEDE_DEFAULT_ID;

export default async function InicioPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const sedeId = (user?.app_metadata?.sede_id as string | undefined) ?? SEDE_ID_FALLBACK;

  const { data, error } = await supabase
    .from("mesas")
    .select("id, numero, nombre, capacidad, estado, activa")
    .eq("activa", true)
    .order("numero", { ascending: true });

  const mesas = (data ?? []) as MesaVista[];

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Nuevo pedido</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">Elige el origen del pedido para empezar.</p>
      {error ? (
        <ClayCard variant="flat" role="alert">
          <p className="text-sm text-brand-tomate-2">
            No pudimos cargar las mesas. Recarga la página o intenta más tarde.
          </p>
        </ClayCard>
      ) : (
        <SelectorOrigen mesasIniciales={mesas} sedeId={sedeId} />
      )}
    </main>
  );
}
```

- [ ] **Step 2: Crear `components/pedido/SelectorOrigen.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { crearPedidoDomicilio, crearPedidoLlevar, crearPedidoMesa } from "@/app/(vendedora)/inicio/actions";
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

/** Los tres orígenes de un pedido nuevo: mesa, domicilio, para llevar. */
export function SelectorOrigen({ mesasIniciales, sedeId }: SelectorOrigenProps) {
  const router = useRouter();
  const [modalDomicilioAbierto, setModalDomicilioAbierto] = useState(false);
  const [creandoLlevar, setCreandoLlevar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function alSeleccionarMesa(mesa: MesaVista) {
    setError(null);
    const resultado = await crearPedidoMesa(mesa.id);
    if (!resultado.ok) {
      setError(resultado.error.mensaje);
      return;
    }
    router.push(`/pedido/${resultado.valor.pedidoId}`);
  }

  async function alCrearLlevar() {
    setError(null);
    setCreandoLlevar(true);
    const resultado = await crearPedidoLlevar();
    setCreandoLlevar(false);
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
        <GrillaMesas
          mesasIniciales={mesasIniciales}
          sedeId={sedeId}
          puedeEditar={false}
          modo="seleccion"
          onSeleccionarMesa={alSeleccionarMesa}
        />
      </ClayCard>

      <div className="flex flex-wrap gap-4">
        <ClayButton
          type="button"
          variant="secondary"
          size="lg"
          onClick={() => setModalDomicilioAbierto(true)}
        >
          Domicilio
        </ClayButton>
        <ClayButton type="button" variant="secondary" size="lg" disabled={creandoLlevar} onClick={alCrearLlevar}>
          {creandoLlevar ? "Creando…" : "Para llevar"}
        </ClayButton>
      </div>

      <FormularioDomicilio
        abierto={modalDomicilioAbierto}
        onCerrar={() => setModalDomicilioAbierto(false)}
        onCreado={(pedidoId) => router.push(`/pedido/${pedidoId}`)}
      />
    </div>
  );
}

interface FormularioDomicilioProps {
  abierto: boolean;
  onCerrar: () => void;
  onCreado: (pedidoId: string) => void;
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
    onCreado(resultado.valor.pedidoId);
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
            {isSubmitting ? "Creando…" : "Crear pedido"}
          </ClayButton>
        </div>
      </form>
    </ClayModal>
  );
}
```

- [ ] **Step 3: Verificar** — `pnpm lint`, `pnpm test` (80), `pnpm build` verdes.
- [ ] **Step 4: Commit** — `feat: pagina de inicio con selector de origen de pedido`

---

### Task 9: Selector de menú con modificadores

**Files:**
- Create: `components/pedido/SelectorMenu.tsx`, `components/pedido/SelectorModificadores.tsx`

**Interfaces:**
- Consumes: `CategoriaFila`/`ProductoFila`/`ModificadorFila` (`@/components/menu/types`, ya existen — reutilizar, no duplicar), `useCarritoStore` (Task 4).
- Produces: `<SelectorMenu categorias productos modificadores />` (client) — navegación por categorías + grilla de productos; clic en un producto sin modificadores lo agrega directo al carrito; clic en uno con modificadores abre `SelectorModificadores`.

- [ ] **Step 1: Crear `components/pedido/SelectorMenu.tsx`**

```tsx
"use client";

import { useState } from "react";
import { formatearCOP } from "@/lib/money";
import { cn } from "@/lib/cn";
import { useCarritoStore } from "@/lib/pedido/carritoStore";
import { SelectorModificadores } from "@/components/pedido/SelectorModificadores";
import type { CategoriaFila, ModificadorFila, ProductoFila } from "@/components/menu/types";

interface SelectorMenuProps {
  categorias: CategoriaFila[];
  productos: ProductoFila[];
  modificadores: ModificadorFila[];
}

/** Navegación de menú de solo lectura para la vendedora: elegir un producto
 *  lo agrega al carrito (directo, o vía el selector de modificadores). */
export function SelectorMenu({ categorias, productos, modificadores }: SelectorMenuProps) {
  const [categoriaSeleccionadaId, setCategoriaSeleccionadaId] = useState<string | null>(null);
  const [productoConModales, setProductoConModales] = useState<ProductoFila | null>(null);
  const agregar = useCarritoStore((estado) => estado.agregar);

  const categoriaActiva =
    categorias.find((categoria) => categoria.id === categoriaSeleccionadaId) ?? categorias[0] ?? null;
  const categoriaActivaId = categoriaActiva?.id ?? null;
  const productosDeCategoria = productos.filter((producto) => producto.categoria_id === categoriaActivaId);

  function alElegirProducto(producto: ProductoFila) {
    const modsDelProducto = modificadores.filter((m) => m.producto_id === producto.id);
    if (modsDelProducto.length === 0) {
      agregar({
        productoId: producto.id,
        nombre: producto.nombre,
        precioUnitPesos: Math.round(producto.precio_cop / 100),
        cantidad: 1,
        modificadores: [],
        nota: "",
      });
      return;
    }
    setProductoConModales(producto);
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Menú">
      <div className="flex flex-wrap gap-3" role="tablist" aria-label="Categorías">
        {categorias.map((categoria) => {
          const activa = categoria.id === categoriaActivaId;
          return (
            <button
              key={categoria.id}
              type="button"
              role="tab"
              aria-selected={activa}
              onClick={() => setCategoriaSeleccionadaId(categoria.id)}
              className={cn(
                "rounded-clay-md px-4 py-2 font-display text-sm font-semibold shadow-clay-sm",
                "transition-all duration-150",
                activa
                  ? "bg-brand-mostaza text-brand-chocolate"
                  : "bg-brand-crema text-brand-chocolate hover:bg-brand-crema-2",
              )}
            >
              {categoria.nombre}
            </button>
          );
        })}
      </div>

      {productosDeCategoria.length === 0 ? (
        <p className="rounded-clay-md bg-brand-chocolate-2 p-6 text-center text-sm text-brand-crema/70">
          Aún no hay productos en esta categoría.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
          {productosDeCategoria.map((producto) => (
            <button
              key={producto.id}
              type="button"
              onClick={() => alElegirProducto(producto)}
              className={cn(
                "flex min-h-12 w-full flex-col gap-2 rounded-clay-md bg-brand-crema p-3 text-left shadow-clay-sm",
                "transition-all duration-150 hover:shadow-clay-md active:shadow-clay-pressed active:translate-y-px",
                "focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2",
              )}
            >
              <div className="flex h-[92px] items-center justify-center overflow-hidden rounded-clay-sm bg-surface-sunken">
                {producto.imagen_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- imagen dinámica de Storage
                  <img
                    src={producto.imagen_url}
                    alt={producto.nombre}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-text-secondary">Sin imagen</span>
                )}
              </div>
              <span className="font-display text-sm font-semibold text-text-primary">{producto.nombre}</span>
              <span className="font-mono text-sm text-text-primary">
                {formatearCOP(BigInt(producto.precio_cop))}
              </span>
            </button>
          ))}
        </div>
      )}

      {productoConModales ? (
        <SelectorModificadores
          producto={productoConModales}
          modificadores={modificadores.filter((m) => m.producto_id === productoConModales.id)}
          onCerrar={() => setProductoConModales(null)}
        />
      ) : null}
    </section>
  );
}
```

- [ ] **Step 2: Crear `components/pedido/SelectorModificadores.tsx`**

```tsx
"use client";

import { useState } from "react";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayModal } from "@/components/ui/ClayModal";
import { ClayInput } from "@/components/ui/ClayInput";
import { formatearCOP } from "@/lib/money";
import { useCarritoStore } from "@/lib/pedido/carritoStore";
import type { ModificadorFila, ProductoFila } from "@/components/menu/types";

interface SelectorModificadoresProps {
  producto: ProductoFila;
  modificadores: ModificadorFila[];
  onCerrar: () => void;
}

const SIN_GRUPO = "__individual";

/** Agrupa modificadores por `grupo`: si todos los de un grupo son
 *  obligatorios, es de selección única (radio, elige 1); si no, es de
 *  selección múltiple (checkbox). Sin grupo: checkbox individual. */
export function SelectorModificadores({ producto, modificadores, onCerrar }: SelectorModificadoresProps) {
  const agregar = useCarritoStore((estado) => estado.agregar);
  const [seleccionUnica, setSeleccionUnica] = useState<Record<string, string>>({});
  const [seleccionMultiple, setSeleccionMultiple] = useState<Set<string>>(new Set());
  const [cantidad, setCantidad] = useState(1);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);

  const grupos = new Map<string, ModificadorFila[]>();
  for (const mod of modificadores) {
    const clave = mod.grupo ?? SIN_GRUPO;
    grupos.set(clave, [...(grupos.get(clave) ?? []), mod]);
  }
  const gruposRequeridos = [...grupos.entries()].filter(
    ([clave, items]) => clave !== SIN_GRUPO && items.every((m) => m.obligatorio),
  );
  const gruposOpcionales = [...grupos.entries()].filter(
    ([clave, items]) => clave === SIN_GRUPO || !items.every((m) => m.obligatorio),
  );

  function alternarMultiple(id: string) {
    setSeleccionMultiple((actual) => {
      const copia = new Set(actual);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });
  }

  function confirmar() {
    const faltante = gruposRequeridos.find(([clave]) => !seleccionUnica[clave]);
    if (faltante) {
      setError(`Elige una opción de "${faltante[0]}"`);
      return;
    }
    const idsElegidos = [...Object.values(seleccionUnica), ...seleccionMultiple];
    const modsElegidos = modificadores
      .filter((m) => idsElegidos.includes(m.id))
      .map((m) => ({
        modificadorId: m.id,
        nombre: m.nombre,
        precioDeltaPesos: Math.round(m.precio_delta_cop / 100),
      }));
    agregar({
      productoId: producto.id,
      nombre: producto.nombre,
      precioUnitPesos: Math.round(producto.precio_cop / 100),
      cantidad,
      modificadores: modsElegidos,
      nota: nota.trim(),
    });
    onCerrar();
  }

  return (
    <ClayModal abierto titulo={producto.nombre} onCerrar={onCerrar}>
      <div className="flex flex-col gap-4">
        {[...gruposRequeridos, ...gruposOpcionales].map(([clave, items]) => {
          const esRadio = gruposRequeridos.some(([c]) => c === clave);
          return (
            <fieldset key={clave} className="flex flex-col gap-2">
              <legend className="font-display text-sm font-medium text-text-primary">
                {clave === SIN_GRUPO ? "Adicionales" : clave}
                {esRadio ? " (elige 1)" : ""}
              </legend>
              {items.map((mod) => {
                const marcado = esRadio ? seleccionUnica[clave] === mod.id : seleccionMultiple.has(mod.id);
                return (
                  <label
                    key={mod.id}
                    className="flex items-center justify-between gap-2 rounded-clay-sm bg-surface-sunken px-3 py-2 text-sm text-text-primary"
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type={esRadio ? "radio" : "checkbox"}
                        name={esRadio ? clave : undefined}
                        checked={marcado}
                        onChange={() =>
                          esRadio
                            ? setSeleccionUnica((actual) => ({ ...actual, [clave]: mod.id }))
                            : alternarMultiple(mod.id)
                        }
                        className="size-4 accent-brand-mostaza"
                      />
                      {mod.nombre}
                    </span>
                    {mod.precio_delta_cop > 0 ? (
                      <span className="font-mono text-xs text-text-secondary">
                        +{formatearCOP(BigInt(mod.precio_delta_cop))}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </fieldset>
          );
        })}

        <ClayInput
          label="Cantidad"
          type="number"
          inputMode="numeric"
          min={1}
          max={50}
          value={cantidad}
          onChange={(evento) => setCantidad(Math.max(1, Number(evento.target.value) || 1))}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="nota-producto" className="font-display text-sm font-medium text-text-primary">
            Nota (opcional)
          </label>
          <textarea
            id="nota-producto"
            rows={2}
            placeholder="Ej: sin cebolla"
            value={nota}
            onChange={(evento) => setNota(evento.target.value)}
            className="resize-none rounded-clay-md bg-surface-sunken px-4 py-3 text-base text-text-primary shadow-clay-pressed placeholder:text-text-secondary/60 focus-visible:outline-3 focus-visible:outline-brand-mostaza"
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-brand-tomate-2">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-3">
          <ClayButton
            type="button"
            variant="ghost"
            className="text-text-primary hover:bg-brand-crema-2"
            onClick={onCerrar}
          >
            Cancelar
          </ClayButton>
          <ClayButton type="button" variant="primary" onClick={confirmar}>
            Agregar al carrito
          </ClayButton>
        </div>
      </div>
    </ClayModal>
  );
}
```

- [ ] **Step 3: Verificar** — `pnpm lint`, `pnpm test` (80), `pnpm build` verdes.
- [ ] **Step 4: Commit** — `feat: selector de menu y modificadores para armar el carrito`

---

### Task 10: Carrito, orquestador y página `/pedido/[id]`

**Files:**
- Create: `components/pedido/tipos.ts`, `components/pedido/CarritoPedido.tsx`, `components/pedido/PedidoEditor.tsx`, `app/(vendedora)/pedido/[pedidoId]/page.tsx`

**Interfaces:**
- Consumes: `useCarritoStore` (Task 4), `confirmarItemsPedido` (Task 7), `SelectorMenu` (Task 9), `CategoriaFila`/`ProductoFila`/`ModificadorFila` (`@/components/menu/types`).
- Produces: `PedidoVista`, `ItemConfirmadoVista`, `ModificadorConfirmadoVista` (tipos); ruta `/pedido/[pedidoId]` operativa.

- [ ] **Step 1: Crear `components/pedido/tipos.ts`**

```ts
export type EstadoPedido =
  | "abierto"
  | "enviado_cocina"
  | "en_preparacion"
  | "listo"
  | "entregado"
  | "cobrado"
  | "cerrado"
  | "anulado";
export type EstadoItemPedido = "pendiente" | "en_preparacion" | "listo" | "entregado";
export type CanalPedido = "mesa" | "domicilio" | "llevar";

export interface PedidoVista {
  id: string;
  numeroCorto: number;
  canal: CanalPedido;
  estado: EstadoPedido;
  mesaNumero: number | null;
  clienteNombre: string | null;
  subtotalCop: number;
  totalCop: number;
}

export interface ModificadorConfirmadoVista {
  nombre: string;
  precioDeltaCop: number;
}

export interface ItemConfirmadoVista {
  id: string;
  productoNombre: string;
  cantidad: number;
  precioUnitCop: number;
  subtotalCop: number;
  notas: string | null;
  estadoItem: EstadoItemPedido;
  modificadores: ModificadorConfirmadoVista[];
}
```

- [ ] **Step 2: Crear `components/pedido/CarritoPedido.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatearCOP, montoDesdePesos, multiplicar, sumar } from "@/lib/money";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayBadge } from "@/components/ui/ClayBadge";
import { useCarritoStore } from "@/lib/pedido/carritoStore";
import { confirmarItemsPedido } from "@/app/(vendedora)/pedido/actions";
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
}

/** Panel del carrito en curso (zustand) + ítems ya confirmados (solo lectura) + total. */
export function CarritoPedido({ pedido, itemsConfirmados }: CarritoPedidoProps) {
  const router = useRouter();
  const { items, quitar, cambiarCantidad, vaciar } = useCarritoStore();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (items.length === 0) return;
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

      <ClayButton
        type="button"
        variant="primary"
        size="lg"
        disabled={items.length === 0 || enviando}
        onClick={confirmar}
      >
        {enviando ? "Enviando…" : textoBoton}
      </ClayButton>
    </aside>
  );
}
```

- [ ] **Step 3: Crear `components/pedido/PedidoEditor.tsx`**

```tsx
"use client";

import { CarritoPedido } from "@/components/pedido/CarritoPedido";
import { SelectorMenu } from "@/components/pedido/SelectorMenu";
import type { CategoriaFila, ModificadorFila, ProductoFila } from "@/components/menu/types";
import type { ItemConfirmadoVista, PedidoVista } from "@/components/pedido/tipos";

interface PedidoEditorProps {
  pedido: PedidoVista;
  itemsConfirmados: ItemConfirmadoVista[];
  categorias: CategoriaFila[];
  productos: ProductoFila[];
  modificadores: ModificadorFila[];
}

/** Orquesta `/pedido/[id]`: menú a la izquierda, carrito a la derecha. */
export function PedidoEditor({
  pedido,
  itemsConfirmados,
  categorias,
  productos,
  modificadores,
}: PedidoEditorProps) {
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
      <div className="flex-1">
        <SelectorMenu categorias={categorias} productos={productos} modificadores={modificadores} />
      </div>
      <CarritoPedido pedido={pedido} itemsConfirmados={itemsConfirmados} />
    </div>
  );
}
```

- [ ] **Step 4: Crear `app/(vendedora)/pedido/[pedidoId]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { PedidoEditor } from "@/components/pedido/PedidoEditor";
import type { CategoriaFila, ModificadorFila, ProductoFila } from "@/components/menu/types";
import type { ItemConfirmadoVista, PedidoVista } from "@/components/pedido/tipos";

interface PageProps {
  params: Promise<{ pedidoId: string }>;
}

export default async function PedidoPage({ params }: PageProps) {
  const { pedidoId } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: pedidoFila } = await supabase
    .from("pedidos")
    .select("id, numero_corto, canal, estado, subtotal_cop, total_cop, mesa_id, cliente_id, vendedora_id")
    .eq("id", pedidoId)
    .single();

  if (!pedidoFila || pedidoFila.vendedora_id !== user?.id) {
    notFound();
  }

  let mesaNumero: number | null = null;
  if (pedidoFila.mesa_id) {
    const { data: mesaFila } = await supabase
      .from("mesas")
      .select("numero")
      .eq("id", pedidoFila.mesa_id)
      .single();
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

  const pedido: PedidoVista = {
    id: pedidoFila.id,
    numeroCorto: pedidoFila.numero_corto,
    canal: pedidoFila.canal,
    estado: pedidoFila.estado,
    mesaNumero,
    clienteNombre,
    subtotalCop: pedidoFila.subtotal_cop,
    totalCop: pedidoFila.total_cop,
  };

  const { data: itemsFilas } = await supabase
    .from("pedido_items")
    .select("id, producto_id, cantidad, precio_unit_cop, subtotal_cop, notas, estado_item")
    .eq("pedido_id", pedidoId);

  const productoIdsUsados = [...new Set((itemsFilas ?? []).map((i) => i.producto_id))];
  const { data: productosUsados } = productoIdsUsados.length
    ? await supabase.from("productos").select("id, nombre").in("id", productoIdsUsados)
    : { data: [] as { id: string; nombre: string }[] };
  const nombreProductoPorId = new Map((productosUsados ?? []).map((p) => [p.id, p.nombre]));

  const itemIds = (itemsFilas ?? []).map((i) => i.id);
  const { data: modsFilas } = itemIds.length
    ? await supabase
        .from("pedido_item_mods")
        .select("id, pedido_item_id, modificador_id, precio_delta_cop")
        .in("pedido_item_id", itemIds)
    : {
        data: [] as { id: string; pedido_item_id: string; modificador_id: string; precio_delta_cop: number }[],
      };
  const modificadorIdsUsados = [...new Set((modsFilas ?? []).map((m) => m.modificador_id))];
  const { data: modificadoresUsados } = modificadorIdsUsados.length
    ? await supabase.from("modificadores").select("id, nombre").in("id", modificadorIdsUsados)
    : { data: [] as { id: string; nombre: string }[] };
  const nombreModificadorPorId = new Map((modificadoresUsados ?? []).map((m) => [m.id, m.nombre]));

  const itemsConfirmados: ItemConfirmadoVista[] = (itemsFilas ?? []).map((fila) => ({
    id: fila.id,
    productoNombre: nombreProductoPorId.get(fila.producto_id) ?? "Producto",
    cantidad: fila.cantidad,
    precioUnitCop: fila.precio_unit_cop,
    subtotalCop: fila.subtotal_cop,
    notas: fila.notas,
    estadoItem: fila.estado_item,
    modificadores: (modsFilas ?? [])
      .filter((m) => m.pedido_item_id === fila.id)
      .map((m) => ({
        nombre: nombreModificadorPorId.get(m.modificador_id) ?? "Adicional",
        precioDeltaCop: m.precio_delta_cop,
      })),
  }));

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
      <h1 className="font-display text-3xl text-brand-mostaza">
        Pedido #{pedido.numeroCorto}
        {pedido.mesaNumero ? ` — Mesa ${pedido.mesaNumero}` : null}
        {pedido.clienteNombre ? ` — ${pedido.clienteNombre}` : null}
        {pedido.canal === "llevar" ? " — Para llevar" : null}
      </h1>
      <div className="mt-6">
        <PedidoEditor
          pedido={pedido}
          itemsConfirmados={itemsConfirmados}
          categorias={(categoriasFilas ?? []) as CategoriaFila[]}
          productos={(productosFilas ?? []) as ProductoFila[]}
          modificadores={(modificadoresFilas ?? []) as ModificadorFila[]}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Verificación manual completa** — con `pnpm dev`, sesión vendedora real (crear/usar un usuario con rol `vendedora` — si no existe uno de prueba, créalo con el mismo patrón de `usuarios`+`app_metadata` usado para el admin de pruebas, documentado en memoria del proyecto): en `/inicio`, elegir una mesa libre → mesa pasa a `ocupada`, redirige a `/pedido/[id]`; agregar un producto con modificadores obligatorios (ej. una arepa) → el selector pide elegir queso; agregar un producto sin modificadores; "Enviar a cocina" → los ítems aparecen como "Ya enviado a cocina" con badge "Pendiente" y el carrito en curso queda vacío; volver a agregar un producto y confirmar de nuevo → botón dice "Agregar a la comanda" y los ítems previos siguen intactos.

- [ ] **Step 6: Verificar** — `pnpm lint`, `pnpm test` (80), `pnpm build` verdes.
- [ ] **Step 7: Commit** — `feat: carrito, editor de pedido y pagina /pedido/[id]`

---

### Task 11: Verificación RLS + Realtime + reconciliación + cierre

**Files:**
- Modify: `CLAUDE.md` (§6.2 reconciliación de la política de vendedora)

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Verificación RLS (documentar status + body)** —
  a. `GET /rest/v1/pedidos?select=id` con solo anon key → `200 []`.
  b. INSERT en `pedidos` con anon key → 401/403.
  c. Con una sesión de vendedora real: crear un pedido, verificar que puede SELECT/UPDATE ese pedido y NO puede ver pedidos de otra vendedora (si existe una segunda vendedora de prueba; si no, documentar que la policy exige `vendedora_id = auth.uid()` y dejar la prueba cruzada para cuando exista un segundo usuario).
  d. Intentar UPDATE de un pedido con `estado='cobrado'` simulado (vía SQL directo poner un pedido de prueba en `cobrado` y luego intentar UPDATE con la sesión de la vendedora) → debe fallar (RLS lo bloquea).
  e. Con service_role → SELECT ve todos los pedidos de prueba creados.

- [ ] **Step 2: Reconciliar CLAUDE.md §6.2** — la línea actual dice: *"Vendedora: SELECT/INSERT/UPDATE solo sobre pedidos abiertos de su sede, y solo los que ella creó (`vendedora_id = auth.uid()`)."* Cambiar a: *"Vendedora: SELECT/INSERT/UPDATE sobre pedidos de su sede que ella creó (`vendedora_id = auth.uid()`), mientras `estado` no sea `cobrado`, `cerrado` ni `anulado` (permite seguir agregando ítems después de enviar a cocina)."* No tocar nada más de esa sección.

- [ ] **Step 3: Verificación final** — `pnpm lint && pnpm test && pnpm build` verdes. Flujo dev: login vendedora → `/inicio` → mesa/domicilio/llevar → `/pedido/[id]` con menú y carrito funcionando.

- [ ] **Step 4: Commit** — `docs: reconciliar CLAUDE.md 6.2 con la escritura de pedidos tras enviar a cocina`

---

## Notas para el ejecutor

- El controller provee `SUPABASE_ACCESS_TOKEN` en cada dispatch que toque cloud; nunca commitearlo ni imprimirlo.
- Los 80 tests base deben seguir verdes en todas las tasks.
- No existe todavía un usuario de prueba con rol `vendedora` en la base. Créalo cuando lo necesites (Task 10 Step 5 / Task 11) con el mismo patrón usado para el admin de pruebas: `POST /auth/v1/admin/users` con `app_metadata: { rol: "vendedora", sede_id: "00000000-0000-4000-8000-000000000001" }`, luego una fila en `public.usuarios` con `rol='vendedora'`. Documenta las credenciales creadas en tu reporte (nunca las commitees).
- Task 5 modifica un componente ya usado por `/mesas` del admin — verifica explícitamente que esa pantalla sigue funcionando igual tras el cambio (no le pasa `modo` ni `onSeleccionarMesa`, así que debe comportarse exactamente como antes).
- Si `SupabaseClient<Database>` no importa limpio en Task 6, usa `Awaited<ReturnType<typeof createServerSupabase>>` como alternativa de tipo — no bloquees la tarea por esto.
