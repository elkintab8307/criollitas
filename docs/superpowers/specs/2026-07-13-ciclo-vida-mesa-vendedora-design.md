# Ciclo de vida de mesa en el flujo de la Vendedora: Diseño

## Contexto

El usuario reportó dos bugs relacionados en el flujo de mesas de la Vendedora, encontrados en uso real de la app ya desplegada en Vercel:

1. Si la vendedora sale de una mesa ocupada por ella misma (con un pedido abierto) para atender otra, no puede regresar a esa mesa para seguir agregando productos.
2. Una mesa debería pasar a "ocupada" solo cuando se agrega el primer producto al pedido, no en el momento en que se crea el pedido (al tocar la mesa vacía).

Durante la investigación se encontró un tercer problema relacionado, no reportado por el usuario pero que interactúa directamente con los dos anteriores: ningún flujo actual libera una mesa (la vuelve a `libre`) cuando su pedido se cobra — quedaría `ocupada` indefinidamente tras el primer pedido, sin que ninguna vendedora pueda reutilizarla (su RLS ya no ve pedidos `cobrado`) salvo que un admin la libere a mano desde `/mesas`. El usuario confirmó incluir este tercer arreglo en el mismo alcance.

## Decisiones de negocio (confirmadas con el usuario)

1. **Mesa ocupada = tiene al menos un ítem confirmado**, no "tiene un pedido creado". La creación del pedido (al tocar una mesa libre) ya no cambia el estado de la mesa; el primer envío de ítems sí.
2. **Volver a una mesa ocupada propia**: si la mesa que se toca tiene un pedido abierto de la vendedora que hizo clic, la lleva de vuelta a ese pedido en vez de intentar crear uno nuevo (que fallaría).
3. **Liberar la mesa al cobrar**: incluido en este mismo arreglo — al ejecutar `cobrar_pedido`, si el pedido es de canal `mesa`, la mesa vuelve a `libre` en la misma transacción.

## Arquitectura

Tres cambios coordinados, todos reutilizando el patrón RLS ya establecido (política de transición de estado restringida por rol, `security invoker` en los RPCs, actualización idempotente con `where estado = '<estado_previo>'`):

1. **Mesa se ocupa con el primer producto**: se quita el `update` inmediato de `crearPedidoMesa` (Server Action) y se mueve la ocupación al RPC `recalcular_totales_pedido`, que ya corre justo después de insertar los primeros ítems de un pedido — atómico con el resto del recálculo, e idempotente (`where estado = 'libre'`, no-op en envíos posteriores al mismo pedido).
2. **Volver a una mesa ocupada propia**: nuevo Server Action `entrarPedidoDeMesa(mesaId)` que busca, bajo la RLS de la vendedora actual, el pedido abierto de esa mesa que le pertenece. `GrillaMesas` deja de bloquear el clic en mesas `ocupada` en modo `"seleccion"` (solo `reservada` e inactivas siguen bloqueadas); `SelectorOrigen` decide si crea un pedido nuevo o entra al existente según el estado de la mesa al momento del clic.
3. **Liberar la mesa al cobrar**: se agrega una policy RLS simétrica a la de la vendedora pero para cajera (`ocupada → libre`, en vez de `libre → ocupada`), y `cobrar_pedido` libera la mesa en la misma sentencia atómica que marca el pedido `cobrado`.

## Modelo de datos y cambios SQL

Sin cambios de esquema — solo lógica dentro de RPCs y policies ya existentes.

**`recalcular_totales_pedido`** (`create or replace`, mismo cuerpo + ocupación de mesa):

```sql
create or replace function public.recalcular_totales_pedido(p_pedido_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total bigint;
  v_estados public.estado_item_pedido[];
  v_nuevo_agregado public.estado_pedido;
  v_canal public.canal_pedido;
  v_mesa_id uuid;
begin
  select coalesce(sum(subtotal_cop), 0) into v_total
  from public.pedido_items where pedido_id = p_pedido_id;

  select array_agg(estado_item) into v_estados
  from public.pedido_items where pedido_id = p_pedido_id;

  v_nuevo_agregado := case
    when v_estados <@ array['listo']::public.estado_item_pedido[] then 'listo'
    when 'en_preparacion' = any(v_estados) or 'listo' = any(v_estados) then 'en_preparacion'
    else 'enviado_cocina'
  end;

  select canal, mesa_id into v_canal, v_mesa_id from public.pedidos where id = p_pedido_id;

  update public.pedidos
  set subtotal_cop = v_total, total_cop = v_total, estado = v_nuevo_agregado
  where id = p_pedido_id;

  if v_canal = 'mesa' and v_mesa_id is not null then
    update public.mesas set estado = 'ocupada' where id = v_mesa_id and estado = 'libre';
  end if;
end;
$$;
```

**Nueva policy RLS para cajera** (simétrica a `mesas_vendedora_update_estado`, sentido inverso):

```sql
create policy mesas_cajera_update_estado on public.mesas
  for update to authenticated
  using (
    public.current_rol() = 'cajera'
    and sede_id = public.current_sede_id()
    and estado = 'ocupada'
    and activa = true
  )
  with check (
    public.current_rol() = 'cajera'
    and sede_id = public.current_sede_id()
    and estado = 'libre'
  );
```

El trigger `mesas_vendedora_solo_estado()` se renombra a `mesas_solo_estado_operacion()` y se extiende para restringir también a cajera a solo modificar la columna `estado` (mismo criterio ya aplicado a vendedora).

**`cobrar_pedido`** (`create or replace`, mismo cuerpo + liberación de mesa): el `select ... for update` inicial se extiende para capturar también `canal`/`mesa_id`; tras `update public.pedidos set estado = 'cobrado' ...`, se agrega:

```sql
if v_canal = 'mesa' and v_mesa_id is not null then
  update public.mesas set estado = 'libre' where id = v_mesa_id and estado = 'ocupada';
end if;
```

## Cambios TypeScript

**`app/(vendedora)/inicio/actions.ts`**:
- `crearPedidoMesa`: se elimina el bloque que marcaba la mesa `ocupada` tras crear el pedido — la función solo crea el pedido.
- Nuevo `entrarPedidoDeMesa(mesaId: string): Promise<Result<{ pedidoId: string }, DomainError>>`: busca, bajo RLS de la vendedora actual, el pedido más reciente de esa mesa que le pertenece y no está en estado terminal (`cobrado`/`cerrado`/`anulado`). Si no encuentra ninguno, devuelve un error genérico ("Esta mesa está ocupada por otra persona.") — no distingue entre "es de otra vendedora" y "estado desincronizado", para no filtrar información operativa entre vendedoras.

**`components/mesas/GrillaMesas.tsx`**: `alClicMesa` en modo `"seleccion"` permite clic en mesas `libre` **y** `ocupada` (antes solo `libre`); `reservada` e inactivas siguen sin `onClick`.

**`components/pedido/SelectorOrigen.tsx`**: `alSeleccionarMesa` llama `crearPedidoMesa` si `mesa.estado === "libre"`, o `entrarPedidoDeMesa` si `mesa.estado === "ocupada"` — mismo manejo de error y navegación (`router.push('/pedido/'+pedidoId)`) ya existente para ambos casos.

## Testing

Sin funciones puras nuevas: el ciclo de vida de la mesa vive en SQL (RPCs), y el branching de `alSeleccionarMesa` es una decisión trivial de UI sin casos de negocio ocultos — no amerita TDD dedicado, mismo criterio ya aplicado a los demás componentes `Vista*`/`Selector*` del proyecto.

Verificación en vivo end-to-end con sesiones de prueba reales (admin + cajera + dos vendedoras temporales, creadas y limpiadas para esta verificación): crear pedido en mesa → confirmar que la mesa sigue `libre` → agregar un ítem (vía `confirmarItemsPedido`) → confirmar que la mesa pasa a `ocupada` → simular "salir y volver" llamando `entrarPedidoDeMesa` con la misma vendedora → confirmar que devuelve el mismo `pedidoId` → confirmar que una vendedora *distinta* que intenta `entrarPedidoDeMesa` sobre esa misma mesa recibe el error esperado → cobrar el pedido (turno + `cobrar_pedido`) → confirmar que la mesa vuelve a `libre`. Todos los datos de prueba (pedidos, turnos, pagos, usuarios de vendedora temporales) se limpian al finalizar.

## Fuera de alcance

- Cualquier cambio al estado `reservada` de mesas (gestión manual del admin, sin relación con el flujo de pedidos) — no se toca.
- El KDS no depende de `mesas.estado` (usa `pedidos.estado`), así que este cambio no lo afecta y no requiere verificación cruzada.
