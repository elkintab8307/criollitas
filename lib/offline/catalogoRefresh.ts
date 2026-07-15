import { createClient } from "@/lib/supabase/client";
import { guardarEnCatalogo } from "@/lib/offline/catalogo";

/** Refresca la copia local del catálogo (menú y mesas) que los bloques
 *  offline de pedidos usarán para operar sin conexión. Se llama solo
 *  mientras hay internet -- ver components/offline/ActualizadorCatalogo.tsx
 *  para cuándo se dispara. Sin sesión no se hace nada (ni siquiera se
 *  intenta la consulta): `productos`/`categorias`/`modificadores`/`mesas`
 *  exigen RLS `to authenticated`, así que sin sesión Supabase devuelve 0
 *  filas (no un error) -- guardar eso sobrescribiría un catálogo bueno ya
 *  cacheado con uno vacío (bug real encontrado con verificación en
 *  navegador: este componente se monta en el layout raíz, así que corre
 *  también en /login, antes de que exista sesión). Sin test unitario
 *  dedicado (llamadas reales a Supabase desde el navegador). */
export async function refrescarCatalogo(): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const [{ data: categorias }, { data: productos }, { data: modificadores }, { data: mesas }] =
    await Promise.all([
      supabase
        .from("categorias")
        .select("id, nombre, orden, activa")
        .eq("activa", true)
        .order("orden", { ascending: true }),
      supabase
        .from("productos")
        .select("id, nombre, descripcion, precio_cop, imagen_url, activo, categoria_id, tiempo_prep_min")
        .eq("activo", true),
      supabase
        .from("modificadores")
        .select("id, producto_id, grupo, nombre, precio_delta_cop, obligatorio, max_seleccion, activo")
        .eq("activo", true),
      supabase
        .from("mesas")
        .select("id, numero, nombre, capacidad, estado, activa")
        .eq("activa", true)
        .order("numero", { ascending: true }),
    ]);

  await guardarEnCatalogo("categorias", categorias ?? []);
  await guardarEnCatalogo("productos", productos ?? []);
  await guardarEnCatalogo("modificadores", modificadores ?? []);
  await guardarEnCatalogo("mesas", mesas ?? []);
}
