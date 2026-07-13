import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { TableroKDS } from "@/components/kds/TableroKDS";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";
import type { ItemKDSVista, PedidoKDSVista } from "@/components/kds/tipos";

export default async function KdsPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || (user.app_metadata?.rol !== "cocina" && user.app_metadata?.rol !== "admin")) {
    redirect("/login");
  }
  const sedeId = (user.app_metadata?.sede_id as string | undefined) ?? SEDE_DEFAULT_ID;

  const { data: pedidosFilas } = await supabase
    .from("pedidos")
    .select("id, numero_corto, canal, estado, mesa_id, cliente_id, enviado_cocina_en")
    .in("estado", ["enviado_cocina", "en_preparacion", "listo"])
    .order("enviado_cocina_en", { ascending: true });

  const mesaIds = [
    ...new Set((pedidosFilas ?? []).map((p) => p.mesa_id).filter((id): id is string => !!id)),
  ];
  const { data: mesasFilas } = mesaIds.length
    ? await supabase.from("mesas").select("id, numero").in("id", mesaIds)
    : { data: [] as { id: string; numero: number }[] };
  const numeroMesaPorId = new Map((mesasFilas ?? []).map((m) => [m.id, m.numero]));

  const clienteIds = [
    ...new Set((pedidosFilas ?? []).map((p) => p.cliente_id).filter((id): id is string => !!id)),
  ];
  const { data: clientesFilas } = clienteIds.length
    ? await supabase.from("clientes_domicilio").select("id, nombre").in("id", clienteIds)
    : { data: [] as { id: string; nombre: string }[] };
  const nombreClientePorId = new Map((clientesFilas ?? []).map((c) => [c.id, c.nombre]));

  const pedidoIds = (pedidosFilas ?? []).map((p) => p.id);
  const { data: itemsFilas } = pedidoIds.length
    ? await supabase
        .from("pedido_items")
        .select("id, pedido_id, producto_id, cantidad, notas, estado_item")
        .in("pedido_id", pedidoIds)
    : {
        data: [] as {
          id: string;
          pedido_id: string;
          producto_id: string;
          cantidad: number;
          notas: string | null;
          estado_item: string;
        }[],
      };

  const productoIds = [...new Set((itemsFilas ?? []).map((i) => i.producto_id))];
  const { data: productosFilas } = productoIds.length
    ? await supabase.from("productos").select("id, nombre").in("id", productoIds)
    : { data: [] as { id: string; nombre: string }[] };
  const nombreProductoPorId = new Map((productosFilas ?? []).map((p) => [p.id, p.nombre]));

  const itemIds = (itemsFilas ?? []).map((i) => i.id);
  const { data: modsFilas } = itemIds.length
    ? await supabase
        .from("pedido_item_mods")
        .select("pedido_item_id, modificador_id")
        .in("pedido_item_id", itemIds)
    : { data: [] as { pedido_item_id: string; modificador_id: string }[] };
  const modificadorIds = [...new Set((modsFilas ?? []).map((m) => m.modificador_id))];
  const { data: modificadoresFilas } = modificadorIds.length
    ? await supabase.from("modificadores").select("id, nombre").in("id", modificadorIds)
    : { data: [] as { id: string; nombre: string }[] };
  const nombreModificadorPorId = new Map((modificadoresFilas ?? []).map((m) => [m.id, m.nombre]));

  const pedidos: PedidoKDSVista[] = (pedidosFilas ?? [])
    .filter((p): p is typeof p & { enviado_cocina_en: string } => !!p.enviado_cocina_en)
    .map((p) => {
      const items: ItemKDSVista[] = (itemsFilas ?? [])
        .filter((i) => i.pedido_id === p.id)
        .map((i) => ({
          id: i.id,
          productoNombre: nombreProductoPorId.get(i.producto_id) ?? "Producto",
          cantidad: i.cantidad,
          notas: i.notas,
          estadoItem: i.estado_item as ItemKDSVista["estadoItem"],
          modificadores: (modsFilas ?? [])
            .filter((m) => m.pedido_item_id === i.id)
            .map((m) => ({ nombre: nombreModificadorPorId.get(m.modificador_id) ?? "Adicional" })),
        }));
      return {
        id: p.id,
        numeroCorto: p.numero_corto,
        canal: p.canal as PedidoKDSVista["canal"],
        estado: p.estado as PedidoKDSVista["estado"],
        mesaNumero: p.mesa_id ? (numeroMesaPorId.get(p.mesa_id) ?? null) : null,
        clienteNombre: p.cliente_id ? (nombreClientePorId.get(p.cliente_id) ?? null) : null,
        enviadoCocinaEn: p.enviado_cocina_en,
        items,
      };
    });

  return (
    <main className="min-h-dvh bg-brand-chocolate p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Cocina</h1>
      <div className="mt-6">
        <TableroKDS pedidosIniciales={pedidos} sedeId={sedeId} />
      </div>
    </main>
  );
}
