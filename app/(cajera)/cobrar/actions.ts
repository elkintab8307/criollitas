"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { err, ok, type DomainError, type Result } from "@/lib/result";
import { createServerSupabase } from "@/lib/supabase/server";
import { montoDesdePesos } from "@/lib/money";
import { cobrarPedidoSchema, type CobrarPedidoInput } from "@/lib/validations/cobro";
import { construirLineasTicket, type DatosTicket } from "@/lib/escpos/contenido";
import { codificarEscPos } from "@/lib/escpos/codificar";
import { ahoraBogota } from "@/lib/dates";

const uuidValido = (valor: string): boolean => z.uuid().safeParse(valor).success;

async function exigirCajera(): Promise<Result<{ cajeraId: string }, DomainError>> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return err({ codigo: "NO_AUTORIZADO", mensaje: "Inicia sesión de nuevo" });
  if (user.app_metadata?.rol !== "cajera") {
    return err({ codigo: "NO_AUTORIZADO", mensaje: "Solo la cajera puede cobrar" });
  }
  return ok({ cajeraId: user.id });
}

export interface DatosImpresionCliente {
  impresionId: string;
  contenidoBase64: string;
}

/** Arma el ticket y lo deja registrado, después de que el cobro ya se
 *  confirmó (CLAUDE.md §10.2: el pago nunca depende de que la impresora
 *  esté disponible). El envío real al print-bridge ya NO ocurre aquí: el
 *  servidor de la app corre en Vercel y no tiene ruta de red hacia la IP
 *  LAN del print-bridge (hallazgo en vivo, bloque de cobro) -- el
 *  navegador de la cajera sí está en esa red, así que hace el envío él
 *  mismo con lo que esta función retorna (ver enviarAlPrintBridgeDesdeNavegador).
 *  Nunca lanza: cualquier error en este camino (incluida la propia
 *  lectura/inserción en BD) se traga aquí — un pedido ya cobrado no debe
 *  convertirse en un fallo visible del Server Action por un problema de
 *  impresión. cobrarPedido llama a esta función sin dejar que su fallo
 *  tumbe el cobro. */
async function prepararImpresionTirilla(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  pedidoId: string,
): Promise<DatosImpresionCliente | null> {
  try {
    return await prepararImpresionTirillaInterno(supabase, pedidoId);
  } catch (error) {
    // El cobro ya está confirmado; un fallo aquí (BD transitoria, etc.) no
    // debe propagar y aparentar que cobrarPedido falló. Se registra en el
    // log del servidor para no perder visibilidad de un bug real (ej. un
    // error de programación) que de otro modo fallaría en silencio total.
    console.error(`prepararImpresionTirilla falló para pedido ${pedidoId}:`, error);
    return null;
  }
}

async function prepararImpresionTirillaInterno(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  pedidoId: string,
): Promise<DatosImpresionCliente | null> {
  const { data: pedidoFila } = await supabase
    .from("pedidos")
    .select("numero_corto, canal, mesa_id, subtotal_cop, total_cop, sede_id")
    .eq("id", pedidoId)
    .single();
  if (!pedidoFila) return null;

  const { data: sedeFila } = await supabase
    .from("sedes")
    .select("nombre")
    .eq("id", pedidoFila.sede_id)
    .single();

  let origen = "Para llevar";
  if (pedidoFila.canal === "mesa" && pedidoFila.mesa_id) {
    const { data: mesaFila } = await supabase
      .from("mesas")
      .select("numero")
      .eq("id", pedidoFila.mesa_id)
      .single();
    origen = mesaFila ? `Mesa ${mesaFila.numero}` : "Mesa";
  } else if (pedidoFila.canal === "domicilio") {
    origen = "Domicilio";
  }

  const { data: itemsFilas } = await supabase
    .from("pedido_items")
    .select("cantidad, subtotal_cop, producto_id")
    .eq("pedido_id", pedidoId);
  const productoIds = [...new Set((itemsFilas ?? []).map((i) => i.producto_id))];
  const { data: productosFilas } = productoIds.length
    ? await supabase.from("productos").select("id, nombre").in("id", productoIds)
    : { data: [] as { id: string; nombre: string }[] };
  const nombrePorId = new Map((productosFilas ?? []).map((p) => [p.id, p.nombre]));

  // Los pagos se leen de lo que cobrar_pedido efectivamente insertó, no del
  // input del cliente: hoy son iguales (el RPC solo hace un pass-through
  // tras validar el cuadre), pero si el RPC alguna vez ajusta/rechaza una
  // fila de pago, la tirilla debe reflejar lo que quedó guardado, no lo que
  // se pidió cobrar.
  const { data: pagosFilas } = await supabase
    .from("pagos")
    .select("metodo, monto_cop")
    .eq("pedido_id", pedidoId);

  const datosTicket: DatosTicket = {
    sedeNombre: sedeFila?.nombre ?? "Criollitas",
    numeroCorto: pedidoFila.numero_corto,
    fecha: ahoraBogota(),
    origen,
    items: (itemsFilas ?? []).map((i) => ({
      cantidad: i.cantidad,
      nombre: nombrePorId.get(i.producto_id) ?? "Producto",
      subtotalCop: BigInt(i.subtotal_cop),
    })),
    subtotalCop: BigInt(pedidoFila.subtotal_cop),
    totalCop: BigInt(pedidoFila.total_cop),
    pagos: (pagosFilas ?? []).map((p) => ({ metodo: p.metodo, montoCop: BigInt(p.monto_cop) })),
  };

  const contenidoBase64 = codificarEscPos(construirLineasTicket(datosTicket));

  const { data: impresionFila } = await supabase
    .from("impresiones")
    .insert({ pedido_id: pedidoId, tipo: "tirilla_cobro", contenido_escpos: contenidoBase64 })
    .select("id")
    .single();
  if (!impresionFila) return null;

  return { impresionId: impresionFila.id, contenidoBase64 };
}

/** Registra el resultado de un envío de impresión hecho por el navegador
 *  de la cajera (ver enviarAlPrintBridgeDesdeNavegador) -- espejo de lo que
 *  antes escribía enviarAlPrintBridge del lado del servidor. */
export async function reportarResultadoImpresion(
  impresionId: string,
  exito: boolean,
  error: string | null,
): Promise<void> {
  const ctx = await exigirCajera();
  if (!ctx.ok) return;
  if (!uuidValido(impresionId)) return;
  const supabase = await createServerSupabase();
  await supabase
    .from("impresiones")
    .update({ enviado_en: new Date().toISOString(), exito, error })
    .eq("id", impresionId);
}

export async function cobrarPedido(
  pedidoId: string,
  input: CobrarPedidoInput,
): Promise<Result<{ impresion: DatosImpresionCliente | null }, DomainError>> {
  const ctx = await exigirCajera();
  if (!ctx.ok) return ctx;
  if (!uuidValido(pedidoId)) {
    return err({ codigo: "VALIDACION", mensaje: "Identificador de pedido inválido" });
  }
  const parsed = cobrarPedidoSchema.safeParse(input);
  if (!parsed.success) {
    return err({ codigo: "VALIDACION", mensaje: parsed.error.issues[0]?.message ?? "Datos inválidos" });
  }
  const supabase = await createServerSupabase();

  const { data: turno } = await supabase
    .from("turnos_caja")
    .select("id")
    .eq("cajera_id", ctx.valor.cajeraId)
    .eq("estado", "abierto")
    .maybeSingle();
  if (!turno) {
    return err({ codigo: "VALIDACION", mensaje: "Abre tu turno antes de cobrar" });
  }

  const pagosParaRpc = parsed.data.pagos.map((pago) => ({
    metodo: pago.metodo,
    monto_cop: Number(montoDesdePesos(pago.montoPesos)),
    referencia: pago.referencia ?? null,
  }));

  const { error: errorCobro } = await supabase.rpc("cobrar_pedido", {
    p_pedido_id: pedidoId,
    p_turno_id: turno.id,
    p_pagos: pagosParaRpc,
  });
  if (errorCobro) {
    return err({
      codigo: "VALIDACION",
      mensaje: "No pudimos cobrar el pedido. Verifica el total e intenta de nuevo.",
    });
  }

  const impresion = await prepararImpresionTirilla(supabase, pedidoId);

  revalidatePath("/pedidos");
  revalidatePath(`/cobrar/${pedidoId}`);
  return ok({ impresion });
}

/** Devuelve el contenido ya codificado de una impresión existente para que
 *  el navegador de la cajera reintente el envío (mismo motivo que
 *  prepararImpresionTirilla: el servidor no alcanza el print-bridge). */
export async function prepararReintentoImpresion(
  impresionId: string,
): Promise<Result<DatosImpresionCliente, DomainError>> {
  const ctx = await exigirCajera();
  if (!ctx.ok) return ctx;
  if (!uuidValido(impresionId)) {
    return err({ codigo: "VALIDACION", mensaje: "Identificador inválido" });
  }
  const supabase = await createServerSupabase();
  const { data: impresionFila } = await supabase
    .from("impresiones")
    .select("id, contenido_escpos")
    .eq("id", impresionId)
    .single();
  if (!impresionFila) {
    return err({ codigo: "NO_ENCONTRADO", mensaje: "No encontramos esa impresión" });
  }
  return ok({ impresionId: impresionFila.id, contenidoBase64: impresionFila.contenido_escpos });
}
