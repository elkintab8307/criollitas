# Bloque 8 — Auditoría y anulaciones: Diseño

## Contexto

Roadmap CLAUDE.md §16, bloque 10 original ("Auditoría y anulaciones"), adelantado a bloque 8 tras completar Turnos y Cobro (bloque 7, fusión de los bloques 7+8 originales). Se adelanta respecto a Reportes porque el reporte de "Anulaciones y motivos" (§2.7) depende de que la tabla `anulaciones` y su flujo existan primero.

Ninguna tabla de auditoría o anulación existe todavía. Las páginas `/anular` y `/auditoria` están previstas en la estructura de carpetas de CLAUDE.md §5 pero no se han creado.

## Decisiones de negocio (confirmadas con el usuario)

1. **Alcance del trigger de auditoría**: solo tablas financieras/sensibles — `pedidos`, `pagos`, `turnos_caja`, `movimientos_caja`, `anulaciones`, `usuarios`. CLAUDE.md §7 dice "cada tabla operativa" en términos generales, pero instrumentar mesas/productos/categorías/modificadores (que ya tienen soft-delete y cambian con poca frecuencia) queda diferido a cuando haga falta, no a este bloque.
2. **Efecto financiero de anular**: `pagos` queda intacto como registro histórico — nunca se borra ni modifica. El turno donde se cobró (que puede estar ya cerrado, con su arqueo fijo por diseño del Bloque 7) no se recalcula. La anulación es un ajuste contable aparte, visible en el reporte de anulaciones (Bloque 9); cualquier conciliación de la diferencia de caja que genere es manual, no automática.
3. **Punto de entrada de la anulación**: página nueva `/anular` con búsqueda por número corto de pedido, en vez de extender la página de detalle de pedido de la Vendedora (Bloque 5) con una rama de UI para admin.

## Modelo de datos

Migración nueva (`supabase/migrations/<fecha>_auditoria_anulaciones_base.sql`):

```sql
create table public.auditoria (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid references public.sedes (id),
  usuario_id uuid references public.usuarios (id),
  accion text not null,
  tabla text not null,
  registro_id uuid not null,
  diff_json jsonb not null,
  creado_en timestamptz not null default now()
);

create table public.anulaciones (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos (id),
  usuario_id uuid not null references public.usuarios (id),
  motivo text not null,
  creado_en timestamptz not null default now()
);
```

`sede_id` en `auditoria` es nullable porque no todas las tablas instrumentadas tienen una columna `sede_id` directa en todos los casos posibles (aunque las 6 tablas de este bloque sí la tienen o la heredan por relación) — se deja nullable por robustez del trigger genérico, no como decisión de negocio.

## Trigger de auditoría

Función genérica `public.pg_audit_trigger()`, `AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW`, adjunta a las 6 tablas del alcance decidido:

```sql
create or replace function public.pg_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registro_id uuid;
  v_sede_id uuid;
  v_diff jsonb;
begin
  v_registro_id := coalesce(new.id, old.id);
  v_diff := jsonb_build_object(
    'before', case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    'after', case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  begin
    v_sede_id := (coalesce(to_jsonb(new), to_jsonb(old)) ->> 'sede_id')::uuid;
  exception when others then
    v_sede_id := null;
  end;

  insert into public.auditoria (sede_id, usuario_id, accion, tabla, registro_id, diff_json)
  values (v_sede_id, auth.uid(), TG_OP, TG_TABLE_NAME, v_registro_id, v_diff);

  return coalesce(new, old);
end;
$$;
```

`security definer`: el trigger debe poder escribir en `auditoria` sin importar el rol que disparó la operación original (una vendedora insertando un pedido no tiene, ni debe tener, permiso directo de INSERT sobre `auditoria`) — la escritura de auditoría es una consecuencia automática de la operación, no una acción que el usuario pide explícitamente. `auth.uid()` sigue devolviendo el usuario real que disparó la operación (no el dueño de la función), así que `usuario_id` queda correcto.

`v_sede_id` se extrae de forma defensiva (`sede_id` como columna directa) — las 6 tablas de este bloque la tienen todas como columna propia, así que el bloque `exception` es una red de seguridad, no el camino esperado.

`diff_json` guarda `{before, after}` completos en vez de solo los campos que cambiaron — más simple de implementar y de leer después, a costa de algo más de espacio en disco (aceptable para el volumen de un solo restaurante).

## Anulación de pedidos

**RPC atómico** (mismo patrón de lock explícito que los Bloques 5-7):

```sql
create or replace function public.anular_pedido(
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
begin
  select estado into v_estado
  from public.pedidos
  where id = p_pedido_id
  for update;

  if v_estado is null then
    raise exception 'Pedido no encontrado o sin permiso';
  end if;

  if v_estado <> 'cobrado' then
    raise exception 'Solo se pueden anular pedidos ya cobrados';
  end if;

  insert into public.anulaciones (pedido_id, usuario_id, motivo)
  values (p_pedido_id, auth.uid(), p_motivo);

  update public.pedidos
  set estado = 'anulado'
  where id = p_pedido_id;
end;
$$;

revoke execute on function public.anular_pedido(uuid, text) from public;
revoke execute on function public.anular_pedido(uuid, text) from anon;
grant execute on function public.anular_pedido(uuid, text) to authenticated;
```

`security invoker`: el UPDATE de `pedidos.estado` corre con el rol de quien llama, así que la policy `pedidos_admin_all` (ya existente desde el Bloque 3, acceso total del admin a su sede) es la que efectivamente autoriza — sin necesidad de una policy nueva sobre `pedidos`. Un no-admin que intente llamar este RPC falla porque no tiene INSERT sobre `anulaciones` (ver RLS abajo) antes incluso de llegar al UPDATE.

**RLS sobre `anulaciones`**: admin INSERT/SELECT sobre su sede (vía join a `pedidos`); ningún otro rol tiene acceso.

**RLS sobre `auditoria`**: admin SELECT sobre su sede; ningún otro rol tiene acceso (ni siquiera INSERT — las únicas escrituras vienen del trigger `security definer`, nunca de un cliente).

## UI de administrador

- **`/anular`**: campo de búsqueda por número corto de pedido (`numero_corto`). Al encontrar un pedido en `cobrado`, muestra su detalle (ítems, total, método(s) de pago, fecha, turno) con el mismo patrón de joins manuales ya establecido, y un formulario con `motivo` obligatorio (Zod, mínimo 5 caracteres — mismo umbral que `movimientoSchema.concepto` del Bloque 7, evita un motivo de un solo carácter sin ser tan estricto como para frustrar al admin) + confirmación antes de ejecutar `anularPedido`. Un pedido encontrado que no está en `cobrado` se muestra como no anulable, con su estado actual visible, sin exponer el formulario.
- **`/auditoria`**: tabla de solo lectura de los registros más recientes de `auditoria`, con filtros simples (por `tabla`, por rango de fecha vía `lib/dates.ts`). RSC con paginación básica (offset/limit) — sin Realtime, es un log histórico.

Ambas con el guard `rol !== "admin"` server-side, mismo patrón de toda página de admin ya construida.

## Testing

- Sin funciones puras de negocio nuevas de peso en este bloque — la lógica vive en el trigger SQL y el RPC. Cualquier validación de forma (longitud mínima del motivo) se cubre con Zod, sin TDD de función pura aparte.
- Verificación en vivo con el usuario admin de prueba ya existente: confirmar que el trigger escribe filas de auditoría al hacer INSERT/UPDATE en las 6 tablas instrumentadas; confirmar que `anular_pedido` rechaza un pedido que no está en `cobrado`; confirmar que un rol no-admin no puede llamar el RPC ni insertar en `anulaciones`; confirmar que la propia anulación queda auditada (la tabla `anulaciones` también está instrumentada).

## Fuera de alcance (diferido explícitamente)

- Trigger de auditoría en mesas/productos/categorías/modificadores/sedes — se instrumentan si hace falta más adelante.
- Reversión de pagos o recálculo de turnos cerrados al anular — es un ajuste contable manual, no automático.
- Reporte de "Anulaciones y motivos" en sí (agregaciones, exportación) — Bloque 9 (Reportes).
- Reversión de anulaciones (deshacer una anulación) — no está en el alcance descrito por CLAUDE.md §2.2.
