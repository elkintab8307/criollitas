import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { FormularioMovimiento } from "@/components/caja/FormularioMovimiento";
import { formatearCOP } from "@/lib/money";

export default async function MovimientosPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.rol !== "cajera") {
    redirect("/login");
  }

  const { data: turno } = await supabase
    .from("turnos_caja")
    .select("id")
    .eq("cajera_id", user.id)
    .eq("estado", "abierto")
    .maybeSingle();
  if (!turno) {
    redirect("/turno/abrir");
  }

  const { data: movimientos } = await supabase
    .from("movimientos_caja")
    .select("id, tipo, concepto, monto_cop, creado_en")
    .eq("turno_id", turno.id)
    .order("creado_en", { ascending: false });

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Movimientos de caja</h1>
      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <FormularioMovimiento />
        <div className="flex flex-col gap-2">
          {(movimientos ?? []).map((m) => (
            <div key={m.id} className="rounded-clay-md bg-brand-crema-2 p-3 text-sm text-brand-chocolate">
              <p className="font-medium">{m.concepto}</p>
              <p className="text-brand-chocolate/70">{formatearCOP(BigInt(m.monto_cop))}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
