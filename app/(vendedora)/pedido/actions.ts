"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { err, ok, type DomainError, type Result } from "@/lib/result";
import { createServerSupabase } from "@/lib/supabase/server";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";
import { enviarPedidoSchema, type EnviarPedidoInput } from "@/lib/validations/pedido";
import { motivoCancelacionSchema, type MotivoCancelacionInput } from "@/lib/validations/cancelacion";
import { calcularSubtotalItem, type ItemParaTotal } from "@/lib/pedido/totales";
import { siguienteNumeroCorto } from "@/lib/pedido/numeroCorto";
import { limitesDeHoyBogota } from "@/lib/dates";

const uuidValido = (valor: string): boolean => z.uuid().safeParse(valor).success;

async function exigirVendedoraOCajera(): Promise<
  Result<{ vendedoraId: string; sedeId: string; rol: "vendedora" | "cajera" }, DomainError>
> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return err({ codigo: "NO_AUTORIZADO", mensaje: "Inicia sesión de nuevo" });
  const rol = user.app_metadata?.rol as string | undefined;
  if (rol !== "vendedora" && rol !== "cajera") {
    return err({ codigo: "NO_AUTORIZADO", mensaje: "Solo la vendedora o la cajera pueden editar este pedido" });
  }
  return ok({
    vendedoraId: user.id,
    sedeId: (user.app_metadata?.sede_id as string) ?? SEDE_DEFAULT_ID,
    rol,
  });
}

async function calcularSiguienteNumero(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  sedeId: string,
): Promise<number> {
  const { desde, hasta } = limitesDeHoyBogota();
  const { data } = await supabase
    .from("pedidos")
    .select("numero_corto")
    .eq("sede_id", sedeId)
    .gte("creado_en", desde.toISOString())
    .lt("creado_en", hasta.toISOString());
  return siguienteNumeroCorto((data ?? []).map((fila) => fila.numero_corto));
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
  const ctx = await exigirVendedoraOCajera();
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
    .select("id, estado, vendedora_id, canal")
    .eq("id", pedidoId)
    .single();
  if (errorPedido || !pedido) {
    return err({ codigo: "NO_ENCONTRADO", mensaje: "El pedido no existe" });
  }
  // La cajera puede editar (agregar productos) un pedido de domicilio o
  // para llevar aunque no sea suya (pedido del usuario, 2026-07-30) --
  // mesa sigue siendo exclusiva de quien lo creó. RLS ya exige lo mismo
  // (pedido_items_cajera_editar_ajeno_insert); esta comprobación es la
  // que decide el mensaje "no existe" antes de intentar escribir.
  const esDueña = pedido.vendedora_id === ctx.valor.vendedoraId;
  const puedeEditarAjeno =
    ctx.valor.rol === "cajera" && (pedido.canal === "domicilio" || pedido.canal === "llevar");
  if (!esDueña && !puedeEditarAjeno) {
    return err({ codigo: "NO_ENCONTRADO", mensaje: "El pedido no existe" });
  }
  if (ESTADOS_NO_MODIFICABLES.has(pedido.estado)) {
    return err({ codigo: "VALIDACION", mensaje: "Este pedido ya no se puede modificar" });
  }

  const { data: sedeFila } = await supabase
    .from("sedes")
    .select("usa_cocina")
    .eq("id", ctx.valor.sedeId)
    .maybeSingle();
  const estadoItemInicial = sedeFila?.usa_cocina === false ? "listo" : "pendiente";

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

  const { data: itemsInsertados, error: errorItems } = await supabase
    .from("pedido_items")
    .insert(
      filasItems.map((fila) => ({
        pedido_id: pedidoId,
        producto_id: fila.producto_id,
        cantidad: fila.cantidad,
        precio_unit_cop: fila.precio_unit_cop,
        subtotal_cop: fila.subtotal_cop,
        notas: fila.notas,
        estado_item: estadoItemInicial,
      })),
    )
    .select("id");
  if (errorItems || !itemsInsertados || itemsInsertados.length !== filasItems.length) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos guardar el pedido. Intenta de nuevo." });
  }

  const filasMods = filasItems.flatMap((fila, indice) =>
    fila.modificadorIds.map((modificadorId) => ({
      pedido_item_id: itemsInsertados[indice]!.id,
      modificador_id: modificadorId,
      precio_delta_cop: modificadorPorId.get(modificadorId)!.precio_delta_cop,
    })),
  );
  if (filasMods.length > 0) {
    const { error: errorMods } = await supabase.from("pedido_item_mods").insert(filasMods);
    if (errorMods) {
      return err({
        codigo: "BASE_DATOS",
        mensaje: "No pudimos guardar los adicionales. Intenta de nuevo.",
      });
    }
  }

  const { error: errorTotales } = await supabase.rpc("recalcular_totales_pedido", {
    p_pedido_id: pedidoId,
  });
  if (errorTotales) {
    return err({
      codigo: "BASE_DATOS",
      mensaje: "No pudimos guardar el pedido. Intenta de nuevo.",
    });
  }

  revalidatePath(`/pedido/${pedidoId}`);
  return ok(null);
}

export type OrigenPedido =
  | { canal: "mesa"; mesaId: string }
  | { canal: "domicilio"; clienteId: string }
  // clienteId opcional: un pedido para llevar puede llevar el nombre del
  // cliente (mismo formulario que domicilio, decisión del usuario) o no
  // llevar nada (camino offline, donde no se puede crear el cliente).
  | { canal: "llevar"; clienteId?: string };

/** Borra un pedido `abierto` y cualquier ítem/adicional que haya alcanzado
 *  a insertarse, en ese orden (pedido_item_mods -> pedido_items -> pedidos)
 *  para no violar las FK. Se usa cuando crearPedidoConItems crea el pedido
 *  pero confirmarItemsPedido falla después -- mantiene el invariante "sin
 *  productos, no hay pedido" incluso en el camino de error. */
async function limpiarPedidoVacio(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  pedidoId: string,
): Promise<void> {
  const { data: itemsFilas } = await supabase.from("pedido_items").select("id").eq("pedido_id", pedidoId);
  const itemIds = (itemsFilas ?? []).map((i) => i.id);
  if (itemIds.length > 0) {
    await supabase.from("pedido_item_mods").delete().in("pedido_item_id", itemIds);
    await supabase.from("pedido_items").delete().eq("pedido_id", pedidoId);
  }
  await supabase.from("pedidos").delete().eq("id", pedidoId);
}

/** Crea el pedido y sus primeros ítems en un solo paso -- un pedido nunca
 *  existe en base de datos sin al menos un producto confirmado. Reutiliza
 *  confirmarItemsPedido para la inserción de ítems (cero lógica de precios
 *  duplicada); si falla, borra la fila recién creada. */
export async function crearPedidoConItems(
  origen: OrigenPedido,
  input: EnviarPedidoInput,
  idExplicito?: string,
): Promise<Result<{ pedidoId: string }, DomainError>> {
  const ctx = await exigirVendedoraOCajera();
  if (!ctx.ok) return ctx;
  const supabase = await createServerSupabase();

  if (origen.canal === "mesa") {
    if (!uuidValido(origen.mesaId)) {
      return err({ codigo: "VALIDACION", mensaje: "Identificador de mesa inválido" });
    }
    const { data: mesa, error: errorMesa } = await supabase
      .from("mesas")
      .select("id, estado, activa")
      .eq("id", origen.mesaId)
      .single();
    if (errorMesa || !mesa) {
      return err({ codigo: "NO_ENCONTRADO", mensaje: "La mesa no existe" });
    }
    if (!mesa.activa || mesa.estado !== "libre") {
      return err({ codigo: "VALIDACION", mensaje: "Esa mesa ya no está disponible. Elige otra." });
    }
  } else if (origen.canal === "domicilio") {
    if (!uuidValido(origen.clienteId)) {
      return err({ codigo: "VALIDACION", mensaje: "Identificador de cliente inválido" });
    }
  } else if (origen.canal === "llevar" && origen.clienteId !== undefined) {
    if (!uuidValido(origen.clienteId)) {
      return err({ codigo: "VALIDACION", mensaje: "Identificador de cliente inválido" });
    }
  }

  const numeroCorto = await calcularSiguienteNumero(supabase, ctx.valor.sedeId);
  const { data: pedido, error: errorPedido } = await supabase
    .from("pedidos")
    .insert({
      ...(idExplicito ? { id: idExplicito } : {}),
      sede_id: ctx.valor.sedeId,
      numero_corto: numeroCorto,
      canal: origen.canal,
      mesa_id: origen.canal === "mesa" ? origen.mesaId : null,
      cliente_id: origen.canal !== "mesa" ? (origen.clienteId ?? null) : null,
      vendedora_id: ctx.valor.vendedoraId,
    })
    .select("id")
    .single();
  if (errorPedido || !pedido) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos crear el pedido. Intenta de nuevo." });
  }

  const resultado = await confirmarItemsPedido(pedido.id, input);
  if (!resultado.ok) {
    await limpiarPedidoVacio(supabase, pedido.id);
    return resultado;
  }

  return ok({ pedidoId: pedido.id });
}

/** Cancela un pedido propio antes de cobrarlo (ej. el cliente se retira).
 *  Estado distinto de `anulado` -- ese es exclusivo de la reversión admin
 *  post-cobro (Bloque 8, CLAUDE.md §2.2). El RPC libera la mesa si aplica. */
export async function cancelarPedido(
  pedidoId: string,
  input: MotivoCancelacionInput,
): Promise<Result<null, DomainError>> {
  const ctx = await exigirVendedoraOCajera();
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

  revalidatePath(`/pedido/${pedidoId}`);
  revalidatePath("/inicio");
  return ok(null);
}
