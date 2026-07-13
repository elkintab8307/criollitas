import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { FormularioCerrarTurno } from "@/components/caja/FormularioCerrarTurno";
import { calcularEsperado } from "@/lib/caja/arqueo";

export default async function CerrarTurnoPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.rol !== "cajera") {
    redirect("/login");
  }

  const { data: turno } = await supabase
    .from("turnos_caja")
    .select("id, efectivo_inicial_cop")
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

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Cerrar turno</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">Cuenta el efectivo en caja y declara el total.</p>
      <FormularioCerrarTurno esperadoCop={esperadoCop} />
    </main>
  );
}
