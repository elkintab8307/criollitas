import { createServerSupabase } from "@/lib/supabase/server";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";
import { ClayCard } from "@/components/ui/ClayCard";
import { GrillaMesas } from "@/components/mesas/GrillaMesas";
import type { MesaVista } from "@/components/mesas/tipos";

const SEDE_ID = process.env.NEXT_PUBLIC_SEDE_ID ?? SEDE_DEFAULT_ID;

export default async function MesasPage() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("mesas")
    .select("id, numero, nombre, capacidad, estado, activa")
    .order("numero", { ascending: true });

  const mesas = (data ?? []) as MesaVista[];

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Mesas</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">
        Gestiona las mesas del salón y observa su estado.
      </p>
      {error ? (
        <ClayCard variant="flat" role="alert">
          <p className="text-sm text-brand-tomate-2">
            No pudimos cargar las mesas. Recarga la página o intenta más tarde.
          </p>
        </ClayCard>
      ) : (
        <GrillaMesas mesasIniciales={mesas} sedeId={SEDE_ID} puedeEditar />
      )}
    </main>
  );
}
