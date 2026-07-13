"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { err, ok, type DomainError, type Result } from "@/lib/result";
import { createServerSupabase } from "@/lib/supabase/server";
import { enviarPedidoSchema, type EnviarPedidoInput } from "@/lib/validations/pedido";
import { calcularSubtotalItem, type ItemParaTotal } from "@/lib/pedido/totales";
import { siguienteEstadoTrasEnvio } from "@/lib/pedido/transicionEstado";

const uuidValido = (valor: string): boolean => z.uuid().safeParse(valor).success;

async function exigirVendedora(): Promise<Result<{ vendedoraId: string }, DomainError>> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return err({ codigo: "NO_AUTORIZADO", mensaje: "Inicia sesión de nuevo" });
  if (user.app_metadata?.rol !== "vendedora") {
    return err({ codigo: "NO_AUTORIZADO", mensaje: "Solo la vendedora puede editar este pedido" });
  }
  return ok({ vendedoraId: user.id });
}

const ESTADOS_NO_MODIFICABLES = new Set(["cobrado", "cerrado", "anulado"]);

/** Inserta los ítems del carrito con precios recalculados desde el menú
 *  vigente (CLAUDE.md §13.2: nunca confiar en un precio del cliente) y
 *  actualiza los totales del pedido. Si el pedido sigue `abierto`, lo pasa a
 *  `enviado_cocina`; si ya estaba más adelante, solo agrega los ítems. */
export async function confirmarItemsPedido(
  pedidoId: string,
  input: EnviarPedidoInput,
): Promise<Result<null, DomainError>> {
  const ctx = await exigirVendedora();
  if (!ctx.ok) return ctx;
  if (!uuidValido(pedidoId)) {
    return err({ codigo: "VALIDACION", mensaje: "Identificador de pedido inválido" });
  }
  const parsed = enviarPedidoSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      codigo: "VALIDACION",
      mensaje: parsed.error.issues[0]?.message ?? "Datos inválidos",
    });
  }
  const supabase = await createServerSupabase();

  const { data: pedido, error: errorPedido } = await supabase
    .from("pedidos")
    .select("id, estado")
    .eq("id", pedidoId)
    .eq("vendedora_id", ctx.valor.vendedoraId)
    .single();
  if (errorPedido || !pedido) {
    return err({ codigo: "NO_ENCONTRADO", mensaje: "El pedido no existe" });
  }
  if (ESTADOS_NO_MODIFICABLES.has(pedido.estado)) {
    return err({ codigo: "VALIDACION", mensaje: "Este pedido ya no se puede modificar" });
  }

  const productoIds = [...new Set(parsed.data.items.map((item) => item.productoId))];
  const { data: productos, error: errorProductos } = await supabase
    .from("productos")
    .select("id, precio_cop, activo")
    .in("id", productoIds);
  if (errorProductos || !productos || productos.length !== productoIds.length) {
    return err({ codigo: "VALIDACION", mensaje: "Uno de los productos ya no está disponible" });
  }
  const productoPorId = new Map(productos.map((p) => [p.id, p]));

  const modificadorIds = [...new Set(parsed.data.items.flatMap((item) => item.modificadorIds))];
  const { data: modificadores, error: errorModificadores } = modificadorIds.length
    ? await supabase
        .from("modificadores")
        .select("id, producto_id, precio_delta_cop, activo")
        .in("id", modificadorIds)
    : { data: [] as { id: string; producto_id: string; precio_delta_cop: number; activo: boolean }[], error: null };
  if (errorModificadores) {
    return err({
      codigo: "BASE_DATOS",
      mensaje: "No pudimos verificar los adicionales. Intenta de nuevo.",
    });
  }
  const modificadorPorId = new Map((modificadores ?? []).map((m) => [m.id, m]));

  interface FilaItem {
    producto_id: string;
    cantidad: number;
    precio_unit_cop: number;
    subtotal_cop: number;
    notas: string | null;
    modificadorIds: string[];
  }
  const filasItems: FilaItem[] = [];

  for (const item of parsed.data.items) {
    const producto = productoPorId.get(item.productoId);
    if (!producto || !producto.activo) {
      return err({ codigo: "VALIDACION", mensaje: "Uno de los productos ya no está disponible" });
    }
    const mods = item.modificadorIds.map((id) => modificadorPorId.get(id));
    if (mods.some((m) => !m || !m.activo || m.producto_id !== item.productoId)) {
      return err({ codigo: "VALIDACION", mensaje: "Uno de los adicionales ya no está disponible" });
    }
    const deltas = mods.map((m) => BigInt(m!.precio_delta_cop));
    const itemParaTotal: ItemParaTotal = {
      precioUnitCop: BigInt(producto.precio_cop),
      cantidad: item.cantidad,
      modificadoresDeltaCop: deltas,
    };
    filasItems.push({
      producto_id: item.productoId,
      cantidad: item.cantidad,
      precio_unit_cop: producto.precio_cop,
      subtotal_cop: Number(calcularSubtotalItem(itemParaTotal)),
      notas: item.nota ?? null,
      modificadorIds: item.modificadorIds,
    });
  }

  for (const fila of filasItems) {
    const { data: itemInsertado, error: errorItem } = await supabase
      .from("pedido_items")
      .insert({
        pedido_id: pedidoId,
        producto_id: fila.producto_id,
        cantidad: fila.cantidad,
        precio_unit_cop: fila.precio_unit_cop,
        subtotal_cop: fila.subtotal_cop,
        notas: fila.notas,
      })
      .select("id")
      .single();
    if (errorItem || !itemInsertado) {
      return err({ codigo: "BASE_DATOS", mensaje: "No pudimos guardar el pedido. Intenta de nuevo." });
    }
    if (fila.modificadorIds.length > 0) {
      const filasMods = fila.modificadorIds.map((modificadorId) => ({
        pedido_item_id: itemInsertado.id,
        modificador_id: modificadorId,
        precio_delta_cop: modificadorPorId.get(modificadorId)!.precio_delta_cop,
      }));
      const { error: errorMods } = await supabase.from("pedido_item_mods").insert(filasMods);
      if (errorMods) {
        return err({
          codigo: "BASE_DATOS",
          mensaje: "No pudimos guardar los adicionales. Intenta de nuevo.",
        });
      }
    }
  }

  // Recalcula subtotal_cop/total_cop con un SUM fresco sobre pedido_items en
  // la base de datos (función `recalcular_totales_pedido`, security invoker)
  // en vez de sumar sobre el `pedido.subtotal_cop` leído al inicio de esta
  // acción: esa lectura queda obsoleta si dos llamadas se solapan (doble tap,
  // reintento de cliente) y un UPDATE client-side pisaría la otra.
  const { error: errorTotales } = await supabase.rpc("recalcular_totales_pedido", {
    p_pedido_id: pedidoId,
  });
  if (errorTotales) {
    return err({
      codigo: "BASE_DATOS",
      mensaje: "Los productos se guardaron, pero no pudimos actualizar el total. Recarga la página.",
    });
  }

  const nuevoEstado = siguienteEstadoTrasEnvio(pedido.estado);
  if (nuevoEstado) {
    const { error: errorEstado } = await supabase
      .from("pedidos")
      .update({ estado: nuevoEstado })
      .eq("id", pedidoId);
    if (errorEstado) {
      return err({
        codigo: "BASE_DATOS",
        mensaje: "Los productos se guardaron, pero no pudimos enviar el pedido a cocina. Recarga la página.",
      });
    }
  }

  revalidatePath(`/pedido/${pedidoId}`);
  return ok(null);
}
