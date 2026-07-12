import { createServerSupabase } from "@/lib/supabase/server";
import { MenuAdmin } from "@/components/menu/MenuAdmin";

export default async function MenuPage() {
  const supabase = await createServerSupabase();

  const [{ data: categorias }, { data: productos }, { data: modificadores }] = await Promise.all([
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

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Menú</h1>
      <p className="mt-2 text-brand-crema/80">
        Administra las categorías, productos y modificadores de la sede.
      </p>
      <MenuAdmin
        categorias={categorias ?? []}
        productos={productos ?? []}
        modificadores={modificadores ?? []}
      />
    </main>
  );
}
