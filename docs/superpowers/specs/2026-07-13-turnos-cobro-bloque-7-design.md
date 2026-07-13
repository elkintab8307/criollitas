# Bloque 7 — Turnos y Cobro (Cajera): Diseño

## Contexto

Roadmap CLAUDE.md §16, bloque 7 ("Cobro"). Al explorar el proyecto se confirmó una dependencia real de secuencia que el roadmap original no resuelve: el bloque 7 (Cobro) depende de datos que solo existen en el bloque 8 (Turnos) — `pagos.turno_id` no es nulo (§7), y §2.4 exige que el efectivo cobrado sume al turno abierto de la cajera. Ninguna tabla (`turnos_caja`, `movimientos_caja`, `pagos`, `impresiones`) existe todavía en el repo.

**Decisión confirmada con el usuario: se fusionan los bloques 7 y 8 en uno solo.** Este bloque construye el ciclo completo de la Cajera: abrir turno → cobrar pedidos durante el turno → cerrar turno con arqueo. Es el orden real en que una cajera trabaja, y evita construir Cobro sobre una base inexistente.

El rol `cajera` y su alcance de RLS ya están descritos desde el Bloque 2 (CLAUDE.md §2.1, §6.2): SELECT sobre pedidos `listo`/`entregado`/`cobrado` de su sede, INSERT sobre `pagos`/`turnos_caja`/`movimientos_caja`, UPDATE sobre `pedidos` para cambiar a `cobrado` — esta última policy (`pedidos_cajera_update`) está anotada como pendiente desde el Bloque 5 y se crea en este bloque.

Las rutas `/(cajera)/pedidos`, `/(cajera)/cobrar/[pedidoId]`, `/(cajera)/turno/{abrir,movimientos,cerrar}`, `/(cajera)/mi-turno` ya están previstas en la estructura de carpetas de CLAUDE.md §5; hoy `/(cajera)/pedidos` es un placeholder del Bloque 1.

## Decisiones de negocio (confirmadas con el usuario)

1. **Fusión de bloques**: Turnos y Cobro se construyen juntos en este bloque, no en dos bloques separados.
2. **Impresión**: se construye el builder ESC/POS (`lib/escpos/`) y la llamada HTTP real a `PRINT_BRIDGE_URL`, sin crear el servicio print-bridge en sí (repo/proceso aparte, fuera de alcance). Si el bridge no responde — esperado en este entorno de desarrollo, donde el servicio no existe — el pago y el pedido ya quedaron confirmados; solo la impresión queda marcada `impresiones.exito = false` para reintento manual, tal como CLAUDE.md §10.2 ya exige para cuando la impresora está offline.
3. **Cuadre de pago mixto**: la suma de los pagos debe ser **exactamente igual** al total del pedido (`bigint` de centavos, sin margen). Vueltas de efectivo se calculan en la UI antes de confirmar, no se registran como un pago adicional.
4. **Transición a `entregado`**: no existe un paso manual aparte para marcarla. La cola de cobro muestra pedidos en `listo` **o** `entregado` indistintamente (ambos significan "la comida ya salió de cocina"); `cobrarPedido()` transiciona el pedido a `entregado`→`cobrado` en la misma sentencia atómica si todavía estaba en `listo`.

## Modelo de datos

Migración nueva (`supabase/migrations/<fecha>_turnos_cobro_base.sql`):

```sql
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
  tipo text not null, -- 'tirilla_cobro' en este bloque; 'comanda_cocina'/'copia' quedan para uso futuro
  contenido_escpos text not null,
  enviado_en timestamptz,
  exito boolean,
  error text,
  creado_en timestamptz not null default now()
);
```

**Cálculo del arqueo al cerrar** (dentro de la Server Action/RPC de cierre, no confiado al cliente):

```
esperado_cop = efectivo_inicial_cop
             + Σ(pagos.monto_cop where metodo = 'efectivo' and turno_id = este turno)
             - Σ(movimientos_caja.monto_cop where tipo in ('retiro','gasto'))
             + Σ(movimientos_caja.monto_cop where tipo = 'ingreso_extra')
diferencia_cop = efectivo_declarado_cop - esperado_cop
```

**RLS** (mismo patrón de trigger de columnas ya usado en mesas/pedidos-cocina del Bloque 6):
- `turnos_caja`: cajera INSERT/SELECT/UPDATE solo sobre sus propios turnos de su sede; UPDATE restringido a los campos de cierre (`efectivo_declarado_cop`, `esperado_cop`, `diferencia_cop`, `estado`, `cerrado_en`) — nunca puede reabrir un turno ya `cerrado` ni alterar `efectivo_inicial_cop` después de creado. Un trigger bloquea abrir un segundo turno `abierto` para la misma cajera.
- `movimientos_caja`/`pagos`: cajera INSERT/SELECT solo sobre filas ligadas a su propio turno abierto; sin UPDATE ni DELETE (inmutables una vez creados, igual que `pedido_items` no permite corrección directa).
- `pedidos_cajera_update` (nueva, cierra el pendiente del Bloque 5): cajera UPDATE de `pedidos.estado` limitado a la transición `listo`/`entregado` → `cobrado`, con trigger de columnas análogo a `pedidos_cocina_solo_estado` restringiendo la escritura a solo `estado` (y `cerrado_en`, que se fija en el mismo momento).
- `impresiones`: cajera INSERT/SELECT/UPDATE (para el reintento) solo sobre pedidos de su sede.
- Admin: acceso total de lectura sobre las 4 tablas para reportes futuros (Bloque 9).

## Flujo de turno

Rutas (CLAUDE.md §5): `/turno/abrir`, `/turno/movimientos`, `/turno/cerrar`, `/mi-turno`.

- **`abrirTurno(efectivoInicialPesos)`**: valida que la cajera no tenga ya un turno `abierto` en su sede (error claro si sí); inserta la fila.
- **`registrarMovimiento(tipo, concepto, montoPesos)`**: exige turno abierto de la cajera; inserta ligado a `turno_id`.
- **`cerrarTurno(efectivoDeclaradoPesos)`**: RPC atómico que calcula `esperado_cop`/`diferencia_cop` con la fórmula de arriba y pasa el turno a `cerrado` en una sola sentencia (evita la misma clase de carrera que ya se cerró dos veces en bloques anteriores si dos pagos llegan mientras se está cerrando).
- **`/mi-turno`**: vista de solo lectura (RSC) del turno actual — pagos recibidos agrupados por método, movimientos, efectivo esperado en tiempo real (sin Realtime en esta primera versión; se recarga al navegar, consistente con que no es una pantalla que se deje abierta como el KDS).

`cobrarPedido` exige turno abierto de la cajera; si no lo hay, devuelve `Result` de error con mensaje claro (sin redirect forzado).

## Flujo de cobro

Rutas: `/pedidos` (cola), `/cobrar/[pedidoId]`.

- **`/pedidos`**: lista pedidos en `listo`/`entregado` de la sede vía RSC + 2 canales Realtime (mismo patrón que `TableroKDS` del Bloque 6: `pedidos` con filtro por `sede_id`, patch incremental de estado). Cada fila: número corto, origen, total, tiempo transcurrido desde `enviado_cocina_en`.
- **`/cobrar/[pedidoId]`**: RSC con el detalle del pedido (mismo patrón de joins manuales que `/pedido/[pedidoId]` del Bloque 5), más un formulario cliente de pago: agregar N pagos (método + monto en pesos), total restante visible en vivo, botón de confirmar deshabilitado hasta que la suma cuadre exacto.
- **`cobrarPedido(pedidoId, pagos: {metodo, montoPesos, referencia?}[])`** (Server Action → RPC atómico):
  1. Exige rol cajera + turno abierto.
  2. Relee `pedidos.total_cop` desde la base (nunca confía en un total calculado en el cliente — CLAUDE.md §13.2).
  3. Valida `Σ(pagos) === total_cop` exacto.
  4. Inserta las filas de `pagos` con el `turno_id` del turno abierto.
  5. Transiciona `pedidos.estado` a `cobrado` (pasando por `entregado` si aún estaba en `listo`) en la misma sentencia.
  6. Registra la fila de `impresiones` y dispara la llamada al print-bridge (ver siguiente sección) — este paso nunca revierte el cobro si falla.

## Impresión ESC/POS

`lib/escpos/` — builder tipado puro (sin dependencia de Supabase): construye el ticket según CLAUDE.md §10.2 (encabezado con marca/sede, número de pedido, fecha/hora en `America/Bogota` vía `lib/dates.ts`, mesa/origen, ítems con cantidades y precios, subtotales, propina si aplica, total, método(s) de pago, mensaje de cierre) y devuelve los bytes ESC/POS codificados en base64.

Como paso final de `cobrarPedido`, después de que el pago y el cambio de estado del pedido ya se confirmaron (el cobro nunca depende de que la impresora esté disponible, CLAUDE.md §10.2):
1. INSERT en `impresiones` con el contenido generado (CLAUDE.md §13.9 — nunca imprimir sin registrar antes).
2. `POST` a `PRINT_BRIDGE_URL` con `{ printer, escpos_base64 }` y header `X-Bridge-Token`.
3. Si la llamada falla o hace timeout (esperado en este entorno de desarrollo, donde el servicio print-bridge no existe todavía como proceso separado), se marca `impresiones.exito = false` con el error; la vista de cobro muestra un aviso con botón "Reintentar impresión" que reintenta el mismo `POST` sobre la fila ya registrada.

## Testing

- **TDD puro** (`lib/`): fórmula de arqueo (`esperado`/`diferencia`), validación de cuadre exacto de pago mixto, builder ESC/POS (líneas, alineación, corte, casos de pago único vs. mixto).
- **RLS en vivo**: usuario cajera de prueba (mismo patrón que vendedora/cocina de bloques anteriores) — abrir turno, cobrar un pedido de prueba con pago simple y con pago mixto, verificar que `cobrarPedido` sin turno abierto falla con mensaje claro, verificar que la policy `pedidos_cajera_update` + su trigger de columnas no permiten tocar nada del pedido más allá de la transición a `cobrado`, verificar que no se puede abrir un segundo turno mientras hay uno abierto.
- **Server Actions/RPC**: sin test unitario dedicado — mismo precedente de los bloques 4-6 (orquestación sobre Supabase, verificada por lint/test/build + verificación funcional en vivo).

## Fuera de alcance (diferido explícitamente)

- El servicio `print-bridge` en sí (proceso Node.js separado, repo aparte según CLAUDE.md §10.1) — solo se construye el cliente que lo llama.
- Reportes de arqueo históricos, ranking de cajeras, diferencias agregadas — Bloque 9.
- Anulación de pedidos ya cobrados — Bloque 10.
- Realtime en `/mi-turno` — se recarga al navegar en esta primera versión.
