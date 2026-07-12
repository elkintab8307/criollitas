import { createServerSupabase } from "@/lib/supabase/server";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";
import { ClayCard } from "@/components/ui/ClayCard";
import { GrillaMesas } from "@/components/mesas/GrillaMesas";
import type { MesaVista } from "@/components/mesas/tipos";

// Fallback solo si el JWT no trae `app_metadata.sede_id` (no debería pasar en operación
// normal). La fuente de verdad es la sesión, no la variable de entorno del dispositivo:
// el env var puede quedar mal configurado y desincronizar el canal Realtime de los datos
// realmente visibles vía RLS (mismo criterio que `exigirAdmin` en actions.ts).
const SEDE_ID_FALLBACK = process.env.NEXT_PUBLIC_SEDE_ID ?? SEDE_DEFAULT_ID;

export default async function MesasPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const sedeId = (user?.app_metadata?.sede_id as string | undefined) ?? SEDE_ID_FALLBACK;

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
        <GrillaMesas mesasIniciales={mesas} sedeId={sedeId} puedeEditar />
      )}
    </main>
  );
}
