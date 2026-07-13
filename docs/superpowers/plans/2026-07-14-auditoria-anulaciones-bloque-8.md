# Bloque 8 (Auditoría y anulaciones) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al Administrador un rastro de auditoría automático sobre las tablas financieras/sensibles y un flujo para anular un pedido ya cobrado con motivo obligatorio.

**Architecture:** Migración con 2 tablas nuevas (`auditoria`, `anulaciones`) + RLS. Trigger genérico `pg_audit_trigger()` (`security definer`, para poder escribir en `auditoria` sin importar qué rol disparó la operación instrumentada) adjunto a 6 tablas existentes. RPC atómico `anular_pedido` (`security invoker`, mismo patrón de lock explícito que los Bloques 5-7) que valida el estado, inserta la anulación y transiciona el pedido en una sola sentencia — sin policy nueva sobre `pedidos`, ya que `pedidos_admin_all` (Bloque 3) ya cubre la transición. Dos páginas de admin: `/anular` (búsqueda + formulario) y `/auditoria` (tabla de solo lectura con filtros), ambas protegidas por el middleware existente (`PREFIJOS_POR_ROL`), sin guard explícito en cada página — mismo patrón que toda página de admin ya construida.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + RLS), TypeScript estricto, Zod, Vitest.

## Global Constraints

- CLAUDE.md §12: Server Components por defecto; `"use client"` solo donde hay interactividad/hooks. Nunca `throw` en dominio — `Result<T, DomainError>`. Texto de usuario en español de Colombia.
- CLAUDE.md §13.2: nunca confiar en el rol que declara el cliente para autorizar — toda autorización vía `getUser()` + RLS.
- CLAUDE.md §7: `auditoria (id, sede_id, usuario_id, accion, tabla, registro_id, diff_json, creado_en)`; `anulaciones (id, pedido_id, usuario_id, motivo, creado_en)`.
- CLAUDE.md §2.2: solo se anula un pedido en estado `cobrado`; exige motivo; queda en auditoría.
- `app_metadata` (nunca `user_metadata`) es la única fuente de rol/sede — patrón establecido desde el Bloque 3.
- Alcance del trigger de auditoría (decisión confirmada): solo `pedidos`, `pagos`, `turnos_caja`, `movimientos_caja`, `anulaciones`, `usuarios` — no todas las tablas operativas.
- Anular no borra ni modifica `pagos`, ni recalcula el turno donde se cobró (decisión confirmada) — es un ajuste contable aparte.
- Todos los tests existentes (141 en `main` a la fecha de este plan) deben seguir verdes en cada tarea.

---

### Task 1: Migración — auditoria, anulaciones, trigger genérico, RPC anular_pedido

**Files:**
- Create: `supabase/migrations/20260715100000_auditoria_anulaciones_base.sql`
- Modify: `lib/supabase/types.ts` (regenerar tras aplicar en cloud)

**Interfaces:**
- Produces: tablas `auditoria`, `anulaciones`; función `public.pg_audit_trigger()` adjunta como trigger a 6 tablas; función `public.anular_pedido(p_pedido_id uuid, p_motivo text) returns void`.

- [ ] **Step 1: Escribir la migración completa**

```sql
-- Bloque 8: auditoría automática sobre tablas financieras/sensibles +
-- flujo de anulación de pedidos ya cobrados. Alcance del trigger acotado
-- a pedidos/pagos/turnos_caja/movimientos_caja/anulaciones/usuarios
-- (decisión confirmada con el usuario) — el resto de tablas operativas
-- (mesas, productos, categorías, modificadores) ya tienen soft-delete y
-- se instrumentan más adelante si hace falta.
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

alter table public.auditoria enable row level security;
alter table public.anulaciones enable row level security;

-- auditoria: nadie inserta directo (solo el trigger, vía security
-- definer, que no pasa por RLS). Admin SELECT sobre su sede.
create policy auditoria_admin_select on public.auditoria
  for select to authenticated
  using (public.current_rol() = 'admin' and sede_id = public.current_sede_id());

-- anulaciones: admin INSERT/SELECT sobre pedidos de su sede.
create policy anulaciones_admin_insert on public.anulaciones
  for insert to authenticated
  with check (exists (
    select 1 from public.pedidos p where p.id = pedido_id
      and public.current_rol() = 'admin' and p.sede_id = public.current_sede_id()
  ));

create policy anulaciones_admin_select on public.anulaciones
  for select to authenticated
  using (exists (
    select 1 from public.pedidos p where p.id = pedido_id
      and public.current_rol() = 'admin' and p.sede_id = public.current_sede_id()
  ));

-- Trigger genérico de auditoría. security definer: debe poder escribir en
-- auditoria sin importar qué rol disparó la operación instrumentada (ej.
-- una vendedora insertando un pedido no tiene, ni debe tener, INSERT
-- directo sobre auditoria — la escritura es consecuencia automática de la
-- operación, no algo que el cliente pide). auth.uid() sigue devolviendo
-- el usuario real que disparó la operación (no el dueño de la función),
-- así que usuario_id queda correcto.
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

create trigger pg_audit_trigger_pedidos
  after insert or update or delete on public.pedidos
  for each row execute function public.pg_audit_trigger();

create trigger pg_audit_trigger_pagos
  after insert or update or delete on public.pagos
  for each row execute function public.pg_audit_trigger();

create trigger pg_audit_trigger_turnos_caja
  after insert or update or delete on public.turnos_caja
  for each row execute function public.pg_audit_trigger();

create trigger pg_audit_trigger_movimientos_caja
  after insert or update or delete on public.movimientos_caja
  for each row execute function public.pg_audit_trigger();

create trigger pg_audit_trigger_anulaciones
  after insert or update or delete on public.anulaciones
  for each row execute function public.pg_audit_trigger();

create trigger pg_audit_trigger_usuarios
  after insert or update or delete on public.usuarios
  for each row execute function public.pg_audit_trigger();

-- anular_pedido: security invoker -- el UPDATE de pedidos.estado corre
-- con el rol de quien llama, así que pedidos_admin_all (Bloque 3, acceso
-- total del admin a su sede) es lo que efectivamente autoriza, sin
-- necesidad de una policy nueva sobre pedidos. Un no-admin falla antes de
-- llegar al UPDATE porque no tiene INSERT sobre anulaciones.
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

- [ ] **Step 2: Aplicar en Supabase cloud**

Run: `supabase db push` (confirmar `Y`). Debe terminar sin errores.

- [ ] **Step 3: Regenerar tipos y aplicar el diff quirúrgicamente**

```bash
supabase gen types typescript --linked > /tmp/types_nuevo.ts
```

Aplicar SOLO los cambios de esta migración (2 tablas nuevas en `Tables`, 1 función nueva en `Functions` — `pg_audit_trigger` es `returns trigger`, no aparece en `Functions` del cliente, igual que los triggers de bloques anteriores) a `lib/supabase/types.ts` a mano — no sobreescribir el archivo completo (precedente CRLF+BOM vs. LF documentado en todos los bloques anteriores).

- [ ] **Step 4: Verificación en vivo con curl (anon no puede llamar anular_pedido)**

```bash
cd /c/PROYECTOS/CRIOLLITAS
set -a; source .env.local; set +a
curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/anular_pedido" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_pedido_id":"00000000-0000-0000-0000-000000000000","p_motivo":"prueba"}'
```

Expected: `401` con `code: "42501"` (mismo patrón de revoke explícito de `anon` aprendido en el Bloque 6/7 — Supabase concede `execute` a `anon` por defecto al crear la función, no confiar solo en `grant ... to authenticated`).

- [ ] **Step 5: Verificar suite completa**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 141/141 tests (esta tarea no agrega tests, solo SQL + tipos).

- [ ] **Step 6: Commit**

Mensaje describiendo las 2 tablas, el trigger genérico y sus 6 adjuntos, el RPC `anular_pedido` (código completo arriba).

---

### Task 2: Validación Zod del motivo de anulación

**Files:**
- Create: `lib/validations/anulacion.ts`

**Interfaces:**
- Produces: `motivoAnulacionSchema`/`MotivoAnulacionInput` — usado por la Server Action (Task 3) y el formulario (Task 5).

- [ ] **Step 1: Implementar `lib/validations/anulacion.ts`**

```typescript
// lib/validations/anulacion.ts
import { z } from "zod";

export const motivoAnulacionSchema = z.object({
  motivo: z
    .string()
    .min(5, "Escribe un motivo de al menos 5 caracteres")
    .max(500, "El motivo es demasiado largo"),
});
export type MotivoAnulacionInput = z.infer<typeof motivoAnulacionSchema>;
```

- [ ] **Step 2: Verificar suite**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 141/141 tests (esquema Zod puro sin lógica propia, mismo precedente de `lib/validations/turno.ts` — sin test unitario dedicado).

- [ ] **Step 3: Commit**

```bash
git add lib/validations/anulacion.ts
git commit -m "feat: esquema Zod del motivo de anulacion"
```

---

### Task 3: Server Action de anulación — buscarPedidoParaAnular, anularPedido

**Files:**
- Create: `app/(admin)/anular/actions.ts`

**Interfaces:**
- Consumes: `motivoAnulacionSchema`, `type MotivoAnulacionInput` (Task 2); RPC `anular_pedido` (Task 1).
- Produces: `buscarPedidoParaAnular(numeroCorto: number): Promise<Result<PedidoParaAnularVista | null, DomainError>>`; `anularPedido(pedidoId: string, input: MotivoAnulacionInput): Promise<Result<null, DomainError>>` — usadas por la página de la Task 5. `PedidoParaAnularVista` se define en este mismo archivo y se reexporta para la página.

- [ ] **Step 1: Implementar la Server Action**

```typescript
// app/(admin)/anular/actions.ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { err, ok, type DomainError, type Result } from "@/lib/result";
import { createServerSupabase } from "@/lib/supabase/server";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";
import { motivoAnulacionSchema, type MotivoAnulacionInput } from "@/lib/validations/anulacion";

const uuidValido = (valor: string): boolean => z.uuid().safeParse(valor).success;

async function exigirAdmin(): Promise<Result<{ sedeId: string }, DomainError>> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return err({ codigo: "NO_AUTORIZADO", mensaje: "Inicia sesión de nuevo" });
  if (user.app_metadata?.rol !== "admin") {
    return err({ codigo: "NO_AUTORIZADO", mensaje: "Solo el administrador puede anular pedidos" });
  }
  return ok({ sedeId: (user.app_metadata?.sede_id as string) ?? SEDE_DEFAULT_ID });
}

export interface PedidoParaAnularVista {
  id: string;
  numeroCorto: number;
  estado: string;
  totalCop: number;
  creadoEn: string;
}

export async function buscarPedidoParaAnular(
  numeroCorto: number,
): Promise<Result<PedidoParaAnularVista | null, DomainError>> {
  const ctx = await exigirAdmin();
  if (!ctx.ok) return ctx;
  if (!Number.isInteger(numeroCorto) || numeroCorto <= 0) {
    return err({ codigo: "VALIDACION", mensaje: "Número de pedido inválido" });
  }
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from("pedidos")
    .select("id, numero_corto, estado, total_cop, creado_en")
    .eq("sede_id", ctx.valor.sedeId)
    .eq("numero_corto", numeroCorto)
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos buscar el pedido. Intenta de nuevo." });
  }
  if (!data) return ok(null);

  return ok({
    id: data.id,
    numeroCorto: data.numero_corto,
    estado: data.estado,
    totalCop: data.total_cop,
    creadoEn: data.creado_en,
  });
}

export async function anularPedido(
  pedidoId: string,
  input: MotivoAnulacionInput,
): Promise<Result<null, DomainError>> {
  const ctx = await exigirAdmin();
  if (!ctx.ok) return ctx;
  if (!uuidValido(pedidoId)) {
    return err({ codigo: "VALIDACION", mensaje: "Identificador de pedido inválido" });
  }
  const parsed = motivoAnulacionSchema.safeParse(input);
  if (!parsed.success) {
    return err({ codigo: "VALIDACION", mensaje: parsed.error.issues[0]?.message ?? "Datos inválidos" });
  }
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("anular_pedido", {
    p_pedido_id: pedidoId,
    p_motivo: parsed.data.motivo,
  });
  if (error) {
    return err({
      codigo: "VALIDACION",
      mensaje: "No pudimos anular el pedido. Verifica que esté cobrado e intenta de nuevo.",
    });
  }

  revalidatePath("/anular");
  return ok(null);
}
```

**Nota sobre `numero_corto`**: no es único globalmente (se reinicia cada día por sede — ver `lib/pedido/numeroCorto.ts` del Bloque 5), así que la búsqueda toma el pedido más reciente con ese número en la sede del admin (`order by creado_en desc limit 1`). Un admin que busca el pedido #12 de hace una semana en vez del de hoy encontrará el de hoy — limitación conocida y aceptable para este bloque (buscar por fecha además de número queda fuera de alcance; el reporte de anulaciones del Bloque 9 sí tendrá filtro de rango completo).

- [ ] **Step 2: Verificar suite**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 141/141 tests (Server Action ligada a Supabase, sin test unitario dedicado — precedente de los Bloques 4-7).

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/anular/actions.ts"
git commit -m "feat: server actions de anulacion (buscar, anular)"
```

---

### Task 4: Server Action de auditoría — listarAuditoria

**Files:**
- Create: `app/(admin)/auditoria/actions.ts`

**Interfaces:**
- Produces: `listarAuditoria(filtros: FiltrosAuditoria): Promise<Result<AuditoriaVista[], DomainError>>`; tipo `FiltrosAuditoria = { tabla?: string; desde?: string; hasta?: string; pagina: number }`; tipo `AuditoriaVista = { id, tabla, accion, registroId, usuarioNombre, creadoEn }` — usada por la página de la Task 6.

- [ ] **Step 1: Implementar la Server Action**

```typescript
// app/(admin)/auditoria/actions.ts
"use server";

import { err, ok, type DomainError, type Result } from "@/lib/result";
import { createServerSupabase } from "@/lib/supabase/server";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";

const FILAS_POR_PAGINA = 30;

async function exigirAdmin(): Promise<Result<{ sedeId: string }, DomainError>> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return err({ codigo: "NO_AUTORIZADO", mensaje: "Inicia sesión de nuevo" });
  if (user.app_metadata?.rol !== "admin") {
    return err({ codigo: "NO_AUTORIZADO", mensaje: "Solo el administrador puede ver la auditoría" });
  }
  return ok({ sedeId: (user.app_metadata?.sede_id as string) ?? SEDE_DEFAULT_ID });
}

export interface FiltrosAuditoria {
  tabla?: string;
  desde?: string;
  hasta?: string;
  pagina: number;
}

export interface AuditoriaVista {
  id: string;
  tabla: string;
  accion: string;
  registroId: string;
  usuarioNombre: string;
  creadoEn: string;
}

const TABLAS_AUDITADAS = ["pedidos", "pagos", "turnos_caja", "movimientos_caja", "anulaciones", "usuarios"];

export async function listarAuditoria(
  filtros: FiltrosAuditoria,
): Promise<Result<AuditoriaVista[], DomainError>> {
  const ctx = await exigirAdmin();
  if (!ctx.ok) return ctx;
  if (filtros.tabla && !TABLAS_AUDITADAS.includes(filtros.tabla)) {
    return err({ codigo: "VALIDACION", mensaje: "Tabla inválida" });
  }
  const supabase = await createServerSupabase();

  let consulta = supabase
    .from("auditoria")
    .select("id, tabla, accion, registro_id, usuario_id, creado_en")
    .eq("sede_id", ctx.valor.sedeId)
    .order("creado_en", { ascending: false });

  if (filtros.tabla) consulta = consulta.eq("tabla", filtros.tabla);
  if (filtros.desde) consulta = consulta.gte("creado_en", filtros.desde);
  if (filtros.hasta) consulta = consulta.lt("creado_en", filtros.hasta);

  const pagina = Math.max(1, filtros.pagina);
  const desde = (pagina - 1) * FILAS_POR_PAGINA;
  consulta = consulta.range(desde, desde + FILAS_POR_PAGINA - 1);

  const { data, error } = await consulta;
  if (error) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos cargar la auditoría. Intenta de nuevo." });
  }

  const usuarioIds = [...new Set((data ?? []).map((f) => f.usuario_id).filter((id): id is string => !!id))];
  const { data: usuariosFilas } = usuarioIds.length
    ? await supabase.from("usuarios").select("id, nombre").in("id", usuarioIds)
    : { data: [] as { id: string; nombre: string }[] };
  const nombrePorId = new Map((usuariosFilas ?? []).map((u) => [u.id, u.nombre]));

  return ok(
    (data ?? []).map((fila) => ({
      id: fila.id,
      tabla: fila.tabla,
      accion: fila.accion,
      registroId: fila.registro_id,
      usuarioNombre: fila.usuario_id ? (nombrePorId.get(fila.usuario_id) ?? "Usuario") : "Sistema",
      creadoEn: fila.creado_en,
    })),
  );
}

export { TABLAS_AUDITADAS };
```

- [ ] **Step 2: Verificar suite**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 141/141 tests.

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/auditoria/actions.ts"
git commit -m "feat: server action de listado de auditoria con filtros"
```

---

### Task 5: Página `/anular` — búsqueda y formulario

**Files:**
- Create: `app/(admin)/anular/page.tsx`
- Create: `components/admin/BuscadorPedidoAnular.tsx`
- Modify: `lib/auth/roles.ts:22-37` (agregar `{ prefijo: "/anular", roles: ["admin"] }` a `PREFIJOS_POR_ROL`)

**Interfaces:**
- Consumes: `buscarPedidoParaAnular`, `anularPedido`, `type PedidoParaAnularVista` (Task 3); `motivoAnulacionSchema`, `type MotivoAnulacionInput` (Task 2); `formatearCOP` de `lib/money.ts`; `formatearFecha` de `lib/dates.ts`; `ClayButton`, `ClayCard`, `ClayInput`, `ClayBadge` de `components/ui/`.

- [ ] **Step 1: Registrar la ruta en el middleware**

```typescript
// lib/auth/roles.ts — agregar esta línea dentro del array PREFIJOS_POR_ROL,
// junto a las demás rutas de admin (después de la línea de "/auditoria"):
  { prefijo: "/anular", roles: ["admin"] },
```

- [ ] **Step 2: Implementar el componente cliente de búsqueda + formulario**

```typescript
// components/admin/BuscadorPedidoAnular.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayCard } from "@/components/ui/ClayCard";
import { ClayInput } from "@/components/ui/ClayInput";
import { ClayBadge } from "@/components/ui/ClayBadge";
import { formatearCOP } from "@/lib/money";
import { formatearFecha } from "@/lib/dates";
import { motivoAnulacionSchema, type MotivoAnulacionInput } from "@/lib/validations/anulacion";
import { buscarPedidoParaAnular, anularPedido, type PedidoParaAnularVista } from "@/app/(admin)/anular/actions";

const ETIQUETA_ESTADO: Record<string, string> = {
  abierto: "Abierto",
  enviado_cocina: "Enviado a cocina",
  en_preparacion: "En preparación",
  listo: "Listo",
  entregado: "Entregado",
  cobrado: "Cobrado",
  cerrado: "Cerrado",
  anulado: "Anulado",
};

export function BuscadorPedidoAnular() {
  const router = useRouter();
  const [numeroBuscado, setNumeroBuscado] = useState("");
  const [pedido, setPedido] = useState<PedidoParaAnularVista | null | undefined>(undefined);
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [errorAnular, setErrorAnular] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MotivoAnulacionInput>({ resolver: zodResolver(motivoAnulacionSchema) });

  async function buscar() {
    const numero = Number(numeroBuscado);
    if (!Number.isInteger(numero) || numero <= 0) {
      setErrorBusqueda("Escribe un número de pedido válido");
      return;
    }
    setErrorBusqueda(null);
    setBuscando(true);
    const resultado = await buscarPedidoParaAnular(numero);
    setBuscando(false);
    if (!resultado.ok) {
      setErrorBusqueda(resultado.error.mensaje);
      setPedido(undefined);
      return;
    }
    setPedido(resultado.valor);
    setConfirmando(false);
  }

  const onSubmitMotivo = handleSubmit(async (datos) => {
    if (!pedido) return;
    setErrorAnular(null);
    setEnviando(true);
    const resultado = await anularPedido(pedido.id, datos);
    setEnviando(false);
    if (!resultado.ok) {
      setErrorAnular(resultado.error.mensaje);
      return;
    }
    reset();
    setConfirmando(false);
    setPedido({ ...pedido, estado: "anulado" });
    router.refresh();
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end gap-3">
        <ClayInput
          label="Número de pedido"
          type="number"
          inputMode="numeric"
          min={1}
          value={numeroBuscado}
          onChange={(evento) => setNumeroBuscado(evento.target.value)}
          error={errorBusqueda ?? undefined}
        />
        <ClayButton type="button" variant="primary" disabled={buscando} onClick={buscar}>
          {buscando ? "Buscando…" : "Buscar"}
        </ClayButton>
      </div>

      {pedido === null ? (
        <p className="text-sm text-text-secondary">No encontramos un pedido con ese número.</p>
      ) : null}

      {pedido ? (
        <ClayCard variant="flat" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-display text-xl font-semibold text-text-primary">
              Pedido #{pedido.numeroCorto}
            </span>
            <ClayBadge variant={pedido.estado === "cobrado" ? "alerta" : "neutral"}>
              {ETIQUETA_ESTADO[pedido.estado] ?? pedido.estado}
            </ClayBadge>
          </div>
          <p className="text-sm text-text-secondary">{formatearFecha(new Date(pedido.creadoEn))}</p>
          <p className="font-mono text-lg text-text-primary">{formatearCOP(BigInt(pedido.totalCop))}</p>

          {pedido.estado !== "cobrado" ? (
            <p className="text-sm text-text-secondary">
              Este pedido no se puede anular — solo se anulan pedidos ya cobrados.
            </p>
          ) : !confirmando ? (
            <ClayButton type="button" variant="destructive" onClick={() => setConfirmando(true)}>
              Anular pedido
            </ClayButton>
          ) : (
            <form onSubmit={onSubmitMotivo} className="flex flex-col gap-3" noValidate>
              <ClayInput
                label="Motivo de la anulación"
                placeholder="Ej: pedido duplicado, cliente se retractó"
                error={errors.motivo?.message}
                {...register("motivo")}
              />
              {errorAnular ? (
                <p role="alert" className="text-sm text-brand-tomate-2">
                  {errorAnular}
                </p>
              ) : null}
              <div className="flex gap-3">
                <ClayButton type="button" variant="ghost" onClick={() => setConfirmando(false)}>
                  Cancelar
                </ClayButton>
                <ClayButton type="submit" variant="destructive" disabled={enviando}>
                  {enviando ? "Anulando…" : "Confirmar anulación"}
                </ClayButton>
              </div>
            </form>
          )}
        </ClayCard>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Implementar la página**

```typescript
// app/(admin)/anular/page.tsx
import { BuscadorPedidoAnular } from "@/components/admin/BuscadorPedidoAnular";

export default function AnularPage() {
  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Anular pedido</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">
        Busca un pedido por número para anularlo. Solo se pueden anular pedidos ya cobrados.
      </p>
      <BuscadorPedidoAnular />
    </main>
  );
}
```

- [ ] **Step 4: Verificar suite**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 141/141 tests. `/anular` debe quedar como ruta dinámica (`ƒ`).

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/anular/page.tsx" components/admin/BuscadorPedidoAnular.tsx lib/auth/roles.ts
git commit -m "feat: pagina de anulacion de pedidos (busqueda y formulario)"
```

---

### Task 6: Página `/auditoria` — tabla de solo lectura con filtros

**Files:**
- Create: `app/(admin)/auditoria/page.tsx`
- Create: `components/admin/TablaAuditoria.tsx`

**Interfaces:**
- Consumes: `listarAuditoria`, `type FiltrosAuditoria`, `type AuditoriaVista`, `TABLAS_AUDITADAS` (Task 4); `formatearFecha` de `lib/dates.ts`.

- [ ] **Step 1: Implementar el componente cliente de tabla + filtros**

```typescript
// components/admin/TablaAuditoria.tsx
"use client";

import { useEffect, useState } from "react";
import { ClayCard } from "@/components/ui/ClayCard";
import { ClayButton } from "@/components/ui/ClayButton";
import { formatearFecha } from "@/lib/dates";
import { listarAuditoria, TABLAS_AUDITADAS, type AuditoriaVista } from "@/app/(admin)/auditoria/actions";

const ETIQUETA_ACCION: Record<string, string> = {
  INSERT: "Creación",
  UPDATE: "Actualización",
  DELETE: "Eliminación",
};

interface TablaAuditoriaProps {
  filasIniciales: AuditoriaVista[];
}

export function TablaAuditoria({ filasIniciales }: TablaAuditoriaProps) {
  const [filas, setFilas] = useState<AuditoriaVista[]>(filasIniciales);
  const [tabla, setTabla] = useState<string>("");
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    listarAuditoria({ tabla: tabla || undefined, pagina }).then((resultado) => {
      if (cancelado) return;
      setCargando(false);
      if (!resultado.ok) {
        setError(resultado.error.mensaje);
        return;
      }
      setFilas(resultado.valor);
    });
    return () => {
      cancelado = true;
    };
  }, [tabla, pagina]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <label htmlFor="filtro-tabla" className="font-display text-sm font-medium text-text-primary">
          Tabla
        </label>
        <select
          id="filtro-tabla"
          value={tabla}
          onChange={(evento) => {
            setTabla(evento.target.value);
            setPagina(1);
          }}
          className="h-12 rounded-clay-md bg-surface-sunken px-4 text-base text-text-primary shadow-clay-pressed"
        >
          <option value="">Todas</option>
          {TABLAS_AUDITADAS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {error}
        </p>
      ) : null}

      <ClayCard variant="flat" className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-black/10 text-text-secondary">
              <th className="py-2 pr-4">Fecha</th>
              <th className="py-2 pr-4">Tabla</th>
              <th className="py-2 pr-4">Acción</th>
              <th className="py-2 pr-4">Usuario</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila.id} className="border-b border-black/5 text-text-primary">
                <td className="py-2 pr-4">{formatearFecha(new Date(fila.creadoEn))}</td>
                <td className="py-2 pr-4 font-mono">{fila.tabla}</td>
                <td className="py-2 pr-4">{ETIQUETA_ACCION[fila.accion] ?? fila.accion}</td>
                <td className="py-2 pr-4">{fila.usuarioNombre}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filas.length === 0 && !cargando ? (
          <p className="py-6 text-center text-sm text-text-secondary">Sin registros de auditoría.</p>
        ) : null}
      </ClayCard>

      <div className="flex gap-3">
        <ClayButton
          type="button"
          variant="secondary"
          size="sm"
          disabled={pagina <= 1 || cargando}
          onClick={() => setPagina((p) => Math.max(1, p - 1))}
        >
          Anterior
        </ClayButton>
        <ClayButton
          type="button"
          variant="secondary"
          size="sm"
          disabled={cargando}
          onClick={() => setPagina((p) => p + 1)}
        >
          Siguiente
        </ClayButton>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implementar la página**

```typescript
// app/(admin)/auditoria/page.tsx
import { TablaAuditoria } from "@/components/admin/TablaAuditoria";
import { listarAuditoria } from "@/app/(admin)/auditoria/actions";

export default async function AuditoriaPage() {
  const resultado = await listarAuditoria({ pagina: 1 });
  const filasIniciales = resultado.ok ? resultado.valor : [];

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Auditoría</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">
        Historial de cambios sobre pedidos, pagos, turnos y usuarios.
      </p>
      <TablaAuditoria filasIniciales={filasIniciales} />
    </main>
  );
}
```

- [ ] **Step 3: Verificar suite**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 141/141 tests. `/auditoria` debe quedar como ruta dinámica (`ƒ`).

- [ ] **Step 4: Commit**

```bash
git add "app/(admin)/auditoria/page.tsx" components/admin/TablaAuditoria.tsx
git commit -m "feat: pagina de auditoria con tabla y filtros"
```

---

### Task 7: Verificación en vivo, reconciliación y cierre

**Files:**
- Modify: `CLAUDE.md` (solo si la verificación revela una divergencia real)

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Verificación en vivo del trigger de auditoría (con el usuario admin de prueba ya existente)**

a. Con `service_role`, insertar un `movimiento_caja` de prueba sobre un turno existente (o crear uno de prueba) y confirmar con `service_role` que apareció una fila nueva en `auditoria` con `tabla='movimientos_caja'`, `accion='INSERT'`, `usuario_id` correcto (si se hizo con un token de usuario real) o `null` (si se hizo con `service_role`, ya que `auth.uid()` no aplica ahí).

b. Con el token del admin de prueba, hacer un UPDATE directo permitido (ej. si existe algún camino de escritura de admin sobre `pedidos` en estado no terminal) y confirmar una fila de auditoría con `accion='UPDATE'` y `diff_json.before`/`diff_json.after` ambos no nulos.

c. Confirmar que un pedido de prueba en estado `listo` (no `cobrado`) rechaza `anular_pedido` con el mensaje "Solo se pueden anular pedidos ya cobrados".

d. Crear un pedido de prueba en `cobrado`, llamar `anular_pedido` con el token del admin, confirmar `estado='anulado'`, confirmar la fila en `anulaciones` con el motivo correcto, y confirmar que esa misma anulación generó SU PROPIA fila de auditoría (`tabla='anulaciones'`, `accion='INSERT'`) — auditoría de la auditoría.

e. Con el token de una vendedora/cajera/cocina de prueba (ya existen de bloques anteriores), confirmar que `anular_pedido` es rechazado (401/403) y que un SELECT directo sobre `auditoria`/`anulaciones` devuelve `200 []` (RLS filtra, no error).

f. Limpiar datos de prueba creados en este paso (pedidos/movimientos de prueba); las filas de `auditoria` que quedaron de esas operaciones de prueba se pueden dejar (son parte legítima del historial de lo que pasó, borrarlas sería contradecir el propósito de la tabla) o limpiarse con `service_role` si se prefiere un estado de cloud más limpio — decisión del ejecutor, documentar cuál se tomó.

- [ ] **Step 2: Reconciliar CLAUDE.md si hace falta**

Revisar §7 (¿el modelo de datos de `auditoria`/`anulaciones` documentado coincide exactamente con lo migrado?), §2.2 (¿el texto sobre anulación sigue siendo preciso?), §5 (¿la estructura de carpetas ya mostraba `/anular` y `/auditoria` correctamente, o hace falta ajustar?). Si algo diverge, corregirlo; si no, no tocar nada por tocar.

- [ ] **Step 3: Verificación final**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: todo verde, 141/141 tests. Flujo dev: login admin → `/anular` → buscar un pedido cobrado → anular con motivo → `/auditoria` → ver la fila de la anulación.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: reconciliar CLAUDE.md con auditoria y anulaciones del bloque 8"
```

(Si no hubo cambios en CLAUDE.md, omitir este commit y dejarlo anotado en el reporte de la tarea.)

---

## Self-Review (del autor del plan)

**Cobertura del spec:** Alcance del trigger (decisión 1): Task 1, exactamente las 6 tablas confirmadas. Efecto financiero de anular sin recalcular turno/pagos (decisión 2): Task 1 — el RPC `anular_pedido` no toca `pagos` ni `turnos_caja` en ningún punto, confirmado en el propio código. Punto de entrada `/anular` con búsqueda (decisión 3): Tasks 3 y 5. Página `/auditoria` de solo lectura con filtros: Tasks 4 y 6. Verificación en vivo del trigger y del RPC: Task 7.

**Placeholders:** ninguno — todo el código de cada step está completo.

**Consistencia de tipos:** `PedidoParaAnularVista` (Task 3) se consume sin modificación en `BuscadorPedidoAnular` (Task 5) — mismos nombres de campo (`numeroCorto`, `totalCop`, `creadoEn`). `AuditoriaVista`/`FiltrosAuditoria`/`TABLAS_AUDITADAS` (Task 4) se consumen sin modificación en `TablaAuditoria` (Task 6). `MotivoAnulacionInput` (Task 2) es el mismo tipo usado en `anularPedido` (Task 3) y en el `useForm` de `BuscadorPedidoAnular` (Task 5).

**Nota de diseño agregada durante el self-review**: el plan documenta explícitamente en la Task 3 la limitación de que `numero_corto` no es único globalmente (se reinicia por día/sede, ver Bloque 5) — la búsqueda toma el más reciente. Esto no estaba en el spec original de forma tan explícita; se agrega aquí porque un implementador sin este contexto podría asumir incorrectamente que `numero_corto` es una clave única y escribir un `.single()` que fallaría con múltiples filas.
