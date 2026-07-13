# Bloque 6 — KDS (Kitchen Display System): Diseño

## Contexto

Roadmap CLAUDE.md §16, bloque 6. El Bloque 5 (Toma de pedido) ya deja pedidos en estado `enviado_cocina` con sus `pedido_items`. Este bloque construye la pantalla que la Cocina usa para ver esos pedidos en tiempo real y marcar el avance de cada ítem, cerrando el ciclo hasta que el pedido queda `listo` para que la Cajera lo cobre (Bloque 7).

El rol `cocina` y su RLS ya existen desde el Bloque 5 (`supabase/migrations/20260712140000_pedidos_base.sql`):
- `pedidos_cocina_select`: solo ve pedidos de su sede con `estado in ('enviado_cocina', 'en_preparacion', 'listo')`.
- `pedido_items_cocina_update`: mismo alcance vía join a `pedidos`; column-level grant restringe la escritura a `estado_item`/`tiempo_listo_en` únicamente (`revoke update ... grant update (estado_item, tiempo_listo_en)`).
- `pedidos`/`pedido_items` ya están en la publicación `supabase_realtime`.

La ruta `/(cocina)/kds` existe hoy como placeholder (`app/(cocina)/kds/page.tsx`) y ya está protegida por middleware para roles `cocina`/`admin` (`lib/auth/roles.ts`).

## Decisiones de negocio (confirmadas con el usuario)

1. **Autenticación**: la Cocina inicia sesión con PIN como cualquier otro rol (ya funciona desde el Bloque 2). El "modo kiosco" con token de sede sin PIN que menciona CLAUDE.md §9 queda diferido a un bloque de endurecimiento/pulido posterior — no bloquea que el KDS funcione hoy.
2. **Transición del estado agregado del pedido**: automática, sin botón manual. Cuando todos los `pedido_items` de un pedido llegan a `listo`, `pedidos.estado` pasa a `listo` solo. Si un ítem se destoca de vuelta a `en_preparacion`, el agregado también retrocede.
3. **Toques por ítem**: dos toques visibles — `pendiente → en_preparacion` y `en_preparacion → listo`. Un tercer toque sobre un ítem `listo` lo regresa a `en_preparacion` (corrección de error). `entregado` a nivel de ítem queda fuera de alcance: CLAUDE.md §2.5 solo describe `en preparación → listo` como los toques de cocina.
4. **Base del semáforo de tiempo**: nueva columna `pedidos.enviado_cocina_en`, fijada la primera vez que el pedido entra a `enviado_cocina`. No se usa `creado_en` porque, con la edición post-envío del Bloque 5, un pedido puede quedar abierto un rato antes de enviarse a cocina — usar `creado_en` daría lecturas de tiempo falsas.

## Modelo de datos

Migración nueva (`supabase/migrations/<fecha>_kds_base.sql`):

```sql
alter table public.pedidos add column enviado_cocina_en timestamptz;
```

Regla de agregación item → pedido (pura, testeada en `lib/kds/estadoAgregado.ts`, y replicada dentro del RPC atómico — ver más abajo):

- Todos los ítems `pendiente` → el pedido se queda en `enviado_cocina` (no retrocede si ya estaba más adelante, pero normalmente no debería estarlo).
- Al menos un ítem en `en_preparacion` o `listo`, pero no todos `listo` → pedido pasa a `en_preparacion`.
- Todos los ítems `listo` → pedido pasa a `listo`.

`enviado_cocina_en` nunca se sobreescribe una vez fijado — incluye el caso de un pedido `entregado` que se "reabre" a `enviado_cocina` por el fix del Bloque 5 (agregar un ítem tardío): el semáforo sigue midiendo desde la primera llegada a cocina, no desde la reapertura. Se documenta como limitación conocida (Minor) en vez de resolverse con más alcance.

## RPC atómico: `actualizar_estado_item_pedido`

```sql
create or replace function public.actualizar_estado_item_pedido(
  p_pedido_item_id uuid,
  p_nuevo_estado public.estado_item_pedido
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pedido_id uuid;
  v_estados public.estado_item_pedido[];
  v_nuevo_agregado public.estado_pedido;
begin
  update public.pedido_items
  set estado_item = p_nuevo_estado,
      tiempo_listo_en = case when p_nuevo_estado = 'listo' then now() else tiempo_listo_en end
  where id = p_pedido_item_id
  returning pedido_id into v_pedido_id;

  if v_pedido_id is null then
    raise exception 'Ítem de pedido no encontrado o sin permiso';
  end if;

  select array_agg(estado_item) into v_estados
  from public.pedido_items
  where pedido_id = v_pedido_id;

  v_nuevo_agregado := case
    when v_estados <@ array['listo']::public.estado_item_pedido[] then 'listo'
    when 'en_preparacion' = any(v_estados) or 'listo' = any(v_estados) then 'en_preparacion'
    else 'enviado_cocina'
  end;

  update public.pedidos
  set estado = v_nuevo_agregado,
      enviado_cocina_en = coalesce(enviado_cocina_en, now())
  where id = v_pedido_id and estado is distinct from v_nuevo_agregado;
end;
$$;

grant execute on function public.actualizar_estado_item_pedido(uuid, public.estado_item_pedido) to authenticated;
```

`security invoker`: el UPDATE de `pedido_items` corre con el JWT de la cocina que llama, así que `pedido_items_cocina_update` sigue aplicando (exige que el pedido esté en un estado no-terminal desde la óptica de cocina). El UPDATE de `pedidos.estado` corre igual como cocina — se necesita confirmar en el plan de implementación que existe (o se agrega) una policy de UPDATE para `cocina` sobre `pedidos.estado` limitada a los 3 valores no-terminales que cocina puede escribir (`enviado_cocina`/`en_preparacion`/`listo`), simétrica a como se hizo con `mesas`/`pedidos` para `vendedora` en el Bloque 5. Sin esa policy, el UPDATE de `pedidos` fallaría silenciosamente (0 filas) bajo RLS real — es exactamente el mismo tipo de gap que se encontró y cerró dos veces en el Bloque 5, así que la tarea de migración debe incluirla desde el principio, no como fix posterior.

## Server Action

```ts
// app/(cocina)/kds/actions.ts
export async function actualizarEstadoItem(
  pedidoItemId: string,
  nuevoEstado: "pendiente" | "en_preparacion" | "listo",
): Promise<Result<null, DomainError>>
```

Gateada por `exigirCocina()` (mismo patrón que `exigirVendedora()`/`exigirAdmin()`): lee `getUser()`, exige `app_metadata.rol === "cocina"`. Valida `pedidoItemId` como UUID y `nuevoEstado` contra el enum permitido (nunca `entregado` desde esta acción — fuera de alcance). Llama al RPC, mapea error a `DomainError`, `revalidatePath` no aplica aquí (el tablero se actualiza vía Realtime, no vía RSC refetch).

## Arquitectura Realtime

- `app/(cocina)/kds/page.tsx` (Server Component): guard de rol vía `getUser()`, fetch inicial de pedidos activos de la sede (`estado in (enviado_cocina, en_preparacion, listo)`) con sus `pedido_items`, `pedido_item_mods`, nombres de producto/modificador, número de mesa o nombre de cliente — mismo patrón de joins manuales ya usado en `/pedido/[pedidoId]/page.tsx` del Bloque 5. Pasa todo tipado a `TableroKDS`.
- `components/kds/TableroKDS.tsx` (Client Component): mantiene el estado de pedidos en memoria (inicializado desde props), se suscribe a dos canales Realtime — `pedidos:sede_<id>` (INSERT/UPDATE de `pedidos`, filtrado por `estado in (...)` en el cliente ya que Realtime no filtra por RLS dinámicamente más allá de lo que la policy ya garantiza) y `pedido_items:sede_<id>` (INSERT/UPDATE de `pedido_items` para pedidos ya en el tablero). Un `pedido_items` INSERT nuevo dispara un fetch puntual de sus `pedido_item_mods` (esa tabla no está en la publicación Realtime) antes de insertarlo en el estado local. Un pedido cuyo `estado` sale del conjunto visible (pasa a `entregado`/`cobrado`/etc.) se remueve de la vista local.
- Cada tarjeta recalcula su color de semáforo cada 30s con un intervalo local, independiente de si llegan eventos Realtime — un pedido sin toques en 10 minutos debe ponerse rojo aunque nadie haya tocado nada.

## Componentes

```
app/(cocina)/kds/
  page.tsx           — Server Component: guard + fetch inicial
  actions.ts          — actualizarEstadoItem(pedidoItemId, nuevoEstado)
components/kds/
  TableroKDS.tsx      — orquestador cliente: canales Realtime, estado local, grid
  TarjetaPedido.tsx   — una tarjeta: número corto, origen, semáforo, lista de ítems
  ItemPedidoKDS.tsx   — un ítem: nombre, cantidad, modificadores, nota, botón de toque
  tipos.ts            — PedidoKDSVista, ItemKDSVista
lib/kds/
  semaforo.ts         — función pura (TDD): (enviadoCocinaEn, ahora) => "verde"|"amarillo"|"rojo"
  estadoAgregado.ts    — función pura (TDD): documenta/prueba la regla de agregación del RPC
supabase/migrations/
  <fecha>_kds_base.sql — enviado_cocina_en + RPC + policy cocina update pedidos.estado
```

## Diseño visual

Sigue CLAUDE.md §8.4 (densidad KDS): cuerpo 20-24px, número de pedido 32px, alto contraste sobre fondo chocolate, sin colores decorativos que compitan con el semáforo — el semáforo es el único color con significado semántico en la tarjeta (verde/amarillo/rojo), el resto usa la paleta neutra crema/chocolate ya establecida.

Grid con `auto-fill`/`minmax` (mismo patrón usado en `SelectorMenu` del Bloque 5) para acomodar tarjetas sin scroll en volumen normal (5 mesas + domicilios + llevar concurrentes). En volumen alto puede aparecer scroll vertical como salvedad pragmática frente al "sin scroll" ideal de CLAUDE.md §2.5 — no se sobre-diseña un layout que se ajuste exactamente al viewport disponible; se documenta la salvedad en vez de expandir el alcance.

## Testing

- `lib/kds/semaforo.ts`: TDD puro, casos en cada umbral (< 5min, 5-10min, > 10min, límites exactos).
- `lib/kds/estadoAgregado.ts`: TDD puro, casos: todos pendiente, mezcla con al menos uno en_preparacion, todos listo, lista vacía (pedido sin ítems — no debería ocurrir pero la función debe tener un resultado definido).
- RPC y policy de RLS: verificación en vivo contra Supabase cloud con el usuario de prueba `cocina` (nuevo, mismo patrón que los dos usuarios `vendedora` de prueba creados en el Bloque 5) — confirmar que un toque de ítem por cocina SÍ actualiza `pedidos.estado`, y que un intento de escribir `pedidos.estado` fuera de los 3 valores permitidos falla.
- Server Action y componentes de Realtime: sin test unitario dedicado (orquestación sobre Supabase, mismo precedente de los Bloques 4/5) — verificado vía `pnpm lint && pnpm test && pnpm build` + verificación funcional directa contra cloud.

## Fuera de alcance (diferido explícitamente)

- Modo kiosco de `/kds` sin PIN (CLAUDE.md §9) — bloque de endurecimiento.
- Transición `entregado` a nivel de ítem — no hay toque de KDS que la dispare en este bloque.
- Ajuste de layout para volumen extremo de pedidos concurrentes (más allá del `auto-fill`/`minmax` estándar).
