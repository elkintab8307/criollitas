import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { ColaCobro } from "@/components/caja/ColaCobro";
import { VentasDelTurno, type PedidoCobradoVista } from "@/components/caja/VentasDelTurno";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";
import { calcularEsperado } from "@/lib/caja/arqueo";
import { formatearCOP } from "@/lib/money";
import type { PedidoColaVista } from "@/components/caja/tipos";

export default async function PedidosCajaPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.rol !== "cajera") {
    redirect("/login");
  }
  const sedeId = (user.app_metadata?.sede_id as string | undefined) ?? SEDE_DEFAULT_ID;

  // Efectivo esperado en caja ahora mismo -- se recalcula en cada visita a
  // esta página, y FormularioCobro redirige aquí justo después de cada
  // cobro, así que la cajera lo ve actualizado tras cada pago. Mismo cálculo
  // que /mi-turno (lib/caja/arqueo.ts, misma fórmula que el RPC cerrar_turno).
  const { data: turno } = await supabase
    .from("turnos_caja")
    .select("id, efectivo_inicial_cop")
    .eq("cajera_id", user.id)
    .eq("estado", "abierto")
    .maybeSingle();

  let esperadoCop: bigint | null = null;
  let cobradosDelTurno: PedidoCobradoVista[] = [];
  let totalVentasTurnoCop = 0n;
  if (turno) {
    const { data: pagos } = await supabase
      .from("pagos")
      .select("monto_cop, metodo, pedido_id, creado_en")
      .eq("turno_id", turno.id)
      .order("creado_en", { ascending: false });
    const { data: movimientos } = await supabase
      .from("movimientos_caja")
      .select("monto_cop, tipo")
      .eq("turno_id", turno.id);

    esperadoCop = calcularEsperado({
      efectivoInicialCop: BigInt(turno.efectivo_inicial_cop),
      pagosEfectivoCop: (pagos ?? []).filter((p) => p.metodo === "efectivo").map((p) => BigInt(p.monto_cop)),
      retirosCop: (movimientos ?? []).filter((m) => m.tipo === "retiro").map((m) => BigInt(m.monto_cop)),
      gastosCop: (movimientos ?? []).filter((m) => m.tipo === "gasto").map((m) => BigInt(m.monto_cop)),
      ingresosExtraCop: (movimientos ?? []).filter((m) => m.tipo === "ingreso_extra").map((m) => BigInt(m.monto_cop)),
    });

    // Ventas del turno: los pagos del turno agrupados por pedido (fuente
    // de verdad de "qué se cobró en ESTE turno" -- pedidos.estado no
    // distingue turnos). Un pago mixto suma sus filas al mismo pedido.
    const pagosPorPedido = new Map<string, { totalCop: bigint; metodos: Set<string>; creadoEn: string }>();
    for (const pago of pagos ?? []) {
      const actual = pagosPorPedido.get(pago.pedido_id);
      if (actual) {
        actual.totalCop += BigInt(pago.monto_cop);
        actual.metodos.add(pago.metodo);
      } else {
        pagosPorPedido.set(pago.pedido_id, {
          totalCop: BigInt(pago.monto_cop),
          metodos: new Set([pago.metodo]),
          creadoEn: pago.creado_en,
        });
      }
    }
    const pedidoIdsCobrados = [...pagosPorPedido.keys()];
    const { data: pedidosCobradosFilas } = pedidoIdsCobrados.length
      ? await supabase.from("pedidos").select("id, numero_corto, canal, mesa_id").in("id", pedidoIdsCobrados)
      : { data: [] as { id: string; numero_corto: number; canal: string; mesa_id: string | null }[] };
    const infoPedidoPorId = new Map((pedidosCobradosFilas ?? []).map((p) => [p.id, p]));

    const mesaIdsCobrados = [
      ...new Set((pedidosCobradosFilas ?? []).map((p) => p.mesa_id).filter((id): id is string => !!id)),
    ];
    const { data: mesasCobradasFilas } = mesaIdsCobrados.length
      ? await supabase.from("mesas").select("id, numero").in("id", mesaIdsCobrados)
      : { data: [] as { id: string; numero: number }[] };
    const numeroMesaCobradaPorId = new Map((mesasCobradasFilas ?? []).map((m) => [m.id, m.numero]));

    cobradosDelTurno = pedidoIdsCobrados.map((pedidoId) => {
      const agregado = pagosPorPedido.get(pedidoId)!;
      const info = infoPedidoPorId.get(pedidoId);
      return {
        pedidoId,
        numeroCorto: info?.numero_corto ?? 0,
        canal: info?.canal ?? "llevar",
        mesaNumero: info?.mesa_id ? (numeroMesaCobradaPorId.get(info.mesa_id) ?? null) : null,
        totalCop: Number(agregado.totalCop),
        metodos: [...agregado.metodos],
        cobradoEn: agregado.creadoEn,
      };
    });
    totalVentasTurnoCop = [...pagosPorPedido.values()].reduce((acc, p) => acc + p.totalCop, 0n);
  }

  const { data: pedidosFilas } = await supabase
    .from("pedidos")
    .select("id, numero_corto, canal, estado, mesa_id, cliente_id, total_cop")
    .in("estado", ["listo", "entregado"])
    .order("numero_corto", { ascending: true });

  const mesaIds = [...new Set((pedidosFilas ?? []).map((p) => p.mesa_id).filter((id): id is string => !!id))];
  const { data: mesasFilas } = mesaIds.length
    ? await supabase.from("mesas").select("id, numero").in("id", mesaIds)
    : { data: [] as { id: string; numero: number }[] };
  const numeroMesaPorId = new Map((mesasFilas ?? []).map((m) => [m.id, m.numero]));

  const clienteIds = [...new Set((pedidosFilas ?? []).map((p) => p.cliente_id).filter((id): id is string => !!id))];
  const { data: clientesFilas } = clienteIds.length
    ? await supabase.from("clientes_domicilio").select("id, nombre").in("id", clienteIds)
    : { data: [] as { id: string; nombre: string }[] };
  const nombreClientePorId = new Map((clientesFilas ?? []).map((c) => [c.id, c.nombre]));

  const pedidos: PedidoColaVista[] = (pedidosFilas ?? []).map((p) => ({
    id: p.id,
    numeroCorto: p.numero_corto,
    canal: p.canal as PedidoColaVista["canal"],
    estado: p.estado as PedidoColaVista["estado"],
    mesaNumero: p.mesa_id ? (numeroMesaPorId.get(p.mesa_id) ?? null) : null,
    clienteNombre: p.cliente_id ? (nombreClientePorId.get(p.cliente_id) ?? null) : null,
    totalCop: p.total_cop,
  }));

  return (
    <main className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl text-brand-mostaza">Pedidos por cobrar</h1>
        {esperadoCop !== null ? (
          <p className="font-display text-lg text-brand-crema">
            Efectivo esperado en caja:{" "}
            <span className="font-mono font-semibold text-brand-mostaza">{formatearCOP(esperadoCop)}</span>
          </p>
        ) : null}
      </div>
      <div className="mt-6">
        <ColaCobro pedidosIniciales={pedidos} sedeId={sedeId} />
      </div>
      {turno ? (
        <div className="mt-8">
          <VentasDelTurno cobrados={cobradosDelTurno} totalVentasCop={Number(totalVentasTurnoCop)} />
        </div>
      ) : null}
    </main>
  );
}
