# Bloque D — Ocultar el flujo de Cocina Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un pedido llegue directo a la cola de cobro de la Cajera sin pasar por cocina, sin tocar ninguna policy/ruta/RPC de cocina — controlado por una columna `usa_cocina` en `sedes`.

**Architecture:** `confirmarItemsPedido` consulta `sedes.usa_cocina` de la sede del pedido y, si está desactivada, inserta los `pedido_items` ya en `estado_item='listo'` — el RPC `recalcular_totales_pedido` (sin cambios) computa el pedido como `listo` automáticamente. La UI de carrito recibe un booleano `usaCocina` para ajustar el texto de sus botones/encabezados.

**Tech Stack:** Supabase Postgres (una columna nueva, sin RLS nueva), Next.js Server Actions/RSC, React props.

## Global Constraints

- Español de Colombia en todo texto visible (CLAUDE.md §13.11).
- Cero cambios a policies, rutas o RPCs de cocina (`pedidos_cocina_select`, `pedido_items_cocina_update`, `/kds`, `actualizar_estado_item_pedido`) — el modelo de cocina queda intacto, solo oculto por proceso.
- No se toca `recalcular_totales_pedido` — su lógica de agregación existente hace todo el trabajo una vez que los ítems se insertan ya en `listo`.
- `pnpm lint && pnpm test && pnpm build` deben quedar en verde al final de cada tarea. 157 tests en `main` a la fecha de este plan.
- Windows: `git commit -F <tempfile>` en vez de heredocs. Trailer: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- `lib/supabase/types.ts` tiene CRLF+BOM — aplicar el diff a mano, nunca sobreescribir completo.

---

### Task 1: Migración — columna `sedes.usa_cocina`

**Files:**
- Create: `supabase/migrations/20260723100000_sedes_usa_cocina.sql`
- Modify: `lib/supabase/types.ts` (diff quirúrgico)

**Interfaces:**
- Produces: columna `sedes.usa_cocina boolean not null default true`, con la sede de Armenia (`SEDE_DEFAULT_ID = "00000000-0000-4000-8000-000000000001"`, de `lib/auth/roles.ts:16`) en `false` — consumida por la Task 2.

- [ ] **Step 1: Escribir la migración**

```sql
-- Bloque D: el establecimiento no usa el flujo de cocina -- un pedido debe
-- llegar directo a la cola de cobro sin que nadie mueva ítems por el KDS.
-- Se modela como config por sede (no una constante global) porque el
-- sistema es multi-sede desde el diseño (CLAUDE.md §1); una sede futura
-- que sí use cocina no requiere cambio de código, solo esta fila en false.
alter table public.sedes add column usa_cocina boolean not null default true;

-- La sede de Armenia (la única real hoy) es la que el usuario pidió sin
-- cocina.
update public.sedes set usa_cocina = false where id = '00000000-0000-4000-8000-000000000001';
```

- [ ] **Step 2: Aplicar la migración**

Run: `supabase db push` (confirmar `Y`). Debe terminar sin errores.

- [ ] **Step 3: Regenerar tipos y aplicar el diff quirúrgicamente**

```bash
supabase gen types typescript --linked > /tmp/types_nuevo.ts
```

En `lib/supabase/types.ts`, dentro del bloque `sedes` (`Row`/`Insert`/`Update`), agregar `usa_cocina: boolean` (Row), `usa_cocina?: boolean` (Insert), `usa_cocina?: boolean` (Update) — mismo patrón ya usado para `motivo_cancelacion` en el Bloque B. Confirmar con `diff <(tr -d '\r' < /tmp/types_nuevo.ts) <(tr -d '\r' < lib/supabase/types.ts)` que las únicas diferencias restantes son ruido del CLI (mensajes de login/versión), no cambios de esquema sin aplicar.

- [ ] **Step 4: `pnpm build`**

Run: `pnpm build`
Expected: exit 0.

- [ ] **Step 5: Verificar en vivo el valor de la sede real**

```bash
cd /c/PROYECTOS/CRIOLLITAS
set -a; source .env.local; set +a
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/sedes?id=eq.$NEXT_PUBLIC_SEDE_ID&select=id,nombre,usa_cocina" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```
Expected: `usa_cocina: false` para la sede de Armenia.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260723100000_sedes_usa_cocina.sql lib/supabase/types.ts
git commit -F- <<'MSG'
feat: agrega sedes.usa_cocina y desactiva cocina en Armenia

MSG
```

---

### Task 2: `confirmarItemsPedido` — ítems en `listo` cuando la sede no usa cocina

**Files:**
- Modify: `app/(vendedora)/pedido/actions.ts`

**Interfaces:**
- Consumes: `sedes.usa_cocina` (Task 1).
- Produces: sin cambio de firma pública — `confirmarItemsPedido(pedidoId, input): Promise<Result<null, DomainError>>` se comporta igual para llamadores existentes (`crearPedidoConItems`, `CarritoPedido`), solo cambia el `estado_item` inicial de los ítems insertados según la sede.

- [ ] **Step 1: Agregar la consulta de `usa_cocina` y el `estado_item` condicional**

En `app/(vendedora)/pedido/actions.ts`, dentro de `confirmarItemsPedido`, justo después de la validación del pedido (línea con `if (ESTADOS_NO_MODIFICABLES.has(pedido.estado))`) y antes de la consulta de `productoIds`, agregar:

```typescript
  const { data: sedeFila } = await supabase
    .from("sedes")
    .select("usa_cocina")
    .eq("id", ctx.valor.sedeId)
    .maybeSingle();
  const estadoItemInicial = sedeFila?.usa_cocina === false ? "listo" : "pendiente";
```

Luego, en el bloque de inserción de `pedido_items` (el `.insert(filasItems.map((fila) => ({ ... })))`), agregar el campo `estado_item: estadoItemInicial` a cada fila mapeada:

```typescript
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
        estado_item: estadoItemInicial,
      })),
    )
    .select("id");
```

Nota: si la consulta a `sedes` falla o no encuentra fila (`sedeFila` es `null`), `estadoItemInicial` cae a `"pendiente"` — mismo comportamiento que hoy (fail-safe hacia el flujo con cocina, nunca hacia el flujo sin cocina por un error silencioso).

- [ ] **Step 2: `pnpm lint && pnpm build`**

Run: `pnpm lint && pnpm build`
Expected: exit 0 en ambos.

- [ ] **Step 3: Commit**

```bash
git add "app/(vendedora)/pedido/actions.ts"
git commit -F- <<'MSG'
feat: confirmarItemsPedido salta cocina cuando la sede no la usa

MSG
```

---

### Task 3: UI — textos condicionados por `usaCocina`

**Files:**
- Modify: `app/(vendedora)/pedido/[pedidoId]/page.tsx`
- Modify: `app/(vendedora)/pedido/nuevo/page.tsx`
- Modify: `components/pedido/PedidoEditor.tsx`
- Modify: `components/pedido/PedidoNuevoEditor.tsx`
- Modify: `components/pedido/CarritoPedido.tsx`
- Modify: `components/pedido/CarritoNuevo.tsx`

**Interfaces:**
- Produces: prop `usaCocina: boolean` fluye `page.tsx` → `PedidoEditor`/`PedidoNuevoEditor` → `CarritoPedido`/`CarritoNuevo`.

- [ ] **Step 1: `app/(vendedora)/pedido/[pedidoId]/page.tsx`**

Agregar la consulta de `usa_cocina` (usando `pedidoFila.sede_id` — hay que agregar `sede_id` al `select` de `pedidos` si no está ya) y pasar el prop. Reemplazar:

```typescript
  const { data: pedidoFila } = await supabase
    .from("pedidos")
    .select("id, numero_corto, canal, estado, subtotal_cop, total_cop, mesa_id, cliente_id, vendedora_id")
    .eq("id", pedidoId)
    .single();
```

por:

```typescript
  const { data: pedidoFila } = await supabase
    .from("pedidos")
    .select("id, numero_corto, canal, estado, subtotal_cop, total_cop, mesa_id, cliente_id, vendedora_id, sede_id")
    .eq("id", pedidoId)
    .single();
```

Después del bloque que resuelve `clienteNombre` (antes de construir `pedido: PedidoVista`), agregar:

```typescript
  const { data: sedeFila } = await supabase
    .from("sedes")
    .select("usa_cocina")
    .eq("id", pedidoFila.sede_id)
    .maybeSingle();
  const usaCocina = sedeFila?.usa_cocina !== false;
```

Y en el JSX, pasar el prop a `PedidoEditor`:

```typescript
        <PedidoEditor
          pedido={pedido}
          itemsConfirmados={itemsConfirmados}
          categorias={(categoriasFilas ?? []) as CategoriaFila[]}
          productos={(productosFilas ?? []) as ProductoFila[]}
          modificadores={(modificadoresFilas ?? []) as ModificadorFila[]}
          usaCocina={usaCocina}
        />
```

- [ ] **Step 2: `app/(vendedora)/pedido/nuevo/page.tsx`**

Después de resolver `origen`/`tituloOrigen` (antes de las consultas de `categoriasFilas`), agregar:

```typescript
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const sedeId = (user?.app_metadata?.sede_id as string | undefined) ?? SEDE_DEFAULT_ID;
  const { data: sedeFila } = await supabase.from("sedes").select("usa_cocina").eq("id", sedeId).maybeSingle();
  const usaCocina = sedeFila?.usa_cocina !== false;
```

Agregar el import correspondiente al inicio del archivo:

```typescript
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";
```

Y en el JSX, pasar el prop a `PedidoNuevoEditor`:

```typescript
        <PedidoNuevoEditor
          origen={origen}
          categorias={(categoriasFilas ?? []) as CategoriaFila[]}
          productos={(productosFilas ?? []) as ProductoFila[]}
          modificadores={(modificadoresFilas ?? []) as ModificadorFila[]}
          usaCocina={usaCocina}
        />
```

- [ ] **Step 3: `components/pedido/PedidoEditor.tsx`**

Agregar `usaCocina: boolean` a `PedidoEditorProps` y reenviarlo a `CarritoPedido`:

```typescript
interface PedidoEditorProps {
  pedido: PedidoVista;
  itemsConfirmados: ItemConfirmadoVista[];
  categorias: CategoriaFila[];
  productos: ProductoFila[];
  modificadores: ModificadorFila[];
  usaCocina: boolean;
}
```

```typescript
export function PedidoEditor({
  pedido,
  itemsConfirmados,
  categorias,
  productos,
  modificadores,
  usaCocina,
}: PedidoEditorProps) {
```

```typescript
      <CarritoPedido
        pedido={pedido}
        itemsConfirmados={itemsConfirmados}
        soloLectura={soloLectura}
        usaCocina={usaCocina}
      />
```

- [ ] **Step 4: `components/pedido/PedidoNuevoEditor.tsx`**

Agregar `usaCocina: boolean` a `PedidoNuevoEditorProps` y reenviarlo a `CarritoNuevo`:

```typescript
interface PedidoNuevoEditorProps {
  origen: OrigenPedido;
  categorias: CategoriaFila[];
  productos: ProductoFila[];
  modificadores: ModificadorFila[];
  usaCocina: boolean;
}
```

```typescript
export function PedidoNuevoEditor({ origen, categorias, productos, modificadores, usaCocina }: PedidoNuevoEditorProps) {
```

```typescript
      <CarritoNuevo origen={origen} usaCocina={usaCocina} />
```

- [ ] **Step 5: `components/pedido/CarritoPedido.tsx`**

Agregar `usaCocina: boolean` a `CarritoPedidoProps` y usarlo para el texto del botón/encabezado:

```typescript
interface CarritoPedidoProps {
  pedido: PedidoVista;
  itemsConfirmados: ItemConfirmadoVista[];
  /** Pedido en estado terminal (cobrado/cerrado/anulado): el carrito en curso
   *  puede tener ítems sin enviar, pero el botón de confirmar queda bloqueado. */
  soloLectura?: boolean;
  usaCocina: boolean;
}
```

```typescript
export function CarritoPedido({ pedido, itemsConfirmados, soloLectura = false, usaCocina }: CarritoPedidoProps) {
```

Reemplazar:

```typescript
  const esPrimerEnvio = pedido.estado === "abierto";
  const textoBoton = esPrimerEnvio ? "Enviar a cocina" : "Agregar a la comanda";
```

por:

```typescript
  const esPrimerEnvio = pedido.estado === "abierto";
  const textoBoton = esPrimerEnvio ? (usaCocina ? "Enviar a cocina" : "Confirmar pedido") : "Agregar a la comanda";
```

Y reemplazar el encabezado "Ya enviado a cocina":

```typescript
          <h3 className="font-display text-sm font-medium text-text-secondary">Ya enviado a cocina</h3>
```

por:

```typescript
          <h3 className="font-display text-sm font-medium text-text-secondary">
            {usaCocina ? "Ya enviado a cocina" : "Confirmado"}
          </h3>
```

- [ ] **Step 6: `components/pedido/CarritoNuevo.tsx`**

Agregar `usaCocina: boolean` a `CarritoNuevoProps` y usarlo para el texto del botón:

```typescript
interface CarritoNuevoProps {
  origen: OrigenPedido;
  usaCocina: boolean;
}
```

```typescript
export function CarritoNuevo({ origen, usaCocina }: CarritoNuevoProps) {
```

Reemplazar:

```typescript
      >
        {enviando ? "Enviando…" : "Enviar a cocina"}
      </ClayButton>
```

por:

```typescript
      >
        {enviando ? "Enviando…" : usaCocina ? "Enviar a cocina" : "Confirmar pedido"}
      </ClayButton>
```

- [ ] **Step 7: `pnpm lint && pnpm test && pnpm build`**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: exit 0 en los tres, 157/157 tests.

- [ ] **Step 8: Commit**

```bash
git add "app/(vendedora)/pedido/[pedidoId]/page.tsx" "app/(vendedora)/pedido/nuevo/page.tsx" components/pedido/PedidoEditor.tsx components/pedido/PedidoNuevoEditor.tsx "components/pedido/CarritoPedido.tsx" components/pedido/CarritoNuevo.tsx
git commit -F- <<'MSG'
feat: textos de carrito se adaptan cuando la sede no usa cocina

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

- [ ] **Step 2: Crear una vendedora de prueba temporal y una mesa libre de prueba**

Mismo mecanismo ya usado en bloques anteriores (usuario en `auth.users` + fila en `public.usuarios` + sesión vía `generate_link`/`verify`). Crear una mesa de prueba temporal (número alto, ej. 98) para no tocar las mesas reales.

- [ ] **Step 3: Confirmar que un pedido nuevo llega directo a `listo` (sede real, `usa_cocina=false`)**

Crear un pedido de mesa con la vendedora de prueba, insertar un ítem, llamar `recalcular_totales_pedido`. Confirmar:
```bash
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/pedidos?id=eq.<pedido_id>&select=estado" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```
Expected: `estado: "listo"` (no `enviado_cocina`).

Confirmar también `pedido_items.estado_item`:
```bash
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/pedido_items?pedido_id=eq.<pedido_id>&select=estado_item" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```
Expected: `estado_item: "listo"`.

- [ ] **Step 4: Confirmar que aparece en la cola de cobro**

```bash
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/pedidos?id=eq.<pedido_id>&select=id&estado=in.(listo,entregado)" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```
Expected: devuelve la fila — mismo filtro que usa `app/(cajera)/pedidos/page.tsx`.

- [ ] **Step 5: Regresión — sede con `usa_cocina=true` sigue igual**

Actualizar temporalmente `usa_cocina=true` en la sede de prueba (vía service role), repetir el flujo de crear pedido + primer ítem, confirmar que el pedido queda en `enviado_cocina` (no `listo`) y que `pedido_items.estado_item` queda en `pendiente` — comportamiento idéntico al de antes de este bloque.

- [ ] **Step 6: Limpieza de datos de prueba**

Borrar pedido, ítems, mesa y usuario de prueba. Confirmar con `select` que no queda ningún residuo y que la sede real de Armenia sigue en `usa_cocina=false`.

- [ ] **Step 7: Actualizar CLAUDE.md**

Reconciliar CLAUDE.md §7 (modelo de datos, agregar `usa_cocina` a la tabla `sedes`) y §2.5 (KDS) con una nota breve indicando que el flujo de cocina puede desactivarse por sede (`sedes.usa_cocina`), en cuyo caso los pedidos llegan a `listo` directamente sin pasar por el KDS.

- [ ] **Step 8: Commit final de documentación**

```bash
git add CLAUDE.md
git commit -F- <<'MSG'
docs: reconcilia CLAUDE.md con sedes.usa_cocina del Bloque D

MSG
```

---

## Self-Review

**Cobertura del spec:** columna `sedes.usa_cocina` + dato real de Armenia en `false` (Task 1), `confirmarItemsPedido` inserta ítems en `listo` sin tocar el RPC de recálculo (Task 2), textos de UI condicionados (Task 3), verificación en vivo del flujo feliz y de regresión con `usa_cocina=true` (Task 4). Cero cambios a RLS/rutas/RPCs de cocina en todo el plan — ninguna task los toca.

**Placeholders:** ninguno.

**Consistencia de tipos:** `usaCocina: boolean` es el mismo nombre y tipo en las 6 interfaces de la Task 3 (páginas y componentes), sin transformación intermedia — un solo booleano fluye de punta a punta.
