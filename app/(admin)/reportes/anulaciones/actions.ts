"use server";

import { err, ok, type DomainError, type Result } from "@/lib/result";
import { createServerSupabase } from "@/lib/supabase/server";

async function exigirAdmin(): Promise<Result<null, DomainError>> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return err({ codigo: "NO_AUTORIZADO", mensaje: "Inicia sesión de nuevo" });
  if (user.app_metadata?.rol !== "admin") {
    return err({ codigo: "NO_AUTORIZADO", mensaje: "Solo el administrador puede ver reportes" });
  }
  return ok(null);
}

export interface FilaAnulacion {
  anulacionId: string;
  pedidoNumeroCorto: number;
  anuladoEn: string;
  usuarioNombre: string;
  motivo: string;
  totalCop: number;
}

export async function obtenerReporteAnulaciones(
  desde: string,
  hasta: string,
): Promise<Result<FilaAnulacion[], DomainError>> {
  const ctx = await exigirAdmin();
  if (!ctx.ok) return ctx;
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("fn_reporte_anulaciones", {
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos cargar el reporte. Intenta de nuevo." });
  }

  return ok(
    (data ?? []).map((fila) => ({
      anulacionId: fila.anulacion_id,
      pedidoNumeroCorto: fila.pedido_numero_corto,
      anuladoEn: fila.anulado_en,
      usuarioNombre: fila.usuario_nombre,
      motivo: fila.motivo,
      totalCop: fila.total_cop,
    })),
  );
}
