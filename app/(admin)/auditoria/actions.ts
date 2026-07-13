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
