# Diseño: Bloque 5 — Toma de pedido (Vendedora)

**Fecha:** 2026-07-12
**Estado:** diseño aprobado verbalmente; pendiente revisión de este documento.
**Alcance:** Roadmap §16 bloque 5. Rama `feature/pedido-bloque-5`, apuntada directo a `main` (lección del incidente de PRs apilados en bloques 3-4: cada bloque nuevo se ramifica de `main`, no de la rama anterior).

---

## 1. Objetivo

La vendedora elige el origen de un pedido (mesa / domicilio / para llevar), arma un carrito desde el menú con modificadores, y lo envía a cocina. Puede seguir agregando ítems a un pedido ya enviado. Al elegir mesa, esta pasa a `ocupada` automáticamente.

## 2. Decisiones tomadas (aprobadas)

| Decisión | Elección | Razón |
|---|---|---|
| Estado de mesa | **Automático**: `libre→ocupada` al crear el pedido | Comportamiento natural de un POS de mesas; evita que se olvide marcarla |
| Clientes de domicilio | **Captura rápida en el pedido**, sin pantalla de CRM | YAGNI — nadie pidió gestión de clientes aún; se reutiliza por teléfono si ya existe |
| Edición tras enviar a cocina | **Permitida, pero solo agregar** — lo ya confirmado (persistido) es de solo lectura desde este flujo; editar/quitar algo ya enviado es un ajuste/anulación de un bloque posterior | Simplicidad: "una vez enviado, está comprometido"; evita lógica de reembolso/inventario prematura |
| Carrito en curso | **zustand** en el cliente, se persiste de un tirón al confirmar | CLAUDE.md §3 nombra zustand explícitamente para "carrito de pedido en curso" |

## 3. Resolución de la ambigüedad de RLS con CLAUDE.md §6.2

El texto actual dice: *"Vendedora: SELECT/INSERT/UPDATE solo sobre pedidos abiertos de su sede, y solo los que ella creó."* Tomado literalmente, esto le impediría escribir en un pedido ya `enviado_cocina` — lo cual contradice la decisión aprobada de "seguir agregando después de enviado".

**Resolución:** la política de vendedora se amplía a: *pedidos de su sede, creados por ella (`vendedora_id = auth.uid()`), mientras `estado NOT IN ('cobrado', 'cerrado', 'anulado')`.* Se documenta como reconciliación de CLAUDE.md §6.2 en la última tarea del plan, mismo patrón usado en los bloques 2-4.

## 4. Modelo de datos (migración nueva)

Tablas exactas de CLAUDE.md §7, con las restricciones ya asumidas por el proyecto (dinero `bigint` centavos, soft delete donde aplique, `sede_id` en todo):

```
canal_pedido enum: mesa | domicilio | llevar
estado_pedido enum: abierto | enviado_cocina | en_preparacion | listo | entregado | cobrado | cerrado | anulado
estado_item_pedido enum: pendiente | en_preparacion | listo | entregado

clientes_domicilio (id uuid pk, sede_id fk, nombre text, telefono text, direccion text,
                     referencia text, notas text, creado_en timestamptz)
  -- unique (sede_id, telefono) para poder "reutilizar por teléfono"

pedidos (id uuid pk, sede_id fk, numero_corto int, canal canal_pedido,
         mesa_id uuid fk mesas nullable, cliente_id uuid fk clientes_domicilio nullable,
         vendedora_id uuid fk usuarios, estado estado_pedido default 'abierto',
         subtotal_cop bigint default 0, descuento_cop bigint default 0,
         propina_cop bigint default 0, total_cop bigint default 0,
         notas text, creado_en timestamptz, cerrado_en timestamptz nullable)

pedido_items (id uuid pk, pedido_id fk, producto_id fk productos,
              cantidad int check > 0, precio_unit_cop bigint, subtotal_cop bigint,
              notas text, estado_item estado_item_pedido default 'pendiente',
              tiempo_listo_en timestamptz nullable)

pedido_item_mods (id uuid pk, pedido_item_id fk, modificador_id fk modificadores,
                   precio_delta_cop bigint)
```

**`numero_corto`:** entero secuencial **por sede, reiniciado cada día** (convención habitual de POS: "el pedido #1 de hoy"). Se calcula en la Server Action de creación: `max(numero_corto) + 1` entre los pedidos de la sede creados hoy (zona `America/Bogota`, vía `lib/dates.ts`), no con un trigger — más simple de razonar y suficiente al volumen de un solo local.

**Totales:** `subtotal_cop` = suma de `pedido_items.subtotal_cop` (que a su vez incluye sus `pedido_item_mods`). `total_cop = subtotal_cop` en este bloque (`descuento_cop`/`propina_cop` quedan en 0; su lógica de aplicación es de un bloque posterior — cobro, §16.7). Todo con los helpers de `lib/money.ts` existentes.

**RLS — las cuatro políticas de una vez** (aunque cajera/cocina no tengan UI todavía, para que los bloques 6-7 no requieran tocar seguridad):
- **Vendedora:** SELECT/INSERT/UPDATE en `pedidos`/`pedido_items`/`pedido_item_mods` de pedidos que ella creó, de su sede, con `estado NOT IN ('cobrado','cerrado','anulado')` (ver §3). Sin DELETE (nunca se borra un pedido; una anulación es un cambio de estado, bloque 10).
- **Cajera:** SELECT en pedidos de su sede en estados `listo`/`entregado`/`cobrado` (CLAUDE.md §6.2, sin cambios).
- **Cocina:** SELECT en pedidos `enviado_cocina`/`en_preparacion`/`listo`; UPDATE solo de `pedido_items.estado_item` (CLAUDE.md §6.2, sin cambios).
- **Admin:** acceso total de su sede (patrón ya usado en categorías/productos/mesas).
- `clientes_domicilio`: SELECT/INSERT para vendedora y admin de su sede (necesario para el formulario de domicilio); sin política de UPDATE/DELETE en este bloque (edición de cliente es CRM, fuera de alcance).

**Realtime:** `pedidos` y `pedido_items` se agregan a la publicación `supabase_realtime` (necesario para el bloque 6/KDS; no tiene costo agregarlo ahora aunque este bloque no lo consuma todavía).

## 5. Componentes y flujo

### `/inicio` — selector de origen (Server Component + 3 client widgets)

- **Mesa:** `GrillaMesas` gana un modo nuevo `modo?: "gestion" | "seleccion"` (default `"gestion"`, retrocompatible con el bloque 4). En `"seleccion"`: todo tile es clickeable vía un nuevo prop `onSeleccionarMesa(mesa)`, en vez de abrir `EditorMesa`; solo mesas con `estado === "libre"` y `activa` son seleccionables (las demás se ven pero no reaccionan, para no permitir pedidos duplicados sobre una mesa ocupada). Al seleccionar, se llama la Server Action `crearPedidoMesa(mesaId)`.
- **Domicilio:** `ClayModal` con `react-hook-form` + `zodResolver(clienteDomicilioSchema)` (nombre, teléfono, dirección, referencia opcional). Al confirmar, `crearPedidoDomicilio(clienteInput)`.
- **Para llevar:** botón directo, `crearPedidoLlevar()`.

Las tres Server Actions devuelven `Result<{ pedidoId: string }, DomainError>`; en éxito, el cliente navega a `/pedido/[pedidoId]`.

### `/pedido/[id]` — editor de pedido

- **Server Component** (`page.tsx`): carga el pedido (verifica que sea de la vendedora actual — si no, `notFound()`), sus ítems ya persistidos con nombre/estado, y el menú completo (categorías + productos activos + modificadores). Pasa todo como props serializables a un client component orquestador.
- **Store zustand** (`lib/pedido/carritoStore.ts`): ítems en curso `{ productoId, nombre, cantidad, precioUnitCop, modificadoresSeleccionados[], nota }`, con acciones `agregar/quitar/cambiarCantidad/vaciar`. Alcance del store: solo el carrito **no confirmado**; se vacía tras cada envío exitoso.
- **`SelectorMenu`** (client): navegación por categorías (tabs, como `BarraCategorias` del bloque 3 pero de solo lectura) + grilla de productos (`MesaTile`-like pero para producto: imagen, nombre, precio). Clic en un producto con modificadores obligatorios abre un `ClayModal` de selección; sin modificadores obligatorios, se agrega directo con cantidad 1 (ajustable después en el carrito).
- **`CarritoPedido`** (client): lista de ítems en curso (del store) con controles +/-/quitar/nota, más la lista de ítems **ya confirmados** (solo lectura, con `ClayBadge` de su `estado_item`). Total en vivo con `formatearCOP`.
- **Botón de confirmación:** texto y Server Action dependen del estado del pedido — `"Enviar a cocina"` → `enviarPedidoInicial(pedidoId, items)` (inserta ítems + `pedidos.estado: abierto→enviado_cocina`) si el pedido sigue `abierto`; `"Agregar a la comanda"` → `agregarItemsPedido(pedidoId, items)` (solo inserta ítems, no toca `pedidos.estado`) si ya pasó de `abierto`. Ambas recalculan y persisten los totales del pedido.

## 6. Server Actions (`app/(vendedora)/pedido/actions.ts`, `app/(vendedora)/inicio/actions.ts`)

Mismo patrón `Result<T, DomainError>` ya establecido (bloques 3-4): `exigirVendedora()` (equivalente a `exigirAdmin`, valida `rol==='vendedora'` desde `app_metadata`) → Zod al borde → DB → `revalidatePath`/`redirect` → nunca `throw`.

- `crearPedidoMesa(mesaId: string): Result<{ pedidoId }>` — valida mesa libre y activa de su sede (falla con mensaje claro si no lo es — condición de carrera con otra vendedora), inserta `pedidos` y actualiza `mesas.estado='ocupada'` en una transacción (función SQL `crear_pedido_mesa` o dos llamadas con manejo de fallo parcial — se decide en el plan).
- `crearPedidoDomicilio(input: ClienteDomicilioInput): Result<{ pedidoId }>` — upsert de `clientes_domicilio` por `(sede_id, telefono)`, luego inserta `pedidos`.
- `crearPedidoLlevar(): Result<{ pedidoId }>`.
- `enviarPedidoInicial(pedidoId, items: ItemCarrito[]): Result<null>`.
- `agregarItemsPedido(pedidoId, items: ItemCarrito[]): Result<null>`.

`lib/validations/pedido.ts` (TDD): `clienteDomicilioSchema`, `itemCarritoSchema` (productoId uuid, cantidad entero 1-50, modificadores[], nota opcional).

## 7. Testing (TDD)

- Zod de pedido/cliente: casos válidos e inválidos con mensajes en español.
- `numero_corto`: función pura que calcule el siguiente número dado un arreglo de números existentes "de hoy" (aislado de la fecha real para poder testear).
- Cálculo de totales: función pura `calcularTotalesPedido(items)` en `lib/pedido/` — suma de subtotales de ítems (cada uno ya incluyendo sus modificadores), con `bigint`.
- RLS verificada contra cloud: vendedora no puede leer/escribir pedidos de otra vendedora ni de otra sede; no puede escribir uno `cobrado`.
- E2E completo (flujo mesa→pedido→enviar) se difiere al bloque 11, pero se hace una verificación manual en vivo con sesión real antes de cerrar el bloque, como en los bloques 3-4.

## 8. Criterios de éxito

1. `pnpm lint && pnpm test && pnpm build` verdes.
2. Migración aplicada en deliarepas; tipos regenerados.
3. Vendedora en `/inicio`: elige mesa libre → mesa pasa a `ocupada`, pedido creado; elige domicilio → cliente capturado/reutilizado, pedido creado; elige llevar → pedido creado.
4. En `/pedido/[id]`: arma carrito con modificadores, total correcto, "Enviar a cocina" persiste ítems y cambia estado; reabrir el pedido permite agregar más con "Agregar a la comanda" sin tocar lo ya enviado.
5. Un rol no vendedora (o vendedora de otro pedido) no puede escribir sobre el pedido ajeno (RLS verificada).
6. `/pedido/[id]` audita bien contra la checklist UX del rol vendedora (§8.4: targets ≥48px, tipografía 16px+).

## 9. Fuera de alcance

KDS/cocina (bloque 6); cobro, pagos, cierre de pedido (bloque 7); descuentos y propina (columnas existen, sin lógica); edición/anulación de ítems ya confirmados; transferencia de mesa; CRM de clientes de domicilio; reservas de mesa (ya fuera de alcance desde el bloque 4).
