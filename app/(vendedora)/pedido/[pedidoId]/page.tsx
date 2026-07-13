import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { PedidoEditor } from "@/components/pedido/PedidoEditor";
import type { CategoriaFila, ModificadorFila, ProductoFila } from "@/components/menu/types";
import type { ItemConfirmadoVista, PedidoVista } from "@/components/pedido/tipos";

interface PageProps {
  params: Promise<{ pedidoId: string }>;
}

export default async function PedidoPage({ params }: PageProps) {
  const { pedidoId } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: pedidoFila } = await supabase
    .from("pedidos")
    .select("id, numero_corto, canal, estado, subtotal_cop, total_cop, mesa_id, cliente_id, vendedora_id")
    .eq("id", pedidoId)
    .single();

  if (!pedidoFila || pedidoFila.vendedora_id !== user?.id) {
    notFound();
  }

  let mesaNumero: number | null = null;
  if (pedidoFila.mesa_id) {
    const { data: mesaFila } = await supabase
      .from("mesas")
      .select("numero")
      .eq("id", pedidoFila.mesa_id)
      .single();
    mesaNumero = mesaFila?.numero ?? null;
  }

  let clienteNombre: string | null = null;
  if (pedidoFila.cliente_id) {
    const { data: clienteFila } = await supabase
      .from("clientes_domicilio")
      .select("nombre")
      .eq("id", pedidoFila.cliente_id)
      .single();
    clienteNombre = clienteFila?.nombre ?? null;
  }

  const pedido: PedidoVista = {
    id: pedidoFila.id,
    numeroCorto: pedidoFila.numero_corto,
    canal: pedidoFila.canal,
    estado: pedidoFila.estado,
    mesaNumero,
    clienteNombre,
    subtotalCop: pedidoFila.subtotal_cop,
    totalCop: pedidoFila.total_cop,
  };

  const { data: itemsFilas } = await supabase
    .from("pedido_items")
    .select("id, producto_id, cantidad, precio_unit_cop, subtotal_cop, notas, estado_item")
    .eq("pedido_id", pedidoId);

  const productoIdsUsados = [...new Set((itemsFilas ?? []).map((i) => i.producto_id))];
  const { data: productosUsados } = productoIdsUsados.length
    ? await supabase.from("productos").select("id, nombre").in("id", productoIdsUsados)
    : { data: [] as { id: string; nombre: string }[] };
  const nombreProductoPorId = new Map((productosUsados ?? []).map((p) => [p.id, p.nombre]));

  const itemIds = (itemsFilas ?? []).map((i) => i.id);
  const { data: modsFilas } = itemIds.length
    ? await supabase
        .from("pedido_item_mods")
        .select("id, pedido_item_id, modificador_id, precio_delta_cop")
        .in("pedido_item_id", itemIds)
    : {
        data: [] as { id: string; pedido_item_id: string; modificador_id: string; precio_delta_cop: number }[],
      };
  const modificadorIdsUsados = [...new Set((modsFilas ?? []).map((m) => m.modificador_id))];
  const { data: modificadoresUsados } = modificadorIdsUsados.length
    ? await supabase.from("modificadores").select("id, nombre").in("id", modificadorIdsUsados)
    : { data: [] as { id: string; nombre: string }[] };
  const nombreModificadorPorId = new Map((modificadoresUsados ?? []).map((m) => [m.id, m.nombre]));

  const itemsConfirmados: ItemConfirmadoVista[] = (itemsFilas ?? []).map((fila) => ({
    id: fila.id,
    productoNombre: nombreProductoPorId.get(fila.producto_id) ?? "Producto",
    cantidad: fila.cantidad,
    precioUnitCop: fila.precio_unit_cop,
    subtotalCop: fila.subtotal_cop,
    notas: fila.notas,
    estadoItem: fila.estado_item,
    modificadores: (modsFilas ?? [])
      .filter((m) => m.pedido_item_id === fila.id)
      .map((m) => ({
        nombre: nombreModificadorPorId.get(m.modificador_id) ?? "Adicional",
        precioDeltaCop: m.precio_delta_cop,
      })),
  }));

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
      <h1 className="font-display text-3xl text-brand-mostaza">
        Pedido #{pedido.numeroCorto}
        {pedido.mesaNumero ? ` — Mesa ${pedido.mesaNumero}` : null}
        {pedido.clienteNombre ? ` — ${pedido.clienteNombre}` : null}
        {pedido.canal === "llevar" ? " — Para llevar" : null}
      </h1>
      <div className="mt-6">
        <PedidoEditor
          pedido={pedido}
          itemsConfirmados={itemsConfirmados}
          categorias={(categoriasFilas ?? []) as CategoriaFila[]}
          productos={(productosFilas ?? []) as ProductoFila[]}
          modificadores={(modificadoresFilas ?? []) as ModificadorFila[]}
        />
      </div>
    </main>
  );
}
