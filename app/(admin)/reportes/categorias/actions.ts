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

export interface FilaCategoria {
  categoriaId: string;
  categoriaNombre: string;
  unidades: number;
  ingresoCop: number;
  porcentaje: number;
}

export async function obtenerReporteCategorias(
  desde: string,
  hasta: string,
): Promise<Result<FilaCategoria[], DomainError>> {
  const ctx = await exigirAdmin();
  if (!ctx.ok) return ctx;
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("fn_reporte_categorias", {
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos cargar el reporte. Intenta de nuevo." });
  }

  return ok(
    (data ?? []).map((fila) => ({
      categoriaId: fila.categoria_id,
      categoriaNombre: fila.categoria_nombre,
      unidades: fila.unidades,
      ingresoCop: fila.ingreso_cop,
      porcentaje: Number(fila.porcentaje),
    })),
  );
}
