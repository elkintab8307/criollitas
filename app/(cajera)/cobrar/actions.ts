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

async function enviarAlPrintBridge(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  impresionId: string,
  contenidoBase64: string,
): Promise<void> {
  try {
    const respuesta = await fetch(`${process.env.PRINT_BRIDGE_URL}/print`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Bridge-Token": process.env.PRINT_BRIDGE_TOKEN ?? "",
      },
      body: JSON.stringify({ printer: "caja-01", escpos_base64: contenidoBase64 }),
      signal: AbortSignal.timeout(5000),
    });
    await supabase
      .from("impresiones")
      .update({
        enviado_en: new Date().toISOString(),
        exito: respuesta.ok,
        error: respuesta.ok ? null : `HTTP ${respuesta.status}`,
      })
      .eq("id", impresionId);
  } catch (error) {
    await supabase
      .from("impresiones")
      .update({
        enviado_en: new Date().toISOString(),
        exito: false,
        error: error instanceof Error ? error.message : "Error de red",
      })
      .eq("id", impresionId);
  }
}

/** Arma el ticket y lo manda al print-bridge, después de que el cobro ya se
 *  confirmó (CLAUDE.md §10.2: el pago nunca depende de que la impresora
 *  esté disponible). Nunca lanza: cualquier error en este camino (incluida
 *  la propia lectura/inserción en BD, no solo la llamada HTTP) se traga
 *  aquí — un pedido ya cobrado no debe convertirse en un fallo visible del
 *  Server Action por un problema de impresión. cobrarPedido llama a esta
 *  función sin esperar nada de su resultado. */
async function intentarImprimirTirilla(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  pedidoId: string,
): Promise<void> {
  try {
    await intentarImprimirTirillaInterno(supabase, pedidoId);
  } catch (error) {
    // El cobro ya está confirmado; un fallo aquí (BD transitoria, etc.) no
    // debe propagar y aparentar que cobrarPedido falló. Se registra en el
    // log del servidor para no perder visibilidad de un bug real (ej. un
    // error de programación) que de otro modo fallaría en silencio total.
    console.error(`intentarImprimirTirilla falló para pedido ${pedidoId}:`, error);
  }
}

async function intentarImprimirTirillaInterno(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  pedidoId: string,
): Promise<void> {
  const { data: pedidoFila } = await supabase
    .from("pedidos")
    .select("numero_corto, canal, mesa_id, subtotal_cop, total_cop, sede_id")
    .eq("id", pedidoId)
    .single();
  if (!pedidoFila) return;

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
  if (!impresionFila) return;

  await enviarAlPrintBridge(supabase, impresionFila.id, contenidoBase64);
}

export async function cobrarPedido(
  pedidoId: string,
  input: CobrarPedidoInput,
): Promise<Result<null, DomainError>> {
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

  await intentarImprimirTirilla(supabase, pedidoId);

  revalidatePath("/pedidos");
  revalidatePath(`/cobrar/${pedidoId}`);
  return ok(null);
}

export async function reintentarImpresion(impresionId: string): Promise<Result<null, DomainError>> {
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
  await enviarAlPrintBridge(supabase, impresionFila.id, impresionFila.contenido_escpos);
  const { data: actualizada } = await supabase
    .from("impresiones")
    .select("exito")
    .eq("id", impresionId)
    .single();
  if (!actualizada?.exito) {
    return err({ codigo: "BASE_DATOS", mensaje: "La impresora no respondió. Intenta de nuevo." });
  }
  return ok(null);
}
