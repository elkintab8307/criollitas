# Bloque C — Listado de domicilio/llevar para Vendedora y Cajera: Diseño

## Contexto

Última de las tres piezas relacionadas al flujo de pedidos (Bloque A: creación diferida, ya en `main`; Bloque B: cancelar pedido de mesa, ya en `main`). El usuario pidió: "Tambien permite que la vendedora y la cajera, tengan acceso al listado de pedidos para domicilio o para llevar, con el fin de agregar mas productos o cancelarlos en caso que el cliente lo solicite."

Gracias a los bloques anteriores, la mecánica de fondo ya existe: `crearPedidoConItems`/`confirmarItemsPedido` (Bloque A) agregan productos a un pedido existente sin importar el canal, y `cancelar_pedido` (RPC, Bloque B) ya es genérico por canal. Lo que falta es el **listado** para llegar a esos pedidos — hoy la vendedora solo navega mesa por mesa, y la cajera no tiene ninguna vista de pedidos en curso (solo la cola de cobro, que solo muestra `listo`/`entregado`).

## Decisiones de negocio (confirmadas con el usuario)

1. **Alcance de la cajera**: puede **ver y cancelar**, pero **no agregar productos** — consistente con CLAUDE.md §2.1 ("Cajera no puede: tomar pedidos"), que ya excluye armar/editar el contenido de un pedido. Agregar productos sigue siendo exclusivo de la vendedora.
2. **Visibilidad de la cajera**: cualquier estado no terminal (`abierto`, `enviado_cocina`, `en_preparacion`, `listo`, `entregado`) — coherente con que puede cancelar en cualquiera de esos momentos, igual que la vendedora (Bloque B).
3. **Alcance de la vendedora**: su listado muestra **solo sus propios** pedidos de domicilio/llevar (no los de toda la sede) — consistente con la RLS de vendedora ya existente, que siempre filtra por `vendedora_id = auth.uid()`. La cajera cubre la visibilidad "de toda la sede" como respaldo.

## Arquitectura

### RLS y hallazgo técnico

- `pedidos_cajera_select` se amplía: hoy solo permite `listo`/`entregado`/`cobrado`; se agregan `abierto`/`enviado_cocina`/`en_preparacion`/`cancelado`.
- Nueva policy `pedidos_cajera_cancelar` (UPDATE): `USING estado not in ('cobrado','cerrado','anulado','cancelado')`, `WITH CHECK estado = 'cancelado'` — paralela a la policy `pedidos_cajera_update` ya existente (que solo permite la transición hacia `cobrado`).
- **Hallazgo al revisar el código existente**: el trigger `pedidos_cajera_solo_estado()` (Bloque 7, `supabase/migrations/20260714100000_turnos_cobro_base.sql:212-226`) rechaza cualquier UPDATE de la cajera que toque una columna distinta de `estado`. El RPC `cancelar_pedido` escribe `estado` **y** `motivo_cancelacion` en la misma sentencia — sin ajustar el trigger, la cajera no podría cancelar. Se reemplaza el trigger para permitir también `motivo_cancelacion` cuando el rol es cajera (mismo patrón defensivo de antes, ahora con dos columnas permitidas en vez de una).
- `cancelar_pedido` (RPC, Bloque B) **no cambia** — ya es `security invoker` y genérico; simplemente empieza a funcionar también para cajera gracias a las policies de arriba.

### Server Actions

- Nuevo archivo `app/(cajera)/pedidos-en-curso/actions.ts`: `exigirCajera()` (mismo patrón ya usado en `app/(cajera)/cobrar/actions.ts`) + `cancelarPedidoCajera(pedidoId, input)` — mismo cuerpo que `cancelarPedido` del Bloque B (valida con `motivoCancelacionSchema`, llama al RPC `cancelar_pedido`), pero gateado por `exigirCajera()` en vez de `exigirVendedora()`. No se reutiliza la función del Bloque B literalmente: vive en `app/(vendedora)/pedido/actions.ts` con su propio `exigirVendedora()` hardcodeado, y el proyecto ya tiene como convención establecida no compartir helpers `exigirX` entre archivos de distintos grupos de rutas.
- `app/(vendedora)/pedidos/page.tsx` (RSC, nueva): `select` sobre `pedidos` filtrando `vendedora_id = auth.uid()` (explícito en la query, no solo confiado a RLS), `canal in ('domicilio','llevar')`, `estado not in ('cobrado','cerrado','anulado','cancelado')`.
- `app/(cajera)/pedidos-en-curso/page.tsx` (RSC, nueva): mismo filtro de canal y estado no terminal, sin filtro de `vendedora_id`.
- Ambas resuelven `mesa_id`/`cliente_id` a texto legible con el mismo patrón de dos queries auxiliares + `Map` que ya usa `app/(cajera)/pedidos/page.tsx`.

### UI y navegación

- `components/pedido/ListadoPedidosEnCurso.tsx` (nuevo, compartido): lista de tarjetas con número corto, badge de canal (Domicilio/Llevar), cliente o "Para llevar", badge de estado, total. Prop `variante: "vendedora" | "cajera"`: en `"vendedora"` cada fila tiene un link "Ver/editar" a `/pedido/[pedidoId]`; en `"cajera"` no (la cajera no entra al editor, solo ve y cancela). Ambas variantes muestran el botón "Cancelar".
- `components/pedido/ModalCancelarPedido.tsx` (nuevo, extraído de `CarritoPedido.tsx`): el modal+formulario de motivo que hoy vive inline en `CarritoPedido` se convierte en un componente propio con props `{pedido: {id, numeroCorto, canal}, abierto, onCerrar, onCancelar: (pedidoId, motivo) => Promise<Result<null, DomainError>>, onExito: () => void}` — evita duplicar el formulario+validación en tres lugares (`CarritoPedido`, listado vendedora, listado cajera). `CarritoPedido.tsx` se refactoriza para consumirlo en vez de tener el modal inline (mismo comportamiento visible, sin cambios funcionales para el usuario).
- Navegación: se agrega un link "Pedidos de domicilio/llevar" en el header de `app/(vendedora)/inicio` (o en `app/(vendedora)/layout.tsx`, junto al link "Ventas" ya existente del fix de mesa). Se agrega navegación equivalente en `app/(cajera)/layout.tsx` (hoy es solo un `<span>` estático "Caja"; pasa a incluir un link "Pedidos en curso"), sin tocar el link/página existente de "Pedidos por cobrar".
- Sin Realtime nuevo: ambas páginas son RSC, igual que el resto del proyecto (CLAUDE.md §11 reserva Realtime a Client Components montados en layout). Tras cancelar, `router.refresh()` recarga la lista — mismo patrón ya usado en `CarritoPedido`.

## Testing

Sin funciones puras nuevas de peso (la validación de motivo ya existe y se reutiliza). Verificación en vivo con usuarios de prueba temporales (vendedora + cajera), cubriendo:
- La cajera ve un pedido de domicilio en estado `abierto` (recién creado, sin ítems enviados aún) en su listado — confirma la ampliación de `pedidos_cajera_select`.
- La cajera cancela ese pedido — confirma que el trigger ampliado no bloquea la escritura de `motivo_cancelacion`, y que la policy `pedidos_cajera_cancelar` permite la transición.
- La vendedora ve solo sus propios pedidos de domicilio/llevar en su listado, no los de otra vendedora.
- La cajera NO puede llamar `confirmarItemsPedido`/`crearPedidoConItems` (siguen gateados por `exigirVendedora()`) — confirma que "ver y cancelar, no agregar" se sostiene también a nivel de Server Action, no solo de UI.
- Limpieza de todos los datos de prueba al finalizar, sin tocar pedidos/mesas reales.

## Fuera de alcance

- La cajera agregando productos a un pedido — decisión explícita del usuario de excluirlo (§1 de decisiones).
- El listado de la vendedora mostrando pedidos de otras vendedoras — decisión explícita del usuario (§3 de decisiones).
- Cualquier cambio al flujo de mesa (ya cubierto por el Bloque B) o a la cola de cobro existente (`app/(cajera)/pedidos/page.tsx`, que sigue intacta).
