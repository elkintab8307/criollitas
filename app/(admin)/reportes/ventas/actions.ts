"use server";

import { err, ok, type DomainError, type Result } from "@/lib/result";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

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

export interface FilaVentaDiaria {
  dia: string;
  canal: string;
  numPedidos: number;
  subtotalCop: number;
  descuentoCop: number;
  propinaCop: number;
  totalCop: number;
}

export async function obtenerVentasRango(
  desde: string,
  hasta: string,
  canal: string | null,
): Promise<Result<FilaVentaDiaria[], DomainError>> {
  const ctx = await exigirAdmin();
  if (!ctx.ok) return ctx;
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("fn_reporte_ventas_rango", {
    p_desde: desde,
    p_hasta: hasta,
    p_canal: (canal ?? undefined) as Database["public"]["Enums"]["canal_pedido"] | undefined,
  });
  if (error) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos cargar el reporte. Intenta de nuevo." });
  }
  return ok(
    (data ?? []).map((f) => ({
      dia: f.dia,
      canal: f.canal,
      numPedidos: f.num_pedidos,
      subtotalCop: f.subtotal_cop,
      descuentoCop: f.descuento_cop,
      propinaCop: f.propina_cop,
      totalCop: f.total_cop,
    })),
  );
}

export interface TicketPromedioGlobal {
  ticketPromedioCop: number;
  numPedidos: number;
}

export async function obtenerTicketPromedioGlobal(
  desde: string,
  hasta: string,
): Promise<Result<TicketPromedioGlobal, DomainError>> {
  const ctx = await exigirAdmin();
  if (!ctx.ok) return ctx;
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("fn_reporte_ticket_promedio_global", {
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos cargar el reporte. Intenta de nuevo." });
  }
  const fila = (data ?? [])[0];
  return ok({
    ticketPromedioCop: fila?.ticket_promedio_cop ?? 0,
    numPedidos: fila?.num_pedidos ?? 0,
  });
}

export interface CeldaMapaCalorReporte {
  diaSemana: number;
  hora: number;
  promedioCop: number;
  numPedidos: number;
}

export async function obtenerMapaCalor(
  desde: string,
  hasta: string,
): Promise<Result<CeldaMapaCalorReporte[], DomainError>> {
  const ctx = await exigirAdmin();
  if (!ctx.ok) return ctx;
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("fn_reporte_mapa_calor_horas", {
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos cargar el reporte. Intenta de nuevo." });
  }
  return ok(
    (data ?? []).map((f) => ({
      diaSemana: f.dia_semana,
      hora: f.hora,
      promedioCop: f.promedio_cop,
      numPedidos: f.num_pedidos,
    })),
  );
}
