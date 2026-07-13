import { createServerSupabase } from "@/lib/supabase/server";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";
import { PedidoNuevoEditor } from "@/components/pedido/PedidoNuevoEditor";
import type { CategoriaFila, ModificadorFila, ProductoFila } from "@/components/menu/types";
import type { OrigenPedido } from "@/app/(vendedora)/pedido/actions";

interface PageProps {
  searchParams: Promise<{ mesaId?: string; canal?: string; clienteId?: string }>;
}

export default async function PedidoNuevoPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabase();

  let origen: OrigenPedido;
  let tituloOrigen = "Nuevo pedido";

  if (params.mesaId) {
    const { data: mesaFila } = await supabase.from("mesas").select("numero").eq("id", params.mesaId).single();
    origen = { canal: "mesa", mesaId: params.mesaId };
    tituloOrigen = mesaFila ? `Mesa ${mesaFila.numero}` : "Mesa";
  } else if (params.canal === "domicilio" && params.clienteId) {
    const { data: clienteFila } = await supabase
      .from("clientes_domicilio")
      .select("nombre")
      .eq("id", params.clienteId)
      .single();
    origen = { canal: "domicilio", clienteId: params.clienteId };
    tituloOrigen = clienteFila ? clienteFila.nombre : "Domicilio";
  } else {
    origen = { canal: "llevar" };
    tituloOrigen = "Para llevar";
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const sedeId = (user?.app_metadata?.sede_id as string | undefined) ?? SEDE_DEFAULT_ID;
  const { data: sedeFila } = await supabase.from("sedes").select("usa_cocina").eq("id", sedeId).maybeSingle();
  const usaCocina = sedeFila?.usa_cocina !== false;

  const { data: categoriasFilas } = await supabase
    .from("categorias")
    .select("id, nombre, orden, activa")
    .eq("activa", true)
    .order("orden", { ascending: true });
  const { data: productosFilas } = await supabase
    .from("productos")
    .select("id, nombre, descripcion, precio_cop, imagen_url, activo, categoria_id, tiempo_prep_min")
    .eq("activo", true);
  const { data: modificadoresFilas } = await supabase
    .from("modificadores")
    .select("id, producto_id, grupo, nombre, precio_delta_cop, obligatorio, max_seleccion, activo")
    .eq("activo", true);

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Nuevo pedido — {tituloOrigen}</h1>
      <div className="mt-6">
        <PedidoNuevoEditor
          origen={origen}
          categorias={(categoriasFilas ?? []) as CategoriaFila[]}
          productos={(productosFilas ?? []) as ProductoFila[]}
          modificadores={(modificadoresFilas ?? []) as ModificadorFila[]}
          usaCocina={usaCocina}
        />
      </div>
    </main>
  );
}
