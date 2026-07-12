# Menú (Bloque 3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menú real de Criollitas administrable: tablas con RLS, seed de la carta, 14 ilustraciones clay en Storage y CRUD de Admin en `/menu`.

**Architecture:** Migración SQL nueva (categorias/productos/modificadores + campo `grupo`) aplicada al cloud deliarepas; assets SVG versionados en `supabase/assets/menu/` subidos al bucket público `menu`; CRUD como Server Components + Server Actions con Zod y `Result<T, DomainError>`; UI Claymorphism con dos componentes nuevos (`ClayModal`, `ClayBadge`).

**Tech Stack:** Ya instalado todo (Next 15, zod v4, react-hook-form, cva, supabase-js/ssr, vitest). Sin dependencias nuevas.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-12-menu-bloque-3-design.md`. CLAUDE.md manda.
- Dinero `bigint` centavos (`_cop`). La UI captura pesos enteros y convierte con `montoDesdePesos` de `@/lib/money`.
- Soft delete siempre (`activo=false` / `activa=false`); jamás DELETE de productos/categorías (§13.8).
- Español CO en todo texto visible; dominio en español, infra en inglés.
- Server Components por defecto; `"use client"` solo interactividad. Mutaciones SOLO por Server Actions (§12).
- Errores de dominio: `Result<T, DomainError>` (union discriminada), nunca `throw` de strings.
- TDD para lógica de negocio. `pnpm lint && pnpm test && pnpm build` verdes antes de cada commit final de task.
- Commits: Conventional español + trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. En PowerShell 5.1 usar `git commit -F <tempfile>` (here-strings fallan a veces). NUNCA `Get-Content -Raw | ConvertTo-Json` (serializa metadatos PSObject); usar `[System.IO.File]::ReadAllText()`.
- Cloud: ref `btiejgeljpwsqwckuocs`; migraciones `supabase db push` con `$env:SUPABASE_ACCESS_TOKEN` (el controller lo provee); SQL ad-hoc vía Management API `POST /v1/projects/btiejgeljpwsqwckuocs/database/query`.
- Sede seed: `00000000-0000-4000-8000-000000000001`.
- Queries a `usuarios` u otras tablas: SIEMPRE columnas explícitas (REVOKE de pin_hash rompe `select *`).
- Rama: `feature/menu-bloque-3`.

---

### Task 1: Migración de menú + tipos

**Files:**
- Create: `supabase/migrations/<timestamp>_menu_base.sql` (timestamp real, p. ej. `20260712090000_menu_base.sql`)
- Modify: `lib/supabase/types.ts` (regenerado)

**Interfaces:**
- Produces: tablas `public.categorias`, `public.productos`, `public.modificadores`; tipos regenerados en `Database`.

- [ ] **Step 1: Escribir la migración**

```sql
create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references public.sedes (id),
  nombre text not null,
  orden integer not null default 0,
  activa boolean not null default true,
  imagen_url text,
  creado_en timestamptz not null default now()
);

create table public.productos (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references public.sedes (id),
  categoria_id uuid not null references public.categorias (id),
  nombre text not null,
  descripcion text,
  precio_cop bigint not null check (precio_cop > 0),
  imagen_url text,
  activo boolean not null default true,
  tiempo_prep_min integer,
  es_combo boolean not null default false,
  creado_en timestamptz not null default now()
);

-- grupo: agrupa opciones excluyentes (ej. "Queso"); extensión al modelo §7,
-- reconciliar CLAUDE.md en la Task 9.
create table public.modificadores (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos (id),
  grupo text,
  nombre text not null,
  precio_delta_cop bigint not null default 0,
  obligatorio boolean not null default false,
  max_seleccion integer not null default 1 check (max_seleccion >= 1),
  activo boolean not null default true
);

create index productos_sede_categoria on public.productos (sede_id, categoria_id, activo);
create index modificadores_producto on public.modificadores (producto_id, activo);

alter table public.categorias enable row level security;
alter table public.productos enable row level security;
alter table public.modificadores enable row level security;

-- Lectura: personal autenticado de la sede
create policy categorias_select on public.categorias
  for select to authenticated using (sede_id = public.current_sede_id());
create policy productos_select on public.productos
  for select to authenticated using (sede_id = public.current_sede_id());
create policy modificadores_select on public.modificadores
  for select to authenticated using (exists (
    select 1 from public.productos p
    where p.id = producto_id and p.sede_id = public.current_sede_id()
  ));

-- Escritura: solo admin de la sede. Sin policy de DELETE (soft delete).
create policy categorias_admin_insert on public.categorias
  for insert to authenticated
  with check (public.current_rol() = 'admin' and sede_id = public.current_sede_id());
create policy categorias_admin_update on public.categorias
  for update to authenticated
  using (public.current_rol() = 'admin' and sede_id = public.current_sede_id())
  with check (public.current_rol() = 'admin' and sede_id = public.current_sede_id());
create policy productos_admin_insert on public.productos
  for insert to authenticated
  with check (public.current_rol() = 'admin' and sede_id = public.current_sede_id());
create policy productos_admin_update on public.productos
  for update to authenticated
  using (public.current_rol() = 'admin' and sede_id = public.current_sede_id())
  with check (public.current_rol() = 'admin' and sede_id = public.current_sede_id());
create policy modificadores_admin_insert on public.modificadores
  for insert to authenticated
  with check (public.current_rol() = 'admin' and exists (
    select 1 from public.productos p
    where p.id = producto_id and p.sede_id = public.current_sede_id()
  ));
create policy modificadores_admin_update on public.modificadores
  for update to authenticated
  using (public.current_rol() = 'admin' and exists (
    select 1 from public.productos p
    where p.id = producto_id and p.sede_id = public.current_sede_id()
  ))
  with check (public.current_rol() = 'admin' and exists (
    select 1 from public.productos p
    where p.id = producto_id and p.sede_id = public.current_sede_id()
  ));
```

- [ ] **Step 2: Aplicar** — Run: `supabase db push` → `Finished supabase db push.` Verificar con Management API: `select tablename from pg_tables where schemaname='public' and tablename in ('categorias','productos','modificadores');` → 3 filas.

- [ ] **Step 3: Regenerar tipos** — Run: `supabase gen types typescript --linked | Out-File -Encoding utf8 lib/supabase/types.ts` (verificar que el archivo empieza con `export` y contiene `categorias`). `pnpm build` → exit 0.

- [ ] **Step 4: Commit** — `feat: migración de menú (categorias, productos, modificadores) con RLS`

---

### Task 2: Seed del menú real

**Files:**
- Create: `supabase/migrations/<timestamp>_seed_menu.sql` (como migración para que entornos frescos lo tengan; contenido idempotente)

**Interfaces:**
- Produces: 4 categorías, 14 productos y 20 modificadores con UUIDs fijos. Los UUIDs de productos siguen `00000000-0000-4000-8000-0000000003NN`.

- [ ] **Step 1: Escribir el seed completo (idempotente, precios en CENTAVOS = pesos × 100)**

```sql
-- Categorías (00000000-0000-4000-8000-0000000002NN)
insert into public.categorias (id, sede_id, nombre, orden) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000001', 'Arepas Rellenas', 1),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000001', 'Chorizo de Cerdo', 2),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000001', 'Jugos en Leche', 3),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000001', 'Bebidas', 4)
on conflict (id) do nothing;

-- Productos (precio_cop en centavos)
insert into public.productos (id, sede_id, categoria_id, nombre, descripcion, precio_cop) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201',
   'Super Criollita', 'Queso de tu elección, carne, pollo desmechado y chicharrón', 1700000),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201',
   'Criollita con Res', 'Queso de tu elección y carne desmechada', 1500000),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201',
   'Criollita con Pollo', 'Queso de tu elección y pollo desmechado', 1400000),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201',
   'Criollita de Huevos Pericos', 'Queso de tu elección, huevos pericos y salchicha ranchera', 1100000),
  ('00000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201',
   'Criollita con Queso', 'Queso de tu elección', 800000),
  ('00000000-0000-4000-8000-000000000306', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000202',
   'Chorizo Santarrosano', 'Acompañado de arepa y tomate', 1100000),
  ('00000000-0000-4000-8000-000000000307', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000203',
   'Jugo de Fresa en Leche', null, 700000),
  ('00000000-0000-4000-8000-000000000308', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000203',
   'Jugo de Mora en Leche', null, 700000),
  ('00000000-0000-4000-8000-000000000309', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000203',
   'Jugo de Mango en Leche', null, 700000),
  ('00000000-0000-4000-8000-000000000310', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000203',
   'Jugo de Guanábana en Leche', null, 700000),
  ('00000000-0000-4000-8000-000000000311', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000204',
   'Gaseosa', 'Precio provisional, ajustar en el CRUD', 400000),
  ('00000000-0000-4000-8000-000000000312', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000204',
   'Jugo Hit', 'Precio provisional, ajustar en el CRUD', 400000),
  ('00000000-0000-4000-8000-000000000313', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000204',
   'Café', 'Precio provisional, ajustar en el CRUD', 250000),
  ('00000000-0000-4000-8000-000000000314', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000204',
   'Café en Leche', 'Precio provisional, ajustar en el CRUD', 350000)
on conflict (id) do nothing;

-- Modificadores de las 5 arepas (301..305): grupo Queso (obligatorio, elegir 1)
-- y Adicionales opcionales. Generados con un bloque DO para no repetir 20 inserts.
do $$
declare
  arepa uuid;
begin
  foreach arepa in array array[
    '00000000-0000-4000-8000-000000000301'::uuid,
    '00000000-0000-4000-8000-000000000302'::uuid,
    '00000000-0000-4000-8000-000000000303'::uuid,
    '00000000-0000-4000-8000-000000000304'::uuid,
    '00000000-0000-4000-8000-000000000305'::uuid
  ] loop
    insert into public.modificadores (producto_id, grupo, nombre, precio_delta_cop, obligatorio, max_seleccion)
    select arepa, v.grupo, v.nombre, v.delta, v.obligatorio, 1
    from (values
      ('Queso', 'Queso campesino', 0::bigint, true),
      ('Queso', 'Queso mozzarella', 0::bigint, true),
      ('Adicionales', 'Chorizo', 350000::bigint, false),
      ('Adicionales', 'Chicharrón', 200000::bigint, false)
    ) as v(grupo, nombre, delta, obligatorio)
    where not exists (
      select 1 from public.modificadores m
      where m.producto_id = arepa and m.nombre = v.nombre
    );
  end loop;
end $$;
```

- [ ] **Step 2: Aplicar** — `supabase db push`. Verificar por Management API: `select count(*) from public.productos;` → 14; `select count(*) from public.modificadores;` → 20.

- [ ] **Step 3: Commit** — `feat: seed del menú real de la carta con modificadores`

---

### Task 3: Ilustraciones clay de los 14 productos

**Files:**
- Create: `supabase/assets/menu/*.svg` — 14 archivos, nombre = slug del producto:
  `super-criollita.svg`, `criollita-con-res.svg`, `criollita-con-pollo.svg`, `criollita-de-huevos-pericos.svg`, `criollita-con-queso.svg`, `chorizo-santarrosano.svg`, `jugo-de-fresa-en-leche.svg`, `jugo-de-mora-en-leche.svg`, `jugo-de-mango-en-leche.svg`, `jugo-de-guanabana-en-leche.svg`, `gaseosa.svg`, `jugo-hit.svg`, `cafe.svg`, `cafe-en-leche.svg`

**Interfaces:**
- Produces: SVGs 208×160 (`viewBox="0 0 208 160"`), fondo transparente, listos para Task 4.

- [ ] **Step 1: Reglas comunes (aplicar a todos)**

Estilo "clay" aprobado por el usuario en el artifact de muestra: formas redondeadas sin contornos duros, sombra elíptica `fill="#2A1409" opacity=".25"` bajo el plato, paleta cálida de la marca. El dibujo ocupa ~80% del lienzo, centrado.

Referencia de patrón (arepa con res, escalar ×2 el sample a 208×160):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 208 160">
  <ellipse cx="104" cy="132" rx="84" ry="18" fill="#2A1409" opacity=".25"/>
  <path d="M28 104 q76 -28 152 0 q-8 24 -76 24 q-68 0 -76 -24z" fill="#F0D28C"/>
  <path d="M32 96 q72 24 144 0 l-4 12 q-68 22 -136 0z" fill="#8B4A2F"/>
  <path d="M36 92 q20 12 32 6 M80 100 q16 8 28 2 M128 100 q16 6 28 -2"
        stroke="#6E3620" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M24 80 q80 -44 160 0 q-12 20 -80 20 q-68 0 -80 -20z" fill="#F5DFA0"/>
  <ellipse cx="76" cy="60" rx="8" ry="5" fill="#E8C070"/>
  <ellipse cx="124" cy="54" rx="7" ry="4" fill="#E8C070"/>
</svg>
```

- [ ] **Step 2: Variaciones por producto (colores/elementos exactos)**

| Archivo | Base | Relleno / detalle |
|---|---|---|
| criollita-con-res | patrón arepa | relleno `#8B4A2F`, hebras `#6E3620` |
| criollita-con-pollo | patrón arepa | relleno `#E8A33D`, hebras `#C97F1B` |
| criollita-con-queso | patrón arepa | relleno `#FFF3C4` con goteo (2-3 curvas colgando), hebras `#EAD98F` |
| criollita-de-huevos-pericos | patrón arepa | relleno `#F5A623` + 4 motas rojas `#D84315` (tomate) + medallón `#E5906B` (salchicha) asomando |
| super-criollita | patrón arepa | TRES franjas: `#8B4A2F` (res), `#E8A33D` (pollo), `#D98559` (chicharrón), arepa más alta |
| chorizo-santarrosano | plato elíptico `#F3E6D8` | chorizo curvo `#8E3B2F` con brillo `#A94F3E` y cuerda `#D9B98C` en la punta, arepa pequeña `#F5DFA0` detrás, rodaja tomate `#D84315` con centro `#E8785A` |
| jugo-de-*-en-leche | vaso: rect rx grande + franja superior leche `#F3E6D8` + resalte | cuerpo fresa `#E05A6D` / mora `#7A2853` / mango `#F2A93B` / guanábana `#EFE9DC` (+ 3 semillas `#3D1F14` en guanábana); burbujas del color oscurecido |
| gaseosa | vaso alto `#4A2B18` translúcido con hielo (2 rects `#FFF8E7` opacity .5) | burbujas `#F5B822`, pajilla `#D84315` |
| jugo-hit | cajita rect rx 12 `#F2A93B` con tapa `#E5906B` | pajilla `#FFF8E7`, etiqueta elipse `#FFF8E7` |
| cafe | taza `#FFF8E7` sobre plato, café `#4A2B18` | 2 ondas de vapor `#C9A98E` |
| cafe-en-leche | igual que cafe | líquido `#B98A5F`, 2 ondas de vapor |

- [ ] **Step 3: Verificación visual**

Generar un HTML temporal (scratchpad, no commitear) que muestre los 14 SVG en grilla sobre fondo `#3D1F14` a 104px de ancho, y revisar: siluetas distinguibles entre sí a ese tamaño, ningún color fuera de la paleta cálida, sombra presente en todos. Corregir lo que desentone.

- [ ] **Step 4: Commit** — `feat: ilustraciones clay de los 14 productos del menú`

---

### Task 4: Bucket `menu` en Storage + subida de assets

**Files:**
- Create: `supabase/migrations/<timestamp>_storage_menu.sql`
- Create: `scripts/subir-assets-menu.mjs` (Node, se ejecuta una vez; queda versionado para reuso)

**Interfaces:**
- Consumes: SVGs de Task 3, UUIDs de productos de Task 2.
- Produces: bucket público `menu` con objetos `productos/<producto_id>.svg`; `productos.imagen_url` apuntando a `https://btiejgeljpwsqwckuocs.supabase.co/storage/v1/object/public/menu/productos/<id>.svg`.

- [ ] **Step 1: Migración de bucket y políticas**

```sql
insert into storage.buckets (id, name, public)
values ('menu', 'menu', true)
on conflict (id) do nothing;

-- Lectura pública implícita por bucket public=true. Escritura solo admin:
create policy menu_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'menu' and public.current_rol() = 'admin');
create policy menu_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'menu' and public.current_rol() = 'admin')
  with check (bucket_id = 'menu' and public.current_rol() = 'admin');
create policy menu_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'menu' and public.current_rol() = 'admin');
```

(DELETE aquí es legítimo: es reemplazo de archivos de imagen, no datos operativos.)
Aplicar con `supabase db push`.

- [ ] **Step 2: Script de subida (`scripts/subir-assets-menu.mjs`)**

```js
// Uso: node scripts/subir-assets-menu.mjs
// Lee SUPABASE_SERVICE_ROLE_KEY y NEXT_PUBLIC_SUPABASE_URL de .env.local.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const slugAId = {
  "super-criollita": "00000000-0000-4000-8000-000000000301",
  "criollita-con-res": "00000000-0000-4000-8000-000000000302",
  "criollita-con-pollo": "00000000-0000-4000-8000-000000000303",
  "criollita-de-huevos-pericos": "00000000-0000-4000-8000-000000000304",
  "criollita-con-queso": "00000000-0000-4000-8000-000000000305",
  "chorizo-santarrosano": "00000000-0000-4000-8000-000000000306",
  "jugo-de-fresa-en-leche": "00000000-0000-4000-8000-000000000307",
  "jugo-de-mora-en-leche": "00000000-0000-4000-8000-000000000308",
  "jugo-de-mango-en-leche": "00000000-0000-4000-8000-000000000309",
  "jugo-de-guanabana-en-leche": "00000000-0000-4000-8000-000000000310",
  "gaseosa": "00000000-0000-4000-8000-000000000311",
  "jugo-hit": "00000000-0000-4000-8000-000000000312",
  "cafe": "00000000-0000-4000-8000-000000000313",
  "cafe-en-leche": "00000000-0000-4000-8000-000000000314",
};

for (const archivo of readdirSync("supabase/assets/menu")) {
  const slug = path.basename(archivo, ".svg");
  const id = slugAId[slug];
  if (!id) throw new Error(`SVG sin producto: ${archivo}`);
  const ruta = `productos/${id}.svg`;
  const { error } = await supabase.storage
    .from("menu")
    .upload(ruta, readFileSync(`supabase/assets/menu/${archivo}`), {
      contentType: "image/svg+xml",
      upsert: true,
    });
  if (error) throw new Error(`${archivo}: ${error.message}`);
  const url = supabase.storage.from("menu").getPublicUrl(ruta).data.publicUrl;
  const { error: e2 } = await supabase.from("productos").update({ imagen_url: url }).eq("id", id);
  if (e2) throw new Error(`imagen_url ${slug}: ${e2.message}`);
  console.log(`OK ${slug}`);
}
console.log("Listo: 14 imágenes subidas y enlazadas.");
```

- [ ] **Step 3: Ejecutar y verificar** — `node scripts/subir-assets-menu.mjs` → 14 OK. Abrir una URL pública con Invoke-WebRequest → 200 y content-type `image/svg+xml`. Management API: `select count(*) from public.productos where imagen_url is not null;` → 14.

- [ ] **Step 4: Commit** — `feat: bucket de storage del menú y subida de ilustraciones`

---

### Task 5: Validaciones Zod + lógica de orden (TDD)

**Files:**
- Create: `lib/validations/menu.ts`, `lib/menu/orden.ts`
- Test: `tests/unit/validations-menu.test.ts`, `tests/unit/orden-categorias.test.ts`

**Interfaces:**
- Produces:
  - `productoSchema`: `{ nombre: string min 2, descripcion?: string, categoriaId: uuid, precioPesos: número entero positivo, tiempoPrepMin?: entero >= 0, activo: boolean default true }` + `ProductoInput`.
  - `categoriaSchema`: `{ nombre: string min 2 }` + `CategoriaInput`.
  - `modificadorSchema`: `{ productoId: uuid, grupo?: string, nombre: string min 2, deltaPesos: entero >= 0, obligatorio: boolean, maxSeleccion: entero >= 1 }` + `ModificadorInput`. Regla cruzada: si `obligatorio` es true, `grupo` es requerido (mensaje "Los modificadores obligatorios necesitan un grupo").
  - `moverCategoria(ordenActual: string[], id: string, direccion: "arriba" | "abajo"): string[]` — pura, devuelve nuevo arreglo; en extremos devuelve igual.

- [ ] **Step 1: Tests que fallan** (`tests/unit/validations-menu.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { categoriaSchema, modificadorSchema, productoSchema } from "@/lib/validations/menu";

const categoriaId = "00000000-0000-4000-8000-000000000201";
const productoId = "00000000-0000-4000-8000-000000000301";

describe("productoSchema", () => {
  it("acepta un producto válido", () => {
    expect(
      productoSchema.safeParse({ nombre: "Criollita con Res", categoriaId, precioPesos: 15000, activo: true })
        .success,
    ).toBe(true);
  });
  it("rechaza precio 0, negativo o con decimales", () => {
    for (const precioPesos of [0, -100, 15000.5]) {
      expect(productoSchema.safeParse({ nombre: "X arepa", categoriaId, precioPesos, activo: true }).success).toBe(false);
    }
  });
  it("rechaza nombre vacío", () => {
    expect(productoSchema.safeParse({ nombre: "", categoriaId, precioPesos: 1000, activo: true }).success).toBe(false);
  });
});

describe("modificadorSchema", () => {
  const base = { productoId, nombre: "Queso campesino", deltaPesos: 0, obligatorio: false, maxSeleccion: 1 };
  it("acepta modificador opcional sin grupo", () => {
    expect(modificadorSchema.safeParse(base).success).toBe(true);
  });
  it("exige grupo cuando es obligatorio", () => {
    const r = modificadorSchema.safeParse({ ...base, obligatorio: true });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe("Los modificadores obligatorios necesitan un grupo");
    }
  });
  it("acepta obligatorio con grupo", () => {
    expect(modificadorSchema.safeParse({ ...base, obligatorio: true, grupo: "Queso" }).success).toBe(true);
  });
  it("rechaza maxSeleccion 0 y delta negativo", () => {
    expect(modificadorSchema.safeParse({ ...base, maxSeleccion: 0 }).success).toBe(false);
    expect(modificadorSchema.safeParse({ ...base, deltaPesos: -100 }).success).toBe(false);
  });
});

describe("categoriaSchema", () => {
  it("acepta nombre válido y rechaza vacío", () => {
    expect(categoriaSchema.safeParse({ nombre: "Bebidas" }).success).toBe(true);
    expect(categoriaSchema.safeParse({ nombre: "" }).success).toBe(false);
  });
});
```

(`tests/unit/orden-categorias.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { moverCategoria } from "@/lib/menu/orden";

describe("moverCategoria", () => {
  const orden = ["a", "b", "c"];
  it("sube un elemento", () => {
    expect(moverCategoria(orden, "b", "arriba")).toEqual(["b", "a", "c"]);
  });
  it("baja un elemento", () => {
    expect(moverCategoria(orden, "b", "abajo")).toEqual(["a", "c", "b"]);
  });
  it("no mueve en los extremos", () => {
    expect(moverCategoria(orden, "a", "arriba")).toEqual(orden);
    expect(moverCategoria(orden, "c", "abajo")).toEqual(orden);
  });
  it("ignora ids inexistentes", () => {
    expect(moverCategoria(orden, "z", "arriba")).toEqual(orden);
  });
  it("no muta el arreglo original", () => {
    moverCategoria(orden, "b", "arriba");
    expect(orden).toEqual(["a", "b", "c"]);
  });
});
```

- [ ] **Step 2: FAIL** — `pnpm test` → módulos no encontrados.

- [ ] **Step 3: Implementar**

`lib/validations/menu.ts`:

```ts
import { z } from "zod";

export const categoriaSchema = z.object({
  nombre: z.string().min(2, "Escribe el nombre de la categoría"),
});
export type CategoriaInput = z.infer<typeof categoriaSchema>;

export const productoSchema = z.object({
  nombre: z.string().min(2, "Escribe el nombre del producto"),
  descripcion: z.string().optional(),
  categoriaId: z.uuid("Categoría inválida"),
  precioPesos: z
    .number("Escribe el precio en pesos")
    .int("El precio va en pesos, sin decimales")
    .positive("El precio debe ser mayor que cero"),
  tiempoPrepMin: z.number().int().min(0).optional(),
  activo: z.boolean().default(true),
});
export type ProductoInput = z.infer<typeof productoSchema>;

export const modificadorSchema = z
  .object({
    productoId: z.uuid("Producto inválido"),
    grupo: z.string().min(1).optional(),
    nombre: z.string().min(2, "Escribe el nombre del modificador"),
    deltaPesos: z.number().int("El valor va en pesos, sin decimales").min(0, "El valor no puede ser negativo"),
    obligatorio: z.boolean(),
    maxSeleccion: z.number().int().min(1, "Debe permitir al menos una selección"),
  })
  .refine((m) => !m.obligatorio || !!m.grupo, {
    message: "Los modificadores obligatorios necesitan un grupo",
    path: ["grupo"],
  });
export type ModificadorInput = z.infer<typeof modificadorSchema>;
```

`lib/menu/orden.ts`:

```ts
export function moverCategoria(
  ordenActual: readonly string[],
  id: string,
  direccion: "arriba" | "abajo",
): string[] {
  const orden = [...ordenActual];
  const desde = orden.indexOf(id);
  const hasta = direccion === "arriba" ? desde - 1 : desde + 1;
  if (desde === -1 || hasta < 0 || hasta >= orden.length) return orden;
  const [item] = orden.splice(desde, 1);
  orden.splice(hasta, 0, item!);
  return orden;
}
```

Nota zod v4: si alguna firma de mensaje (`z.number("…")`) no compila en la versión instalada, usar la forma equivalente (`z.number({ error: "…" })` o `.min/.int` con mensaje) manteniendo los TEXTOS exactos — son contratos de los tests.

- [ ] **Step 4: PASS** — `pnpm test` → verde (suite completa).
- [ ] **Step 5: Commit** — `feat: validaciones del menú y orden de categorías (TDD)`

---

### Task 6: ClayModal y ClayBadge

**Files:**
- Create: `components/ui/ClayModal.tsx`, `components/ui/ClayBadge.tsx`
- Modify: `app/design/page.tsx` (agregar sección de muestra de ambos)

**Interfaces:**
- Produces:
  - `<ClayModal abierto titulo onCerrar>{children}</ClayModal>` — Client Component sobre `<dialog>` nativo: `showModal()`/`close()` sincronizados con `abierto`, cierre con Esc y clic en el fondo, `aria-labelledby` al título, fondo overlay `rgba(42,20,9,.6)`, panel `ClayCard`-style crema `rounded-clay-lg shadow-clay-lg p-6 max-w-lg w-full`.
  - `<ClayBadge variant>` con cva: `neutral` (crema-3/chocolate), `exito` (verde/chocolate), `alerta` (mostaza/chocolate), `peligro` (tomate/crema), `pill` radius, texto 12px semibold.

- [ ] **Step 1: Implementar ambos componentes** siguiendo el patrón cva de `components/ui/ClayButton.tsx` (leerlo primero). ClayModal maneja ref al `<dialog>` y un `useEffect` que llama `showModal()`/`close()` según `abierto`; el evento `close` del dialog dispara `onCerrar`.
- [ ] **Step 2: Agregar muestras a `/design`** (botón que abre un ClayModal de ejemplo y fila de badges) — la página es Server Component: crear `components/ui/DemoModal.tsx` client wrapper pequeño para la muestra.
- [ ] **Step 3: Verificar** — `pnpm lint`, `pnpm test`, `pnpm build` verdes; `/design` en dev muestra modal operable (abrir, Esc, clic fuera) y badges.
- [ ] **Step 4: Commit** — `feat: ClayModal y ClayBadge`

---

### Task 7: Server Actions del menú

**Files:**
- Create: `lib/result.ts`, `app/(admin)/menu/actions.ts`
- Test: `tests/unit/result.test.ts`

**Interfaces:**
- Consumes: schemas de Task 5, `montoDesdePesos` de `@/lib/money`, `createServerSupabase` de `@/lib/supabase/server`, `moverCategoria` de `@/lib/menu/orden`.
- Produces:
  - `lib/result.ts`: `type Result<T, E> = { ok: true; valor: T } | { ok: false; error: E }`; helpers `ok(valor)`, `err(error)`; `type DomainError = { codigo: "VALIDACION" | "NO_AUTORIZADO" | "NO_ENCONTRADO" | "BASE_DATOS"; mensaje: string }`.
  - Actions (todas `"use server"`, todas verifican admin con `getUser()` + rol del metadata ANTES de tocar datos — §13.2 —, todas devuelven `Promise<Result<T, DomainError>>` y llaman `revalidatePath("/menu")` al mutar):
    - `crearProducto(input: ProductoInput): Result<{ id: string }>`
    - `editarProducto(id: string, input: ProductoInput): Result<{ id: string }>`
    - `cambiarActivoProducto(id: string, activo: boolean): Result<{ id: string }>`
    - `crearCategoria(input: CategoriaInput): Result<{ id: string }>` (orden = max(orden)+1)
    - `editarCategoria(id: string, input: CategoriaInput): Result<{ id: string }>`
    - `moverCategoriaAction(id: string, direccion: "arriba" | "abajo"): Result<null>` (lee ids ordenados, aplica `moverCategoria`, persiste `orden` = índice)
    - `guardarModificador(input: ModificadorInput & { id?: string }): Result<{ id: string }>` (upsert)
    - `cambiarActivoModificador(id: string, activo: boolean): Result<null>`
    - `subirImagenProducto(productoId: string, formData: FormData): Result<{ url: string }>` — valida archivo (`image/jpeg|png|webp|svg+xml`, ≤ 2 MB → error "La imagen no puede pesar más de 2 MB"), sube a `menu/productos/<productoId>.<ext>` con `upsert: true` usando el client del servidor (la política de Storage exige admin), actualiza `productos.imagen_url` con `?v=<Date.now()>` para romper caché.
  - Conversión: `precio_cop = montoDesdePesos(input.precioPesos).toString()` (supabase-js serializa bigint como string en columnas bigint; verificar que el insert lo acepta — si el tipo generado pide `number`, usar `Number(...)` SOLO si el valor cabe seguro en enteros de precio; documentar la elección en el código).

- [ ] **Step 1: Test de `lib/result.ts` (TDD)**

```ts
import { describe, expect, it } from "vitest";
import { err, ok } from "@/lib/result";

describe("Result", () => {
  it("ok envuelve el valor", () => {
    expect(ok(5)).toEqual({ ok: true, valor: 5 });
  });
  it("err envuelve el error de dominio", () => {
    expect(err({ codigo: "VALIDACION", mensaje: "x" })).toEqual({
      ok: false,
      error: { codigo: "VALIDACION", mensaje: "x" },
    });
  });
});
```

FAIL → implementar `lib/result.ts` → PASS.

- [ ] **Step 2: Implementar `app/(admin)/menu/actions.ts`**

Estructura de cada action (patrón único, mostrado con `crearProducto`; replicar en las demás):

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { productoSchema, type ProductoInput } from "@/lib/validations/menu";
import { montoDesdePesos } from "@/lib/money";
import { err, ok, type DomainError, type Result } from "@/lib/result";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";

async function exigirAdmin(): Promise<Result<{ sedeId: string }, DomainError>> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return err({ codigo: "NO_AUTORIZADO", mensaje: "Inicia sesión de nuevo" });
  if (user.user_metadata?.rol !== "admin") {
    return err({ codigo: "NO_AUTORIZADO", mensaje: "Solo el administrador puede editar el menú" });
  }
  return ok({ sedeId: (user.user_metadata?.sede_id as string) ?? SEDE_DEFAULT_ID });
}

export async function crearProducto(input: ProductoInput): Promise<Result<{ id: string }, DomainError>> {
  const admin = await exigirAdmin();
  if (!admin.ok) return admin;
  const parsed = productoSchema.safeParse(input);
  if (!parsed.success) {
    return err({ codigo: "VALIDACION", mensaje: parsed.error.issues[0]?.message ?? "Datos inválidos" });
  }
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("productos")
    .insert({
      sede_id: admin.valor.sedeId,
      categoria_id: parsed.data.categoriaId,
      nombre: parsed.data.nombre,
      descripcion: parsed.data.descripcion ?? null,
      precio_cop: Number(montoDesdePesos(parsed.data.precioPesos)),
      tiempo_prep_min: parsed.data.tiempoPrepMin ?? null,
      activo: parsed.data.activo,
    })
    .select("id")
    .single();
  if (error) return err({ codigo: "BASE_DATOS", mensaje: "No pudimos guardar el producto. Intenta de nuevo." });
  revalidatePath("/menu");
  return ok({ id: data.id });
}
```

Nota RLS: las actions usan el client del usuario (anon + cookies), así RLS es la última línea — un no-admin recibiría error de RLS aunque saltara `exigirAdmin`.

- [ ] **Step 3: Verificar** — `pnpm lint`, `pnpm test`, `pnpm build` verdes.
- [ ] **Step 4: Commit** — `feat: server actions del menú con Result y validación al borde`

---

### Task 8: UI de administración `/menu`

**Files:**
- Create: `app/(admin)/menu/page.tsx`, `components/menu/GrillaProductos.tsx`, `components/menu/EditorProducto.tsx`, `components/menu/EditorModificadores.tsx`, `components/menu/BarraCategorias.tsx`

**Interfaces:**
- Consumes: actions de Task 7, `ClayModal`/`ClayBadge`/`ClayButton`/`ClayInput` (Tasks 5-6 del bloque 1 y Task 6), `formatearCOP` de `@/lib/money`.
- Produces: ruta `/menu` operativa para el rol admin (el middleware ya la protege).

- [ ] **Step 1: `page.tsx`** (Server Component): lee con el client del servidor `categorias` (activas, orden asc) y `productos` (todos, con `id, nombre, descripcion, precio_cop, imagen_url, activo, categoria_id, tiempo_prep_min`) y `modificadores` de la sede; pasa datos serializables a los componentes cliente. `precio_cop` llega como number/string → convertir a `bigint` en el borde para formatear.
- [ ] **Step 2: `BarraCategorias`** (client): pestañas horizontales con nombre y botones ▲▼ (llaman `moverCategoriaAction`), botón "Nueva categoría" (ClayModal con ClayInput). Densidad admin (§8.4).
- [ ] **Step 3: `GrillaProductos`** (client): baldosas 160px como el patrón aprobado del artifact — imagen (`<img src={imagen_url}>` alto 92px object-contain), nombre, `formatearCOP`, `ClayBadge` "Inactivo" (variant alerta) cuando `!activo`; clic abre EditorProducto; botón "+ Nuevo producto".
- [ ] **Step 4: `EditorProducto`** (client): ClayModal con react-hook-form + zodResolver(productoSchema): nombre, descripción (textarea con clases de ClayInput), select de categoría (mismo estilo hundido), precio en pesos, tiempo prep, switch activo (ClayButton toggle), imagen: preview actual + `<input type="file">` estilizado → `subirImagenProducto`. Errores del Result en `<p role="alert">`. Botones Guardar (primary) / Desactivar (destructive, con confirmación en el mismo modal: "El producto deja de aparecer para la vendedora, pero conserva su historial en reportes.") / Cancelar (ghost).
- [ ] **Step 5: `EditorModificadores`** (client, sección dentro del EditorProducto cuando el producto ya existe): lista agrupada por `grupo` (sin grupo = "Opcionales"), cada fila nombre + delta formateado + badges (Obligatorio) + botón desactivar; formulario inline para agregar (nombre, delta pesos, grupo, obligatorio, max selección) → `guardarModificador`.
- [ ] **Step 6: Verificación manual completa** — con `pnpm dev`, sesión admin real (login → PIN): crear producto de prueba, editarlo, cambiar precio, subir una imagen (verla reemplazada), desactivarlo (badge), crear categoría, moverla, agregar y desactivar un modificador. Después limpiar: desactivar el producto de prueba está bien (soft delete; no hay DELETE).
- [ ] **Step 7: Auditoría UX** contra §8.4 (densidad admin, contraste AA, estados hover/focus/disabled/empty — la grilla vacía muestra "Aún no hay productos en esta categoría").
- [ ] **Step 8: Verificar** — `pnpm lint`, `pnpm test`, `pnpm build`. Commit — `feat: CRUD de menú para administrador`

---

### Task 9: Verificación RLS + reconciliación + cierre

**Files:**
- Modify: `CLAUDE.md` §7 (modelo de `modificadores`: agregar campo `grupo`)

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Verificar RLS contra cloud** — REST con anon key SIN sesión: `GET /rest/v1/productos?select=id` → `[]`. INSERT con anon → 401/403. Con service_role → 14 filas. Documentar outputs.
- [ ] **Step 2: Reconciliar CLAUDE.md §7** — en el bloque del modelo, línea de `modificadores`: agregar `grupo` tras `producto_id`: `modificadores (id, producto_id, grupo, nombre, precio_delta_cop, obligatorio, max_seleccion)` y nota `-- grupo agrupa opciones excluyentes (ej. "Queso": campesino|mozzarella)`. NADA más se toca.
- [ ] **Step 3: Verificación final** — `pnpm lint && pnpm test && pnpm build` verdes. Flujo dev: login admin → `/menu` → carta completa visible con sus 14 ilustraciones.
- [ ] **Step 4: Commit** — `docs: reconciliar CLAUDE.md con el campo grupo de modificadores`

---

## Notas para el ejecutor

- El controller provee `SUPABASE_ACCESS_TOKEN` en cada dispatch que toque cloud; nunca commitearlo ni imprimirlo.
- Credenciales de prueba: las provee el controller en cada dispatch; no se escriben en documentos versionados.
- Los tests existentes (54) deben seguir verdes en todas las tasks.
- Si supabase-js rechaza `bigint` en inserts de `precio_cop`, usar `Number()` (precios COP caben con holgura en Number; el guardarraíl §13.3 aplica a aritmética de montos, que sigue en `lib/money.ts` con bigint).

