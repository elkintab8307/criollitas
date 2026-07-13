# Bloque D — Ocultar el flujo de Cocina: Diseño

## Contexto

Primero de tres cambios relacionados que el usuario pidió juntos (orden confirmado): Bloque D (este, ocultar cocina) → Bloque E (la cajera toma pedidos igual que la vendedora) → Bloque F (la cajera declara el dinero base al iniciar sesión cada día). El usuario dijo textualmente: "este establecimiento no quiero que se use el perfil cocina. osea que se toma un pedido e inmediatamente se pasa a la cajera. el modelo de cocina quiero que quede oculto y no eliminado por si en el futuro se necesita implementar".

Bloque D va primero porque el flujo que la cajera usará en el Bloque E para tomar pedidos debe pasar por el mismo camino "sin cocina" que se define aquí.

## Decisiones de negocio (confirmadas con el usuario)

1. **Estado destino**: cuando se confirma el primer ítem de un pedido, si la sede tiene cocina desactivada, el pedido salta directo a `listo` (el estado que la cola de cobro de la Cajera ya filtra) — no pasa visiblemente por `enviado_cocina`/`en_preparacion`.
2. **Alcance de la configuración**: por sede, en base de datos (`sedes.usa_cocina`), no una constante global — el sistema es multi-sede desde el diseño (CLAUDE.md §1); una sede futura que sí use cocina no debe requerir cambio de código.

## Arquitectura

### Modelo de datos

- Nueva columna `sedes.usa_cocina boolean not null default true`.
- Migración de datos: `update sedes set usa_cocina = false where <sede de Armenia>` — la única sede real hoy, la que el usuario pidió configurar sin cocina.

### Mecanismo (sin tocar RPCs, RLS ni rutas de cocina)

`recalcular_totales_pedido` (RPC ya existente, Bloque 5/6/13) ya calcula el estado agregado del pedido a partir de `pedido_items.estado_item`: si todos están en `listo`, el pedido pasa a `listo`; si no, queda en `enviado_cocina`/`en_preparacion`. En vez de modificar ese RPC, `confirmarItemsPedido` (`app/(vendedora)/pedido/actions.ts`, Server Action) consulta `sedes.usa_cocina` de la sede del pedido (una fila, ya accesible por la policy `sedes_select` existente, sin RLS nueva) e inserta los `pedido_items` con `estado_item: 'listo'` en vez del default `'pendiente'` cuando `usa_cocina = false`. El RPC existente hace el resto sin cambios.

Consecuencia: **cero cambios** a `pedidos_cocina_select`, `pedido_items_cocina_update`, la ruta `/kds`, el RPC `actualizar_estado_item_pedido`, ni ningún trigger de cocina. Si en el futuro se reactiva cocina para una sede, basta con `usa_cocina = true` en esa fila — ningún código cambia. Mientras esté desactivada, un usuario `cocina` que entre a `/kds` simplemente no verá pedidos ahí (ninguno se queda en `enviado_cocina`/`en_preparacion`), sin necesidad de bloquear la ruta.

### Textos de UI condicionados por `usa_cocina`

- `CarritoPedido.tsx`: botón "Enviar a cocina" (primer envío) → **"Confirmar pedido"**; encabezado "Ya enviado a cocina" → **"Confirmado"**, cuando `usaCocina=false`.
- `CarritoNuevo.tsx` (Bloque A): mismo cambio en su único botón.
- Las páginas que renderizan estos componentes (`/pedido/[pedidoId]/page.tsx`, `/pedido/nuevo/page.tsx`) consultan `sedes.usa_cocina` y pasan un nuevo prop `usaCocina: boolean` hacia los componentes de carrito.

## Testing

Sin funciones puras nuevas de peso — el único cambio de lógica es condicional (`estado_item: usaCocina ? "pendiente" : "listo"`) dentro de `confirmarItemsPedido`. Verificación en vivo con vendedora de prueba temporal:
- Con `usa_cocina=false` en una sede de prueba: un pedido nuevo con su primer ítem confirmado llega directo a `estado='listo'`, y aparece de inmediato en la cola de cobro de la Cajera (`/pedidos`).
- Con `usa_cocina=true` (sede de control): el comportamiento actual no cambia (regresión) — el pedido pasa por `enviado_cocina` como siempre.
- Limpieza de datos de prueba al finalizar, sin tocar la sede real de Armenia salvo el propio valor `usa_cocina=false` que este bloque establece a propósito.

## Fuera de alcance

- UI de administración para alternar `usa_cocina` desde `/admin/sedes` — se fija por SQL directo, como el resto de configuración de sede en este punto del proyecto.
- Ocultar la opción de rol "cocina" del formulario de creación de usuarios en `/admin/usuarios`.
- El caso borde de alternar `usa_cocina` a mitad de un pedido que ya tiene ítems mezclados en distintos estados — la configuración se asume estática por sede, no cambia en caliente durante la operación de un pedido.
