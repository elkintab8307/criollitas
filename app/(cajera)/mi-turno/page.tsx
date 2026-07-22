import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { ClayButton } from "@/components/ui/ClayButton";
import { formatearCOP, sumar } from "@/lib/money";
import { calcularEsperado, desglosarPagosPorMetodo } from "@/lib/caja/arqueo";
import { DesgloseMetodosPago } from "@/components/caja/DesgloseMetodosPago";

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

  const esperadoCop = calcularEsperado({
    efectivoInicialCop: BigInt(turno.efectivo_inicial_cop),
    pagosEfectivoCop: (pagos ?? []).filter((p) => p.metodo === "efectivo").map((p) => BigInt(p.monto_cop)),
    retirosCop: (movimientos ?? []).filter((m) => m.tipo === "retiro").map((m) => BigInt(m.monto_cop)),
    gastosCop: (movimientos ?? []).filter((m) => m.tipo === "gasto").map((m) => BigInt(m.monto_cop)),
    ingresosExtraCop: (movimientos ?? []).filter((m) => m.tipo === "ingreso_extra").map((m) => BigInt(m.monto_cop)),
  });
  const ventasOtroMedioCop = sumar(
    ...(pagos ?? []).filter((p) => p.metodo !== "efectivo").map((p) => BigInt(p.monto_cop)),
  );

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Mi turno</h1>
      <p className="mt-2 text-brand-crema/80">
        Abierto con {formatearCOP(BigInt(turno.efectivo_inicial_cop))} de efectivo inicial.
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
