"use client";

import { CarritoPedido } from "@/components/pedido/CarritoPedido";
import { SelectorMenu } from "@/components/pedido/SelectorMenu";
import type { CategoriaFila, ModificadorFila, ProductoFila } from "@/components/menu/types";
import type { ItemConfirmadoVista, PedidoVista } from "@/components/pedido/tipos";

interface PedidoEditorProps {
  pedido: PedidoVista;
  itemsConfirmados: ItemConfirmadoVista[];
  categorias: CategoriaFila[];
  productos: ProductoFila[];
  modificadores: ModificadorFila[];
}

/** Orquesta `/pedido/[id]`: menú a la izquierda, carrito a la derecha. */
export function PedidoEditor({
  pedido,
  itemsConfirmados,
  categorias,
  productos,
  modificadores,
}: PedidoEditorProps) {
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
      <div className="flex-1">
        <SelectorMenu categorias={categorias} productos={productos} modificadores={modificadores} />
      </div>
      <CarritoPedido pedido={pedido} itemsConfirmados={itemsConfirmados} />
    </div>
  );
}
