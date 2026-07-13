# Bloque B — Cancelar pedido de mesa: Diseño

## Contexto

Segunda de tres piezas relacionadas al flujo de pedidos (Bloque A: creación diferida, ya en `main`; Bloque B: este documento; Bloque C: listado de domicilio/llevar para Vendedora y Cajera, pendiente). El usuario pidió: "Permite anular el pedido de una mesa, en caso tal que el cliente no quiera ningún producto y decida retirarse y automáticamente la mesa cambie de estado a libre."

Gracias al Bloque A, un pedido nunca existe en base de datos con cero ítems — se crea solo al confirmar el primer producto. Por lo tanto, "cancelar" aquí siempre actúa sobre un pedido con ≥1 ítem ya confirmado, en algún estado no terminal (`enviado_cocina`, `en_preparacion`, `listo` o `entregado`; `abierto` rara vez persiste).

## Decisiones de negocio (confirmadas con el usuario)

1. **Nuevo estado `cancelado`, distinto de `anulado`.** El RPC `anular_pedido` (Bloque 8) y la tabla `anulaciones` son exclusivos para la reversión admin de pedidos ya cobrados (CLAUDE.md §2.2). La cancelación de este bloque es una acción distinta — vendedora, pre-cobro — y reusar `anulado` rompería el invariante "todo pedido anulado tiene fila en `anulaciones`" que alimenta el reporte "Anulaciones y motivos" (Bloque 9c). Un pedido `cancelado` queda igualmente auditado vía el trigger genérico ya adjunto a `pedidos` (Bloque 8), sin pasar por `anulaciones`.
2. **Permitido en cualquier estado antes de `cobrado`.** `enviado_cocina`, `en_preparacion`, `listo` o `entregado` — la vendedora decide, sin restricción adicional por avance de cocina.
3. **Motivo obligatorio, mínimo 5 caracteres**, mismo patrón que `motivoAnulacionSchema` (Bloque 8), guardado en una columna nueva `pedidos.motivo_cancelacion` (no una tabla nueva — más liviano, y ya se audita vía el trigger existente).

## Arquitectura

### Modelo de datos y RLS

- Migración 1: agrega `cancelado` al enum `estado_pedido` (en su propia transacción — Postgres no permite usar un valor de enum recién creado en la misma transacción que lo agrega).
- Migración 2 (siguiente, ya puede usar el valor):
  - Agrega columna `pedidos.motivo_cancelacion text` (nullable).
  - Reemplaza `pedidos_vendedora_update`: el `USING` excluye `cancelado` junto a `cobrado`/`cerrado`/`anulado` (estados terminales, sin más updates de vendedora); el `WITH CHECK` agrega `cancelado` como estado de aterrizaje válido.
  - Reemplaza `mesas_vendedora_update_estado`: agrega la dirección `ocupada → libre` (hoy solo permite `libre → ocupada`), simétrico a como `mesas_cajera_update_estado` ya permite `ocupada → libre` para el cobro.
  - Nuevo RPC `cancelar_pedido` (ver abajo).

### RPC `cancelar_pedido`

```sql
create or replace function public.cancelar_pedido(
  p_pedido_id uuid,
  p_motivo text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_estado public.estado_pedido;
  v_canal public.canal_pedido;
  v_mesa_id uuid;
begin
  if length(trim(p_motivo)) < 5 then
    raise exception 'Escribe un motivo de al menos 5 caracteres';
  end if;

  select estado, canal, mesa_id into v_estado, v_canal, v_mesa_id
  from public.pedidos
  where id = p_pedido_id
  for update;

  if v_estado is null then
    raise exception 'Pedido no encontrado o sin permiso';
  end if;

  if v_estado in ('cobrado', 'cerrado', 'anulado', 'cancelado') then
    raise exception 'Este pedido ya no se puede cancelar';
  end if;

  update public.pedidos
  set estado = 'cancelado', motivo_cancelacion = p_motivo
  where id = p_pedido_id;

  if v_canal = 'mesa' then
    update public.mesas
    set estado = 'libre'
    where id = v_mesa_id and estado = 'ocupada';
  end if;
end;
$$;

revoke execute on function public.cancelar_pedido(uuid, text) from public, anon;
grant execute on function public.cancelar_pedido(uuid, text) to authenticated;
```

`security invoker` — el `UPDATE` sobre `pedidos` pasa por `pedidos_vendedora_update` (ownership + transición de estado ya validadas ahí); el `UPDATE` sobre `mesas` pasa por `mesas_vendedora_update_estado` ampliada. El `FOR UPDATE` bloquea la fila del pedido contra cobros/cancelaciones concurrentes, mismo patrón que `cobrar_pedido`. Diseño genérico por canal (el `if v_canal = 'mesa'` es la única rama condicional) para que Bloque C reutilice el mismo RPC sin cambios.

### Server Action

`cancelarPedido(pedidoId: string, motivo: string)` en `app/(vendedora)/pedido/actions.ts`, junto a `confirmarItemsPedido`/`crearPedidoConItems`:
1. `exigirVendedora()`.
2. Valida `motivo` con un nuevo `motivoCancelacionSchema` (Zod, mismo shape que `motivoAnulacionSchema` del Bloque 8, duplicado como entidad propia por ser conceptualmente distinto).
3. Llama `supabase.rpc('cancelar_pedido', { p_pedido_id: pedidoId, p_motivo: motivo })`.
4. Traduce el error de Postgres a `DomainError` (mismo patrón ya usado para otros RPCs en este archivo).
5. En éxito, devuelve `ok(undefined)`.

### UI

- Nuevo botón "Cancelar pedido" en `CarritoPedido.tsx` (el carrito de un pedido ya existente en `/pedido/[pedidoId]`; `CarritoNuevo.tsx`, el del borrador sin fila en BD, no lo necesita — ahí "cancelar" es simplemente no confirmar ítems).
- Clic abre un `ClayModal` con un campo de texto para el motivo, validado con `motivoCancelacionSchema` vía `react-hook-form` + `zodResolver` (mismo patrón que `FormularioDomicilio`).
- Confirmar llama a `cancelarPedido(pedido.id, motivo)`; en éxito, `router.push('/inicio')` (la mesa aparece libre ahí vía Realtime, sin acción adicional).
- Si falla (ej. otra persona ya cobró el pedido justo antes), muestra el error en el modal sin navegar.

## Testing

Sin funciones puras nuevas de peso — la lógica vive en el RPC (SQL) y en la validación Zod ya patronizada. Verificación en vivo con usuario vendedora de prueba temporal:
- Cancelar un pedido de mesa en `enviado_cocina` con ítems ya confirmados → pedido pasa a `cancelado`, mesa pasa a `libre`, `motivo_cancelacion` guardado.
- Intentar cancelar sin motivo o con motivo <5 caracteres → rechazado (client-side y server-side).
- Intentar cancelar un pedido ya `cobrado` → rechazado con mensaje claro, sin tocar la mesa.
- Confirmar que un pedido `cancelado` no vuelve a aparecer en `/pedido/[pedidoId]` como editable (RLS lo excluye de `pedidos_vendedora_update`).
- Confirmar que el KDS deja de mostrar el pedido cancelado (ya se filtra por estado `enviado_cocina`/`en_preparacion`/`listo`, sin cambios de código necesarios).

## Fuera de alcance

- Listado de pedidos de domicilio/llevar para Vendedora y Cajera, incluyendo su propio botón de cancelar reutilizando este mismo RPC — Bloque C.
- Cualquier notificación adicional a Cocina más allá de que el pedido desaparezca del KDS.
