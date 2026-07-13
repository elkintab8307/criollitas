import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { FormularioAbrirTurno } from "@/components/caja/FormularioAbrirTurno";

export default async function AbrirTurnoPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.rol !== "cajera") {
    redirect("/login");
  }

  const { data: turnoAbierto } = await supabase
    .from("turnos_caja")
    .select("id")
    .eq("cajera_id", user.id)
    .eq("estado", "abierto")
    .maybeSingle();
  if (turnoAbierto) {
    redirect("/mi-turno");
  }

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Abrir turno</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">Declara el efectivo con el que empiezas la caja.</p>
      <FormularioAbrirTurno />
    </main>
  );
}
