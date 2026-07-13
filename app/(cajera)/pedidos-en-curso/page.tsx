import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { ListadoPedidosEnCurso } from "@/components/pedido/ListadoPedidosEnCurso";
import { cancelarPedidoCajera } from "@/app/(cajera)/pedidos-en-curso/actions";
import type { PedidoVista } from "@/components/pedido/tipos";

const ESTADOS_NO_TERMINALES = ["abierto", "enviado_cocina", "en_preparacion", "listo", "entregado"] as const;

export default async function PedidosEnCursoCajeraPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.rol !== "cajera") {
    redirect("/login");
  }

  const { data: pedidosFilas } = await supabase
    .from("pedidos")
    .select("id, numero_corto, canal, estado, cliente_id, subtotal_cop, total_cop")
    .in("canal", ["domicilio", "llevar"])
    .in("estado", ESTADOS_NO_TERMINALES)
    .order("numero_corto", { ascending: true });

  const clienteIds = [...new Set((pedidosFilas ?? []).map((p) => p.cliente_id).filter((id): id is string => !!id))];
  const { data: clientesFilas } = clienteIds.length
    ? await supabase.from("clientes_domicilio").select("id, nombre").in("id", clienteIds)
    : { data: [] as { id: string; nombre: string }[] };
  const nombreClientePorId = new Map((clientesFilas ?? []).map((c) => [c.id, c.nombre]));

  const pedidos: PedidoVista[] = (pedidosFilas ?? []).map((p) => ({
    id: p.id,
    numeroCorto: p.numero_corto,
    canal: p.canal as PedidoVista["canal"],
    estado: p.estado as PedidoVista["estado"],
    mesaNumero: null,
    clienteNombre: p.cliente_id ? (nombreClientePorId.get(p.cliente_id) ?? null) : null,
    subtotalCop: p.subtotal_cop,
    totalCop: p.total_cop,
  }));

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Domicilios y para llevar en curso</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">
        Pedidos de domicilio o para llevar de toda la sede, en cualquier estado.
      </p>
      <ListadoPedidosEnCurso pedidos={pedidos} variante="cajera" onCancelar={cancelarPedidoCajera} />
    </main>
  );
}
