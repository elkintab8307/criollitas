# Bloque A — Pedido solo se crea al agregar el primer producto: Diseño

## Contexto

El usuario reportó que al tocar "Para llevar" se crea un pedido en base de datos inmediatamente, sin ningún producto agregado — y pidió que un pedido solo exista si se le agregan productos. Esta es la primera de tres piezas relacionadas (Bloque A: creación diferida; Bloque B: cancelar pedido de mesa; Bloque C: listado de domicilio/llevar para Vendedora y Cajera), decompuestas en sub-bloques secuenciales por su tamaño, siguiendo el mismo patrón usado para el Bloque 9 (Reportes).

## Decisiones de negocio (confirmadas con el usuario)

1. **Alcance**: el cambio aplica a los **3 canales** (mesa, domicilio, llevar), no solo a "para llevar" — evita mantener dos arquitecturas de creación distintas y resuelve de raíz el problema de filas huérfanas con `numero_corto` desperdiciado que ya existía para mesa (el fix del ciclo de vida de mesa, ya en `main`, dejaba la mesa `libre` con un pedido vacío huérfano si la vendedora se arrepentía).
2. **Reutilización de `confirmarItemsPedido`**: el nuevo flujo de creación no duplica la lógica de precios/validación de ítems — llama internamente a la función ya existente.
3. **Limpieza en caso de fallo**: si la inserción de ítems falla después de crear la fila `pedidos` (ej. un producto se desactivó a mitad de camino), se borra esa fila antes de devolver el error — mantiene el invariante "sin productos, no hay pedido" incluso en el camino de error. Es un `DELETE` real sobre `pedidos`, distinto del soft-delete de productos/categorías (CLAUDE.md §13.8) — aceptable porque la fila nunca tuvo impacto de negocio (cero ítems, nunca visible en KDS/reportes).

## Arquitectura

**Nueva ruta `/pedido/nuevo`** (sin `pedidoId` en la URL; query params `?mesaId=X`, o `?canal=domicilio&clienteId=X`, o `?canal=llevar`). Página "borrador": no hay fila en `pedidos` hasta el primer envío. El carrito vive 100% en zustand (mismo store ya existente, `useCarritoStore`).

**Nuevo Server Action `crearPedidoConItems(origen, input)`** en `app/(vendedora)/pedido/actions.ts` (junto a `confirmarItemsPedido`):
1. `exigirVendedora()`.
2. Valida el origen según su discriminante (`canal`): para `mesa`, la mesa debe existir, estar activa y `libre` (mismo chequeo que tenía `crearPedidoMesa`); para `domicilio`, el `clienteId` debe existir; para `llevar`, sin requisitos.
3. Calcula `numero_corto` y crea la fila `pedidos`.
4. Llama `confirmarItemsPedido(pedido.id, input)` — reutiliza el 100% de su lógica (reprecios server-side, validación de productos/modificadores activos, inserción en bloque, `recalcular_totales_pedido` que ya ocupa la mesa si aplica).
5. Si el paso 4 falla, borra la fila `pedidos` recién creada (`DELETE ... WHERE id = pedido.id`) y devuelve el error original.

**Cambios a las Server Actions existentes** (`app/(vendedora)/inicio/actions.ts`):
- `crearPedidoMesa` se elimina.
- `crearPedidoDomicilio` se simplifica: solo hace el `upsert` de `clientes_domicilio` (lógica ya existente) y devuelve `{ clienteId }` — ya no crea pedido.
- `crearPedidoLlevar` se elimina.
- `entrarPedidoDeMesa` no cambia.

**Componentes nuevos** (junto a los existentes, que quedan intactos para `/pedido/[pedidoId]`):
- `app/(vendedora)/pedido/nuevo/page.tsx` (RSC): lee `searchParams`, trae categorías/productos/modificadores activos (igual que `/pedido/[pedidoId]` hoy), y si hay `mesaId` consulta el número de mesa o si hay `clienteId` el nombre del cliente, solo para el encabezado — sin tocar la tabla `pedidos`.
- `PedidoNuevoEditor` (junto a `PedidoEditor`): mismo layout de dos columnas, reutiliza `SelectorMenu` sin cambios (es stateless respecto al pedido). Su carrito (`CarritoNuevo`, junto a `CarritoPedido`) no tiene sección "ya enviado a cocina" y su único botón es "Enviar a cocina" (sin el caso de reenvíos). Al confirmar, llama `crearPedidoConItems`; si funciona, navega a `/pedido/<nuevoId>` (la página existente, sin cambios); si falla, muestra el error sin abandonar la pantalla.
- `useCarritoStore.asegurarPedido(clave)`: sin cambios de código — su parámetro ya es un `string` genérico usado como "clave de contexto del carrito", así que la página borrador lo llama con una clave sintética (`"nuevo:mesa:<mesaId>"` / `"nuevo:domicilio:<clienteId>"` / `"nuevo:llevar"`) en vez de un `pedido.id` real, preservando la misma protección contra fugas de carrito entre contextos distintos.

**`SelectorOrigen.tsx`**: el clic en mesa libre y el botón "Para llevar" pasan de invocar un Server Action a un `router.push` directo. El formulario de domicilio sigue abriendo el modal; al enviarlo, llama al `crearPedidoDomicilio` simplificado y navega con `clienteId` en la URL.

## Testing

Sin funciones puras nuevas de peso — la validación de origen es un `switch` trivial dentro del Server Action. Verificación en vivo con usuarios de prueba temporales (vendedora + admin), cubriendo los 3 orígenes: confirmar que **no existe fila en `pedidos`** hasta el primer `crearPedidoConItems` exitoso, que el caso "mesa ya no disponible" (ocupada por otra persona entre que la tocó y confirmó) no crea nada, y que un fallo intencional (producto inactivo) no deja fila huérfana.

## Fuera de alcance (bloques siguientes)

- Cancelar un pedido de mesa que ya tiene ítems confirmados/enviados a cocina — Bloque B. (Nota: con este bloque aplicado a mesa, el caso "pedido vacío que cancelar" prácticamente desaparece — si nunca se confirma un ítem, nunca existe fila que cancelar. El Bloque B se reduce a cancelar pedidos que sí llegaron a tener al menos un ítem confirmado.)
- Listado de pedidos de domicilio/llevar para Vendedora y Cajera — Bloque C.
