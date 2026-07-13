"use server";

import { z } from "zod";

import { err, ok, type DomainError, type Result } from "@/lib/result";
import { createServerSupabase } from "@/lib/supabase/server";

const uuidValido = (valor: string): boolean => z.uuid().safeParse(valor).success;

const ESTADOS_VALIDOS = new Set(["pendiente", "en_preparacion", "listo"]);

async function exigirCocina(): Promise<Result<null, DomainError>> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return err({ codigo: "NO_AUTORIZADO", mensaje: "Inicia sesión de nuevo" });
  if (user.app_metadata?.rol !== "cocina") {
    return err({ codigo: "NO_AUTORIZADO", mensaje: "Solo cocina puede actualizar este ítem" });
  }
  return ok(null);
}

/** Toque de un ítem en el KDS: avanza (o destoca) su estado y, en la misma
 *  sentencia atómica dentro del RPC, recalcula el estado agregado del
 *  pedido (CLAUDE.md §4.1, ver lib/kds/estadoAgregado.ts para la regla). */
export async function actualizarEstadoItem(
  pedidoItemId: string,
  nuevoEstado: "pendiente" | "en_preparacion" | "listo",
): Promise<Result<null, DomainError>> {
  const ctx = await exigirCocina();
  if (!ctx.ok) return ctx;
  if (!uuidValido(pedidoItemId)) {
    return err({ codigo: "VALIDACION", mensaje: "Identificador de ítem inválido" });
  }
  if (!ESTADOS_VALIDOS.has(nuevoEstado)) {
    return err({ codigo: "VALIDACION", mensaje: "Estado inválido" });
  }
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("actualizar_estado_item_pedido", {
    p_pedido_item_id: pedidoItemId,
    p_nuevo_estado: nuevoEstado,
  });
  if (error) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos actualizar el ítem. Intenta de nuevo." });
  }
  return ok(null);
}
