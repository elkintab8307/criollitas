-- Bug encontrado en verificacion en vivo del bloque 8: pagos, movimientos_caja
-- y anulaciones no tienen columna sede_id propia (se deriva via turno_id o
-- pedido_id). El trigger original solo leia sede_id directo de la fila, asi
-- que sus filas de auditoria quedaban con sede_id = null -- invisibles para
-- siempre bajo auditoria_admin_select (exige sede_id = current_sede_id(),
-- que nunca es null). Se agrega resolucion de respaldo via turno_id ->
-- turnos_caja.sede_id y pedido_id -> pedidos.sede_id.
create or replace function public.pg_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registro_id uuid;
  v_sede_id uuid;
  v_turno_id uuid;
  v_pedido_id uuid;
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

  if v_sede_id is null then
    begin
      v_turno_id := (coalesce(to_jsonb(new), to_jsonb(old)) ->> 'turno_id')::uuid;
    exception when others then
      v_turno_id := null;
    end;
    if v_turno_id is not null then
      select sede_id into v_sede_id from public.turnos_caja where id = v_turno_id;
    end if;
  end if;

  if v_sede_id is null then
    begin
      v_pedido_id := (coalesce(to_jsonb(new), to_jsonb(old)) ->> 'pedido_id')::uuid;
    exception when others then
      v_pedido_id := null;
    end;
    if v_pedido_id is not null then
      select sede_id into v_sede_id from public.pedidos where id = v_pedido_id;
    end if;
  end if;

  insert into public.auditoria (sede_id, usuario_id, accion, tabla, registro_id, diff_json)
  values (v_sede_id, auth.uid(), TG_OP, TG_TABLE_NAME, v_registro_id, v_diff);

  return coalesce(new, old);
end;
$$;

-- Backfill de las filas ya escritas con sede_id null que si eran resolubles
-- (creadas durante la verificacion en vivo de este mismo bloque, antes del fix).
update public.auditoria a
set sede_id = tc.sede_id
from public.turnos_caja tc
where a.sede_id is null
  and a.tabla = 'movimientos_caja'
  and (a.diff_json -> 'after' ->> 'turno_id')::uuid = tc.id;

update public.auditoria a
set sede_id = tc.sede_id
from public.turnos_caja tc
where a.sede_id is null
  and a.tabla = 'pagos'
  and (a.diff_json -> 'after' ->> 'turno_id')::uuid = tc.id;

update public.auditoria a
set sede_id = p.sede_id
from public.pedidos p
where a.sede_id is null
  and a.tabla = 'anulaciones'
  and (a.diff_json -> 'after' ->> 'pedido_id')::uuid = p.id;
