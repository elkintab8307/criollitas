import { createServerSupabase } from "@/lib/supabase/server";
import { ClayCard } from "@/components/ui/ClayCard";
import { MenuAdmin } from "@/components/menu/MenuAdmin";

export default async function MenuPage() {
  const supabase = await createServerSupabase();

  const [
    { data: categorias, error: errorCategorias },
    { data: productos, error: errorProductos },
    { data: modificadores, error: errorModificadores },
  ] = await Promise.all([
    supabase
      .from("categorias")
      .select("id, nombre, orden, activa")
      .eq("activa", true)
      .order("orden", { ascending: true }),
    supabase
      .from("productos")
      .select(
        "id, nombre, descripcion, precio_cop, imagen_url, activo, categoria_id, tiempo_prep_min",
      )
      .order("nombre", { ascending: true }),
    supabase
      .from("modificadores")
      .select("id, producto_id, grupo, nombre, precio_delta_cop, obligatorio, max_seleccion, activo"),
  ]);

  const huboError = !!(errorCategorias || errorProductos || errorModificadores);

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Menú</h1>
      <p className="mt-2 text-brand-crema/80">
        Administra las categorías, productos y modificadores de la sede.
      </p>
      {huboError ? (
        <ClayCard variant="flat" className="mt-6" role="alert">
          <p className="text-sm text-brand-tomate-2">
            No pudimos cargar el menú. Recarga la página o intenta más tarde.
          </p>
        </ClayCard>
      ) : (
        <MenuAdmin
          categorias={categorias ?? []}
          productos={productos ?? []}
          modificadores={modificadores ?? []}
        />
      )}
    </main>
  );
}
