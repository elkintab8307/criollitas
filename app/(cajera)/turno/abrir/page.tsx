import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { FormularioAbrirTurno } from "@/components/caja/FormularioAbrirTurno";
import { BotonReimprimirArqueo } from "@/components/caja/BotonReimprimirArqueo";
import { ClayCard } from "@/components/ui/ClayCard";
import { buscarArqueoReimprimible } from "@/lib/caja/reimpresionArqueo";

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

  // Si la cajera acaba de cerrar un turno, ofrecerle reimprimir esa tirilla
  // de arqueo aquí mismo -- es la pantalla a la que cae tras cerrar y donde
  // más natural resulta pedir copias extra (pedido del usuario).
  const arqueo = await buscarArqueoReimprimible(supabase, user.id);

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Abrir turno</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">Declara el efectivo con el que empiezas la caja.</p>
      {arqueo.estado === "ok" ? (
        <ClayCard variant="flat" className="mb-6 max-w-sm">
          <p className="mb-3 text-sm text-brand-chocolate/80">
            Cerraste un turno hace poco. ¿Necesitas más copias de la tirilla de cierre?
          </p>
          <BotonReimprimirArqueo />
        </ClayCard>
      ) : null}
      <FormularioAbrirTurno />
    </main>
  );
}
