"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { err, ok, type DomainError, type Result } from "@/lib/result";
import { createServerSupabase } from "@/lib/supabase/server";
import { montoDesdePesos, sumar } from "@/lib/money";
import { agruparProductosVendidos, desglosarPagosPorMetodo } from "@/lib/caja/arqueo";
import { efectivoInicialSchema, movimientoSchema, cierreTurnoSchema } from "@/lib/validations/turno";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";
import { ahoraBogota } from "@/lib/dates";
import {
  construirTicketArqueoHtml,
  construirTicketAperturaCajonHtml,
  construirTicketMovimientoHtml,
} from "@/lib/print/construirTicketCajaHtml";
import type { DatosImpresionCliente } from "@/app/(cajera)/cobrar/actions";

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

async function nombresCajeraYSede(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  cajeraId: string,
  sedeId: string,
): Promise<{ cajeraNombre: string; sedeNombre: string }> {
  const [{ data: usuarioFila }, { data: sedeFila }] = await Promise.all([
    supabase.from("usuarios").select("nombre").eq("id", cajeraId).single(),
    supabase.from("sedes").select("nombre").eq("id", sedeId).single(),
  ]);
  return {
    cajeraNombre: usuarioFila?.nombre ?? "Cajera",
    sedeNombre: sedeFila?.nombre ?? "Criollitas",
  };
}

/** Arma la tirilla de apertura de cajón y la registra en `impresiones` --
 *  la impresión real (abrir el diálogo del navegador) ocurre en el
 *  navegador de la cajera; ver lib/print/imprimirTicket.ts. */
export async function registrarAperturaCajon(): Promise<Result<DatosImpresionCliente, DomainError>> {
  const ctx = await exigirCajera();
  if (!ctx.ok) return ctx;
  const supabase = await createServerSupabase();

  const turno = await turnoAbiertoDe(supabase, ctx.valor.cajeraId);
  if (!turno) {
    return err({ codigo: "VALIDACION", mensaje: "No tienes un turno abierto" });
  }

  const { cajeraNombre, sedeNombre } = await nombresCajeraYSede(supabase, ctx.valor.cajeraId, ctx.valor.sedeId);
  const html = construirTicketAperturaCajonHtml({ sedeNombre, cajeraNombre, fecha: ahoraBogota() });

  const { data: impresionFila, error } = await supabase
    .from("impresiones")
    .insert({ turno_id: turno.id, tipo: "apertura_cajon", contenido_html: html })
    .select("id")
    .single();
  if (error || !impresionFila) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos registrar la apertura de caja. Intenta de nuevo." });
  }
  return ok({ impresionId: impresionFila.id, html });
}

/** Arma y registra la tirilla de arqueo tras cerrar el turno (CLAUDE.md
 *  §2.4). Relee la fila ya cerrada (no recalcula nada en TS) para que el
 *  papel refleje EXACTO lo que `cerrar_turno` calculó y guardó de forma
 *  atómica -- nunca lanza: el turno ya quedó cerrado, un fallo de aquí en
 *  adelante no debe aparentar que cerrarTurno falló (mismo criterio que
 *  prepararImpresionTirilla en cobrar/actions.ts). */
async function construirYRegistrarTicketArqueo(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  turnoId: string,
  cajeraId: string,
  sedeId: string,
): Promise<DatosImpresionCliente | null> {
  try {
    const { data: turnoFila } = await supabase
      .from("turnos_caja")
      .select("efectivo_inicial_cop, efectivo_declarado_cop, esperado_cop, diferencia_cop")
      .eq("id", turnoId)
      .single();
    if (
      !turnoFila ||
      turnoFila.efectivo_declarado_cop === null ||
      turnoFila.esperado_cop === null ||
      turnoFila.diferencia_cop === null
    ) {
      return null;
    }

    const [{ cajeraNombre, sedeNombre }, { data: pagos }, { data: movimientos }] = await Promise.all([
      nombresCajeraYSede(supabase, cajeraId, sedeId),
      supabase.from("pagos").select("monto_cop, metodo, pedido_id").eq("turno_id", turnoId),
      supabase.from("movimientos_caja").select("monto_cop, tipo, concepto").eq("turno_id", turnoId),
    ]);
    const ventasEfectivoCop = sumar(
      ...(pagos ?? []).filter((p) => p.metodo === "efectivo").map((p) => BigInt(p.monto_cop)),
    );
    const ventasOtroMedioCop = sumar(
      ...(pagos ?? []).filter((p) => p.metodo !== "efectivo").map((p) => BigInt(p.monto_cop)),
    );
    const desglosePagosOtroMedio = desglosarPagosPorMetodo(
      (pagos ?? []).map((p) => ({ metodo: p.metodo, montoCop: BigInt(p.monto_cop) })),
    );
    const salidasCop = sumar(
      ...(movimientos ?? []).filter((m) => m.tipo === "retiro" || m.tipo === "gasto").map((m) => BigInt(m.monto_cop)),
    );
    const entradasExtraCop = sumar(
      ...(movimientos ?? []).filter((m) => m.tipo === "ingreso_extra").map((m) => BigInt(m.monto_cop)),
    );
    const movimientosDetalle = (movimientos ?? []).map((m) => ({
      tipo: m.tipo,
      concepto: m.concepto,
      montoCop: BigInt(m.monto_cop),
    }));

    // Productos vendidos en el turno: un mismo pedido puede aparecer varias
    // veces en `pagos` (pago mixto), de ahí el Set para no duplicar sus ítems.
    const pedidoIdsCobrados = [...new Set((pagos ?? []).map((p) => p.pedido_id))];
    const { data: itemsVendidos } =
      pedidoIdsCobrados.length > 0
        ? await supabase
            .from("pedido_items")
            .select("producto_id, cantidad, subtotal_cop")
            .in("pedido_id", pedidoIdsCobrados)
        : { data: [] as { producto_id: string; cantidad: number; subtotal_cop: number }[] };
    const productoIdsVendidos = [...new Set((itemsVendidos ?? []).map((i) => i.producto_id))];
    const { data: productosFilas } = productoIdsVendidos.length
      ? await supabase.from("productos").select("id, nombre").in("id", productoIdsVendidos)
      : { data: [] as { id: string; nombre: string }[] };
    const nombrePorProductoId = new Map((productosFilas ?? []).map((p) => [p.id, p.nombre]));
    const productosVendidos = agruparProductosVendidos(
      (itemsVendidos ?? []).map((item) => ({
        productoId: item.producto_id,
        nombre: nombrePorProductoId.get(item.producto_id) ?? "Producto",
        cantidad: item.cantidad,
        subtotalCop: BigInt(item.subtotal_cop),
      })),
    );

    const html = construirTicketArqueoHtml({
      sedeNombre,
      cajeraNombre,
      fecha: ahoraBogota(),
      efectivoInicialCop: BigInt(turnoFila.efectivo_inicial_cop),
      ventasEfectivoCop,
      ventasOtroMedioCop,
      desglosePagosOtroMedio,
      salidasCop,
      entradasExtraCop,
      esperadoCop: BigInt(turnoFila.esperado_cop),
      efectivoDeclaradoCop: BigInt(turnoFila.efectivo_declarado_cop),
      diferenciaCop: BigInt(turnoFila.diferencia_cop),
      productosVendidos,
      movimientos: movimientosDetalle,
    });

    const { data: impresionFila } = await supabase
      .from("impresiones")
      .insert({ turno_id: turnoId, tipo: "tirilla_arqueo", contenido_html: html })
      .select("id")
      .single();
    if (!impresionFila) return null;

    return { impresionId: impresionFila.id, html };
  } catch (error) {
    console.error(`construirYRegistrarTicketArqueo falló para turno ${turnoId}:`, error);
    return null;
  }
}

/** Arma el comprobante de un movimiento de caja recién registrado y lo
 *  guarda en `impresiones` -- mismo criterio defensivo que
 *  construirYRegistrarTicketArqueo (el movimiento ya quedó guardado, un
 *  fallo de aquí en adelante no debe aparentar que registrarMovimiento
 *  falló). */
async function construirYRegistrarTicketMovimiento(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  turnoId: string,
  cajeraId: string,
  sedeId: string,
  datosMovimiento: { tipo: "retiro" | "gasto" | "ingreso_extra"; concepto: string; montoCop: bigint },
): Promise<DatosImpresionCliente | null> {
  try {
    const { cajeraNombre, sedeNombre } = await nombresCajeraYSede(supabase, cajeraId, sedeId);
    const html = construirTicketMovimientoHtml({
      sedeNombre,
      cajeraNombre,
      fecha: ahoraBogota(),
      tipo: datosMovimiento.tipo,
      concepto: datosMovimiento.concepto,
      montoCop: datosMovimiento.montoCop,
    });

    const { data: impresionFila } = await supabase
      .from("impresiones")
      .insert({ turno_id: turnoId, tipo: "comprobante_movimiento", contenido_html: html })
      .select("id")
      .single();
    if (!impresionFila) return null;

    return { impresionId: impresionFila.id, html };
  } catch (error) {
    console.error(`construirYRegistrarTicketMovimiento falló para turno ${turnoId}:`, error);
    return null;
  }
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
  const cookieStore = await cookies();
  cookieStore.set("turno_abierto", "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  revalidatePath("/mi-turno");
  return ok({ turnoId: data.id });
}

export async function registrarMovimiento(
  input: unknown,
): Promise<Result<{ impresion: DatosImpresionCliente | null }, DomainError>> {
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

  const montoCop = montoDesdePesos(parsed.data.montoPesos);
  const { error } = await supabase.from("movimientos_caja").insert({
    turno_id: turno.id,
    tipo: parsed.data.tipo,
    concepto: parsed.data.concepto,
    monto_cop: Number(montoCop),
  });
  if (error) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos registrar el movimiento. Intenta de nuevo." });
  }
  const impresion = await construirYRegistrarTicketMovimiento(supabase, turno.id, ctx.valor.cajeraId, ctx.valor.sedeId, {
    tipo: parsed.data.tipo,
    concepto: parsed.data.concepto,
    montoCop,
  });
  revalidatePath("/mi-turno");
  revalidatePath("/turno/movimientos");
  return ok({ impresion });
}

export async function cerrarTurno(
  input: unknown,
): Promise<Result<{ impresion: DatosImpresionCliente | null }, DomainError>> {
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
  const impresion = await construirYRegistrarTicketArqueo(supabase, turno.id, ctx.valor.cajeraId, ctx.valor.sedeId);
  const cookieStore = await cookies();
  cookieStore.delete("turno_abierto");
  revalidatePath("/mi-turno");
  return ok({ impresion });
}
