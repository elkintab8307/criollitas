import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { ColaCobro } from "@/components/caja/ColaCobro";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";
import type { PedidoColaVista } from "@/components/caja/tipos";

export default async function PedidosCajaPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.rol !== "cajera") {
    redirect("/login");
  }
  const sedeId = (user.app_metadata?.sede_id as string | undefined) ?? SEDE_DEFAULT_ID;

  const { data: pedidosFilas } = await supabase
    .from("pedidos")
    .select("id, numero_corto, canal, estado, mesa_id, cliente_id, total_cop")
    .in("estado", ["listo", "entregado"])
    .order("numero_corto", { ascending: true });

  const mesaIds = [...new Set((pedidosFilas ?? []).map((p) => p.mesa_id).filter((id): id is string => !!id))];
  const { data: mesasFilas } = mesaIds.length
    ? await supabase.from("mesas").select("id, numero").in("id", mesaIds)
    : { data: [] as { id: string; numero: number }[] };
  const numeroMesaPorId = new Map((mesasFilas ?? []).map((m) => [m.id, m.numero]));

  const clienteIds = [...new Set((pedidosFilas ?? []).map((p) => p.cliente_id).filter((id): id is string => !!id))];
  const { data: clientesFilas } = clienteIds.length
    ? await supabase.from("clientes_domicilio").select("id, nombre").in("id", clienteIds)
    : { data: [] as { id: string; nombre: string }[] };
  const nombreClientePorId = new Map((clientesFilas ?? []).map((c) => [c.id, c.nombre]));

  const pedidos: PedidoColaVista[] = (pedidosFilas ?? []).map((p) => ({
    id: p.id,
    numeroCorto: p.numero_corto,
    canal: p.canal as PedidoColaVista["canal"],
    estado: p.estado as PedidoColaVista["estado"],
    mesaNumero: p.mesa_id ? (numeroMesaPorId.get(p.mesa_id) ?? null) : null,
    clienteNombre: p.cliente_id ? (nombreClientePorId.get(p.cliente_id) ?? null) : null,
    totalCop: p.total_cop,
  }));

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Pedidos por cobrar</h1>
      <div className="mt-6">
        <ColaCobro pedidosIniciales={pedidos} sedeId={sedeId} />
      </div>
    </main>
  );
}
