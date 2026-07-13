"use server";

import { z } from "zod";

import { err, ok, type DomainError, type Result } from "@/lib/result";
import { createServerSupabase } from "@/lib/supabase/server";
import { motivoCancelacionSchema, type MotivoCancelacionInput } from "@/lib/validations/cancelacion";

const uuidValido = (valor: string): boolean => z.uuid().safeParse(valor).success;

async function exigirCajera(): Promise<Result<{ cajeraId: string }, DomainError>> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return err({ codigo: "NO_AUTORIZADO", mensaje: "Inicia sesión de nuevo" });
  if (user.app_metadata?.rol !== "cajera") {
    return err({ codigo: "NO_AUTORIZADO", mensaje: "Solo la cajera puede hacer esto" });
  }
  return ok({ cajeraId: user.id });
}

/** Cancela un pedido de domicilio/llevar desde la vista de la cajera
 *  (Bloque C) -- mismo RPC que cancelarPedido de la vendedora (Bloque B),
 *  distinto gate de rol. La cajera nunca agrega productos: por eso este
 *  archivo solo tiene esta acción, sin equivalente a confirmarItemsPedido. */
export async function cancelarPedidoCajera(
  pedidoId: string,
  input: MotivoCancelacionInput,
): Promise<Result<null, DomainError>> {
  const ctx = await exigirCajera();
  if (!ctx.ok) return ctx;
  if (!uuidValido(pedidoId)) {
    return err({ codigo: "VALIDACION", mensaje: "Identificador de pedido inválido" });
  }
  const parsed = motivoCancelacionSchema.safeParse(input);
  if (!parsed.success) {
    return err({ codigo: "VALIDACION", mensaje: parsed.error.issues[0]?.message ?? "Datos inválidos" });
  }
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("cancelar_pedido", {
    p_pedido_id: pedidoId,
    p_motivo: parsed.data.motivo,
  });
  if (error) {
    return err({
      codigo: "VALIDACION",
      mensaje: "No pudimos cancelar el pedido. Verifica que no esté ya cobrado e intenta de nuevo.",
    });
  }

  return ok(null);
}
