import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { FormularioMovimiento } from "@/components/caja/FormularioMovimiento";
import { ClayBadge } from "@/components/ui/ClayBadge";
import { formatearCOP } from "@/lib/money";
import { formatearHora } from "@/lib/dates";
import { calcularEsperado } from "@/lib/caja/arqueo";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";

const ETIQUETA_TIPO: Record<string, string> = {
  retiro: "Retiro",
  gasto: "Gasto",
  ingreso_extra: "Ingreso extra",
};

export default async function MovimientosPage() {
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

  const [{ data: usuarioFila }, { data: sedeFila }, { data: pagos }, { data: movimientos }] = await Promise.all([
    supabase.from("usuarios").select("nombre").eq("id", user.id).single(),
    supabase.from("sedes").select("nombre").eq("id", sedeId).single(),
    supabase.from("pagos").select("monto_cop, metodo").eq("turno_id", turno.id),
    supabase
      .from("movimientos_caja")
      .select("id, tipo, concepto, monto_cop, creado_en")
      .eq("turno_id", turno.id)
      .order("creado_en", { ascending: false }),
  ]);
  const cajeraNombre = usuarioFila?.nombre ?? "Cajera";
  const sedeNombre = sedeFila?.nombre ?? "Criollitas";

  // "Dinero actual en caja" -- mismo cálculo que /mi-turno (lib/caja/arqueo.ts):
  // retiros y gastos restan, ingresos extra suman.
  const dineroEnCajaCop = calcularEsperado({
    efectivoInicialCop: BigInt(turno.efectivo_inicial_cop),
    pagosEfectivoCop: (pagos ?? []).filter((p) => p.metodo === "efectivo").map((p) => BigInt(p.monto_cop)),
    retirosCop: (movimientos ?? []).filter((m) => m.tipo === "retiro").map((m) => BigInt(m.monto_cop)),
    gastosCop: (movimientos ?? []).filter((m) => m.tipo === "gasto").map((m) => BigInt(m.monto_cop)),
    ingresosExtraCop: (movimientos ?? []).filter((m) => m.tipo === "ingreso_extra").map((m) => BigInt(m.monto_cop)),
  });

  return (
    <main className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl text-brand-mostaza">Movimientos de caja</h1>
        <p className="font-display text-lg text-brand-crema">
          Dinero en caja ahora:{" "}
          <span className="font-mono font-semibold text-brand-mostaza">{formatearCOP(dineroEnCajaCop)}</span>
        </p>
      </div>
      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <FormularioMovimiento sedeNombre={sedeNombre} cajeraNombre={cajeraNombre} />
        <div className="flex flex-col gap-2">
          {(movimientos ?? []).length === 0 ? (
            <p className="text-sm text-text-secondary">Sin movimientos en este turno todavía.</p>
          ) : null}
          {(movimientos ?? []).map((m) => {
            const esEntrada = m.tipo === "ingreso_extra";
            return (
              <div
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-clay-md bg-brand-crema-2 p-3 text-sm text-brand-chocolate"
              >
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <ClayBadge variant={esEntrada ? "exito" : "peligro"}>
                      {ETIQUETA_TIPO[m.tipo] ?? m.tipo}
                    </ClayBadge>
                    <span className="text-xs text-brand-chocolate/60">{formatearHora(new Date(m.creado_en))}</span>
                  </div>
                  <p className="font-medium">{m.concepto}</p>
                </div>
                <p className={`font-mono font-semibold ${esEntrada ? "text-brand-verde-2" : "text-brand-tomate-2"}`}>
                  {esEntrada ? "+" : "-"}
                  {formatearCOP(BigInt(m.monto_cop))}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
