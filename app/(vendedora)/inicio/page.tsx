import { createServerSupabase } from "@/lib/supabase/server";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";
import { ClayCard } from "@/components/ui/ClayCard";
import { SelectorOrigen } from "@/components/pedido/SelectorOrigen";
import type { MesaVista } from "@/components/mesas/tipos";

// Fallback solo si el JWT no trae `app_metadata.sede_id` (mismo criterio que
// `app/(admin)/mesas/page.tsx`): la fuente de verdad es la sesión.
const SEDE_ID_FALLBACK = process.env.NEXT_PUBLIC_SEDE_ID ?? SEDE_DEFAULT_ID;

export default async function InicioPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const sedeId = (user?.app_metadata?.sede_id as string | undefined) ?? SEDE_ID_FALLBACK;

  const { data, error } = await supabase
    .from("mesas")
    .select("id, numero, nombre, capacidad, estado, activa")
    .eq("activa", true)
    .order("numero", { ascending: true });

  const mesas = (data ?? []) as MesaVista[];

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Nuevo pedido</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">Elige el origen del pedido para empezar.</p>
      {error ? (
        <ClayCard variant="flat" role="alert">
          <p className="text-sm text-brand-tomate-2">
            No pudimos cargar las mesas. Recarga la página o intenta más tarde.
          </p>
        </ClayCard>
      ) : (
        <SelectorOrigen mesasIniciales={mesas} sedeId={sedeId} />
      )}
    </main>
  );
}
