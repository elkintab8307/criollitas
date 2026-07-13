"use server";

import { revalidatePath } from "next/cache";

import { err, ok, type DomainError, type Result } from "@/lib/result";
import { createServerSupabase } from "@/lib/supabase/server";
import { montoDesdePesos } from "@/lib/money";
import { efectivoInicialSchema, movimientoSchema, cierreTurnoSchema } from "@/lib/validations/turno";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";

async function exigirCajera(): Promise<Result<{ cajeraId: string; sedeId: string }, DomainError>> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return err({ codigo: "NO_AUTORIZADO", mensaje: "Inicia sesión de nuevo" });
  if (user.app_metadata?.rol !== "cajera") {
    return err({ codigo: "NO_AUTORIZADO", mensaje: "Solo la cajera puede hacer esto" });
  }
  const sedeId = (user.app_metadata?.sede_id as string | undefined) ?? SEDE_DEFAULT_ID;
  return ok({ cajeraId: user.id, sedeId });
}

async function turnoAbiertoDe(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  cajeraId: string,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from("turnos_caja")
    .select("id")
    .eq("cajera_id", cajeraId)
    .eq("estado", "abierto")
    .maybeSingle();
  return data;
}

export async function abrirTurno(input: unknown): Promise<Result<{ turnoId: string }, DomainError>> {
  const ctx = await exigirCajera();
  if (!ctx.ok) return ctx;
  const parsed = efectivoInicialSchema.safeParse(input);
  if (!parsed.success) {
    return err({ codigo: "VALIDACION", mensaje: parsed.error.issues[0]?.message ?? "Datos inválidos" });
  }
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from("turnos_caja")
    .insert({
      sede_id: ctx.valor.sedeId,
      cajera_id: ctx.valor.cajeraId,
      efectivo_inicial_cop: Number(montoDesdePesos(parsed.data.efectivoInicialPesos)),
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return err({ codigo: "VALIDACION", mensaje: "Ya tienes un turno abierto" });
    }
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos abrir el turno. Intenta de nuevo." });
  }
  if (!data) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos abrir el turno. Intenta de nuevo." });
  }
  revalidatePath("/mi-turno");
  return ok({ turnoId: data.id });
}

export async function registrarMovimiento(input: unknown): Promise<Result<null, DomainError>> {
  const ctx = await exigirCajera();
  if (!ctx.ok) return ctx;
  const parsed = movimientoSchema.safeParse(input);
  if (!parsed.success) {
    return err({ codigo: "VALIDACION", mensaje: parsed.error.issues[0]?.message ?? "Datos inválidos" });
  }
  const supabase = await createServerSupabase();

  const turno = await turnoAbiertoDe(supabase, ctx.valor.cajeraId);
  if (!turno) {
    return err({ codigo: "VALIDACION", mensaje: "No tienes un turno abierto" });
  }

  const { error } = await supabase.from("movimientos_caja").insert({
    turno_id: turno.id,
    tipo: parsed.data.tipo,
    concepto: parsed.data.concepto,
    monto_cop: Number(montoDesdePesos(parsed.data.montoPesos)),
  });
  if (error) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos registrar el movimiento. Intenta de nuevo." });
  }
  revalidatePath("/mi-turno");
  return ok(null);
}

export async function cerrarTurno(input: unknown): Promise<Result<null, DomainError>> {
  const ctx = await exigirCajera();
  if (!ctx.ok) return ctx;
  const parsed = cierreTurnoSchema.safeParse(input);
  if (!parsed.success) {
    return err({ codigo: "VALIDACION", mensaje: parsed.error.issues[0]?.message ?? "Datos inválidos" });
  }
  const supabase = await createServerSupabase();

  const turno = await turnoAbiertoDe(supabase, ctx.valor.cajeraId);
  if (!turno) {
    return err({ codigo: "VALIDACION", mensaje: "No tienes un turno abierto" });
  }

  const { error } = await supabase.rpc("cerrar_turno", {
    p_turno_id: turno.id,
    p_efectivo_declarado_cop: Number(montoDesdePesos(parsed.data.efectivoDeclaradoPesos)),
  });
  if (error) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos cerrar el turno. Intenta de nuevo." });
  }
  revalidatePath("/mi-turno");
  return ok(null);
}
