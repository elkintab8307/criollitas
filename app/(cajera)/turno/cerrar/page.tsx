import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { FormularioCerrarTurno } from "@/components/caja/FormularioCerrarTurno";
import { BotonAbrirCaja } from "@/components/caja/BotonAbrirCaja";
import { agruparProductosVendidos, calcularEsperado, desglosarPagosPorMetodo } from "@/lib/caja/arqueo";
import { sumar } from "@/lib/money";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";

export default async function CerrarTurnoPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.rol !== "cajera") {
    redirect("/login");
  }
  const sedeId = (user.app_metadata?.sede_id as string | undefined) ?? SEDE_DEFAULT_ID;

  const { data: turno } = await supabase
    .from("turnos_caja")
    .select("id, efectivo_inicial_cop")
    .eq("cajera_id", user.id)
    .eq("estado", "abierto")
    .maybeSingle();
  if (!turno) {
    redirect("/turno/abrir");
  }

  const [{ data: usuarioFila }, { data: sedeFila }] = await Promise.all([
    supabase.from("usuarios").select("nombre").eq("id", user.id).single(),
    supabase.from("sedes").select("nombre").eq("id", sedeId).single(),
  ]);
  const cajeraNombre = usuarioFila?.nombre ?? "Cajera";
  const sedeNombre = sedeFila?.nombre ?? "Criollitas";

  const { data: pagos } = await supabase
    .from("pagos")
    .select("monto_cop, metodo, pedido_id")
    .eq("turno_id", turno.id);
  const { data: movimientos } = await supabase
    .from("movimientos_caja")
    .select("monto_cop, tipo, concepto")
    .eq("turno_id", turno.id);

  const pagosEfectivoCop = (pagos ?? []).filter((p) => p.metodo === "efectivo").map((p) => BigInt(p.monto_cop));
  const pagosOtroMedioCop = (pagos ?? []).filter((p) => p.metodo !== "efectivo").map((p) => BigInt(p.monto_cop));
  const retirosCop = (movimientos ?? []).filter((m) => m.tipo === "retiro").map((m) => BigInt(m.monto_cop));
  const gastosCop = (movimientos ?? []).filter((m) => m.tipo === "gasto").map((m) => BigInt(m.monto_cop));
  const ingresosExtraCop = (movimientos ?? []).filter((m) => m.tipo === "ingreso_extra").map((m) => BigInt(m.monto_cop));

  const esperadoCop = calcularEsperado({
    efectivoInicialCop: BigInt(turno.efectivo_inicial_cop),
    pagosEfectivoCop,
    retirosCop,
    gastosCop,
    ingresosExtraCop,
  });
  const ventasEfectivoCop = sumar(...pagosEfectivoCop);
  const ventasOtroMedioCop = sumar(...pagosOtroMedioCop);
  const desglosePagosOtroMedio = desglosarPagosPorMetodo(
    (pagos ?? []).map((p) => ({ metodo: p.metodo, montoCop: BigInt(p.monto_cop) })),
  );
  const salidasCop = sumar(...retirosCop, ...gastosCop);
  const entradasExtraCop = sumar(...ingresosExtraCop);
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
      ? await supabase.from("pedido_items").select("producto_id, cantidad, subtotal_cop").in("pedido_id", pedidoIdsCobrados)
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

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Cerrar turno</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">Cuenta el efectivo en caja y declara el total.</p>
      <div className="mb-6">
        <BotonAbrirCaja sedeNombre={sedeNombre} cajeraNombre={cajeraNombre} />
      </div>
      <FormularioCerrarTurno
        efectivoInicialCop={BigInt(turno.efectivo_inicial_cop)}
        esperadoCop={esperadoCop}
        ventasEfectivoCop={ventasEfectivoCop}
        ventasOtroMedioCop={ventasOtroMedioCop}
        desglosePagosOtroMedio={desglosePagosOtroMedio}
        salidasCop={salidasCop}
        entradasExtraCop={entradasExtraCop}
        productosVendidos={productosVendidos}
        movimientos={movimientosDetalle}
        sedeNombre={sedeNombre}
        cajeraNombre={cajeraNombre}
      />
    </main>
  );
}
