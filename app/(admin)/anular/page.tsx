import { BuscadorPedidoAnular } from "@/components/admin/BuscadorPedidoAnular";

export default function AnularPage() {
  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Anular pedido</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">
        Busca un pedido por número para anularlo. Solo se pueden anular pedidos ya cobrados.
      </p>
      <BuscadorPedidoAnular />
    </main>
  );
}
