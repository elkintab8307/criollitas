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

export interface FilaCanal {
  canal: string;
  totalCop: number;
  numPedidos: number;
  porcentaje: number;
}

export async function obtenerReporteCanales(
  desde: string,
  hasta: string,
): Promise<Result<FilaCanal[], DomainError>> {
  const ctx = await exigirAdmin();
  if (!ctx.ok) return ctx;
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("fn_reporte_canales", {
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos cargar el reporte. Intenta de nuevo." });
  }

  return ok(
    (data ?? []).map((fila) => ({
      canal: fila.canal,
      totalCop: fila.total_cop,
      numPedidos: fila.num_pedidos,
      porcentaje: Number(fila.porcentaje),
    })),
  );
}
