# Bloque E — La Cajera toma pedidos igual que la Vendedora: Diseño

## Contexto

Segundo de tres cambios relacionados (orden confirmado): Bloque D (ocultar cocina, ya en `main`) → Bloque E (este) → Bloque F (dinero base obligatorio al iniciar sesión). El usuario dijo textualmente: "Quiero que la cajera tambien tenga las mismas funciones de la vendedora, con el fin de ser apoyo en los pedidos."

## Decisiones de negocio (confirmadas con el usuario)

1. **Alcance por canal**: los 3 canales por igual (mesa, domicilio, llevar) — paridad completa con la vendedora, no solo domicilio/llevar.

## Arquitectura

### RLS: ampliar predicados existentes, no duplicar

La cajera necesita exactamente el mismo permiso que la vendedora (no una variante), así que se amplía el predicado de rol en las policies ya existentes en vez de duplicarlas:

- `pedidos_vendedora_select`, `pedidos_vendedora_insert`, `pedidos_vendedora_update`, `pedido_items_vendedora_delete`, `pedido_item_mods_vendedora_delete`: `current_rol() = 'vendedora'` → `current_rol() in ('vendedora', 'cajera')`. El resto de cada predicado (ownership vía `vendedora_id = auth.uid()`, `sede_id`, transiciones de estado permitidas) no cambia.
- **Simplificación de mesas**: `mesas_vendedora_update_estado` (libre↔ocupada, hoy solo vendedora) y `mesas_cajera_update_estado` (hoy solo ocupada→libre, para el cobro) se consolidan en una sola policy bidireccional para ambos roles (`current_rol() in ('vendedora', 'cajera')`, libre↔ocupada) — se elimina la policy de cajera, que queda redundante.
- Sin cambios a las policies de **cocina** ni a `pedidos_cajera_cancelar` (Bloque C, ya cubre cualquier pedido de la sede sin importar quién lo creó).

### Server Actions y rutas

- Los 3 chequeos explícitos de rol en el código pasan a aceptar ambos roles: `app/(vendedora)/inicio/actions.ts:24`, `app/(vendedora)/pedido/actions.ts:23`, `app/(vendedora)/mis-pedidos/page.tsx:14`.
- Los dos helpers `exigirVendedora()` (uno por archivo, convención ya establecida de no compartirlos entre archivos) se renombran a `exigirVendedoraOCajera()` para que el nombre siga siendo honesto. El campo interno `vendedoraId` que devuelven no cambia de nombre — sigue significando "dueño del pedido", sin importar el rol; renombrarlo tocaría cada sitio que lo consume para cero cambio de comportamiento.
- Middleware (`lib/auth/roles.ts`, `PREFIJOS_POR_ROL`): `/inicio`, `/pedido`, `/mis-pedidos` amplían `roles` a `["vendedora", "cajera"]`. No se crean rutas ni componentes nuevos — la cajera navega exactamente las mismas páginas que la vendedora, ya agnósticas de rol en su renderizado.
- Nuevo link "Tomar pedido" en `app/(cajera)/layout.tsx` (junto al "Domicilios y para llevar" del Bloque C), apuntando a `/inicio`.
- `/pedido/[pedidoId]/page.tsx` y `/pedido/nuevo/page.tsx` no requieren cambios: no tienen chequeo de rol propio, solo de ownership, que ya funciona para cualquier rol dueño del pedido.

## Testing

Sin funciones puras nuevas — son ampliaciones de predicados RLS y de condicionales de rol ya existentes. Verificación en vivo con una cajera de prueba temporal:
- Toma un pedido de mesa completo (selecciona mesa libre → agrega productos → confirma): la mesa pasa a `ocupada`, el pedido queda en `listo` (Bloque D, `usa_cocina=false`).
- Toma un pedido de domicilio y uno para llevar.
- Ve su propio pedido en `/mis-pedidos` (filtrado por su propio `vendedora_id`); no ve pedidos de una vendedora de prueba distinta.
- Cancela un pedido creado por ella misma y uno creado por una vendedora — ambos ya funcionan vía `pedidos_cajera_cancelar` sin cambios.
- Confirma que la mesa se libera correctamente tanto al cobrar como al cancelar, con la policy de mesas consolidada.

## Fuera de alcance

- Cambios a reportes (ranking de vendedoras/cajeras ya descartado permanentemente, CLAUDE.md §2.7).
- Cualquier distinción visual entre "pedido tomado por vendedora" vs. "por cajera" en el KDS o la cola de cobro.
