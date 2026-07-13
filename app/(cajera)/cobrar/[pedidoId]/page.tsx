import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { FormularioCobro } from "@/components/caja/FormularioCobro";
import { formatearCOP } from "@/lib/money";

interface PageProps {
  params: Promise<{ pedidoId: string }>;
}

export default async function CobrarPedidoPage({ params }: PageProps) {
  const { pedidoId } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.rol !== "cajera") {
    redirect("/login");
  }

  const { data: pedidoFila } = await supabase
    .from("pedidos")
    .select("id, numero_corto, estado, canal, mesa_id, cliente_id, total_cop")
    .eq("id", pedidoId)
    .single();
  if (!pedidoFila || !["listo", "entregado", "cobrado"].includes(pedidoFila.estado)) {
    notFound();
  }

  const { data: itemsFilas } = await supabase
    .from("pedido_items")
    .select("id, producto_id, cantidad, subtotal_cop, notas")
    .eq("pedido_id", pedidoId);
  const productoIds = [...new Set((itemsFilas ?? []).map((i) => i.producto_id))];
  const { data: productosFilas } = productoIds.length
    ? await supabase.from("productos").select("id, nombre").in("id", productoIds)
    : { data: [] as { id: string; nombre: string }[] };
  const nombrePorId = new Map((productosFilas ?? []).map((p) => [p.id, p.nombre]));

  const yaEstaCobrado = pedidoFila.estado === "cobrado";

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Pedido #{pedidoFila.numero_corto}</h1>
      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          {(itemsFilas ?? []).map((item) => (
            <div key={item.id} className="rounded-clay-md bg-brand-crema-2 p-3 text-sm text-brand-chocolate">
              <p className="font-medium">
                {item.cantidad}× {nombrePorId.get(item.producto_id) ?? "Producto"}
              </p>
              <p className="text-brand-chocolate/70">{formatearCOP(BigInt(item.subtotal_cop))}</p>
            </div>
          ))}
        </div>
        {yaEstaCobrado ? (
          <p className="rounded-clay-md bg-brand-chocolate-2 p-6 text-center text-xl text-brand-crema/70">
            Este pedido ya fue cobrado.
          </p>
        ) : (
          <FormularioCobro pedidoId={pedidoFila.id} totalCop={BigInt(pedidoFila.total_cop)} />
        )}
      </div>
    </main>
  );
}
