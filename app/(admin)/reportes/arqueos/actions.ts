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

export interface FilaArqueo {
  turnoId: string;
  cajeraNombre: string;
  abiertoEn: string;
  cerradoEn: string;
  efectivoInicialCop: number;
  ventasEfectivoCop: number;
  salidasCop: number;
  entradasExtraCop: number;
  esperadoCop: number;
  declaradoCop: number;
  diferenciaCop: number;
}

export async function obtenerReporteArqueos(
  desde: string,
  hasta: string,
): Promise<Result<FilaArqueo[], DomainError>> {
  const ctx = await exigirAdmin();
  if (!ctx.ok) return ctx;
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("fn_reporte_arqueos", {
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos cargar el reporte. Intenta de nuevo." });
  }

  return ok(
    (data ?? []).map((fila) => ({
      turnoId: fila.turno_id,
      cajeraNombre: fila.cajera_nombre,
      abiertoEn: fila.abierto_en,
      cerradoEn: fila.cerrado_en,
      efectivoInicialCop: fila.efectivo_inicial_cop,
      ventasEfectivoCop: fila.ventas_efectivo_cop ?? 0,
      salidasCop: fila.salidas_cop ?? 0,
      entradasExtraCop: fila.entradas_extra_cop ?? 0,
      esperadoCop: fila.esperado_cop ?? 0,
      declaradoCop: fila.declarado_cop ?? 0,
      diferenciaCop: fila.diferencia_cop ?? 0,
    })),
  );
}
