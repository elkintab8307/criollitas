import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { ClayButton } from "@/components/ui/ClayButton";
import { formatearCOP, sumar } from "@/lib/money";
import { calcularEsperado, desglosarPagosPorMetodo } from "@/lib/caja/arqueo";
import { formatearFecha } from "@/lib/dates";
import { DesgloseMetodosPago } from "@/components/caja/DesgloseMetodosPago";
import { SincronizarTurnoLocal } from "@/components/offline/SincronizarTurnoLocal";

export default async function MiTurnoPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.rol !== "cajera") {
    redirect("/login");
  }

  const { data: turno } = await supabase
    .from("turnos_caja")
    .select("id, abierto_en, efectivo_inicial_cop")
    .eq("cajera_id", user.id)
    .eq("estado", "abierto")
    .maybeSingle();
  if (!turno) {
    redirect("/turno/abrir");
  }

  const { data: pagos } = await supabase
    .from("pagos")
    .select("monto_cop, metodo")
    .eq("turno_id", turno.id);
  const desglosePagosOtroMedio = desglosarPagosPorMetodo(
    (pagos ?? []).map((p) => ({ metodo: p.metodo, montoCop: BigInt(p.monto_cop) })),
  );
  const { data: movimientos } = await supabase
    .from("movimientos_caja")
    .select("monto_cop, tipo")
    .eq("turno_id", turno.id);

  const retirosCop = (movimientos ?? []).filter((m) => m.tipo === "retiro").map((m) => BigInt(m.monto_cop));
  const gastosCop = (movimientos ?? []).filter((m) => m.tipo === "gasto").map((m) => BigInt(m.monto_cop));
  const ingresosExtraCop = (movimientos ?? []).filter((m) => m.tipo === "ingreso_extra").map((m) => BigInt(m.monto_cop));

  const esperadoCop = calcularEsperado({
    efectivoInicialCop: BigInt(turno.efectivo_inicial_cop),
    pagosEfectivoCop: (pagos ?? []).filter((p) => p.metodo === "efectivo").map((p) => BigInt(p.monto_cop)),
    retirosCop,
    gastosCop,
    ingresosExtraCop,
  });
  const ventasOtroMedioCop = sumar(
    ...(pagos ?? []).filter((p) => p.metodo !== "efectivo").map((p) => BigInt(p.monto_cop)),
  );
  const salidasCop = sumar(...retirosCop, ...gastosCop);
  const entradasExtraCop = sumar(...ingresosExtraCop);

  return (
    <main className="p-8">
      <SincronizarTurnoLocal
        turnoId={turno.id}
        efectivoInicialCop={turno.efectivo_inicial_cop}
        abiertoEn={turno.abierto_en}
      />
      <h1 className="font-display text-3xl text-brand-mostaza">Mi turno</h1>
      <p className="mt-2 text-brand-crema/80">
        Abierto el {formatearFecha(new Date(turno.abierto_en))} con{" "}
        {formatearCOP(BigInt(turno.efectivo_inicial_cop))} de efectivo inicial.
      </p>
      <p className="mt-2 text-lg text-brand-crema">
        Efectivo esperado ahora: <span className="font-mono font-semibold">{formatearCOP(esperadoCop)}</span>
      </p>
      <p className="mt-1 text-sm text-brand-crema/70">
        Ventas por otro medio de pago (Nequi, datáfono, etc.):{" "}
        <span className="font-mono font-semibold">{formatearCOP(ventasOtroMedioCop)}</span> — no afectan el cuadre
        de caja.
      </p>
      <div className="mt-2 max-w-xs rounded-clay-md bg-surface-sunken p-3">
        <DesgloseMetodosPago desglose={desglosePagosOtroMedio} />
      </div>
      <div className="mt-4 flex max-w-xs flex-col gap-1 rounded-clay-md bg-surface-sunken p-3">
        <p className="text-sm text-brand-chocolate/70">Movimientos de caja del turno:</p>
        <p className="flex justify-between text-sm text-brand-chocolate/70">
          <span>Salidas (retiros y gastos)</span>
          <span className="font-mono font-semibold text-brand-tomate-2">-{formatearCOP(salidasCop)}</span>
        </p>
        <p className="flex justify-between text-sm text-brand-chocolate/70">
          <span>Entradas extra</span>
          <span className="font-mono font-semibold text-brand-verde-2">{formatearCOP(entradasExtraCop)}</span>
        </p>
        <Link href="/turno/movimientos" className="mt-1 text-xs text-brand-chocolate/60 underline">
          Ver detalle de movimientos
        </Link>
      </div>
      <div className="mt-6 flex gap-3">
        <Link href="/pedidos">
          <ClayButton type="button" variant="primary">Cobrar pedidos</ClayButton>
        </Link>
        <Link href="/turno/movimientos">
          <ClayButton type="button" variant="secondary">Registrar movimiento</ClayButton>
        </Link>
        <Link href="/turno/cerrar">
          <ClayButton type="button" variant="destructive">Cerrar turno</ClayButton>
        </Link>
      </div>
    </main>
  );
}
