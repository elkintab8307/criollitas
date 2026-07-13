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
