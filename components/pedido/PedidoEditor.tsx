"use client";

import { useEffect } from "react";
import { CarritoPedido } from "@/components/pedido/CarritoPedido";
import { SelectorMenu } from "@/components/pedido/SelectorMenu";
import { useCarritoStore } from "@/lib/pedido/carritoStore";
import type { CategoriaFila, ModificadorFila, ProductoFila } from "@/components/menu/types";
import type { ItemConfirmadoVista, PedidoVista } from "@/components/pedido/tipos";

interface PedidoEditorProps {
  pedido: PedidoVista;
  itemsConfirmados: ItemConfirmadoVista[];
  categorias: CategoriaFila[];
  productos: ProductoFila[];
  modificadores: ModificadorFila[];
  usaCocina: boolean;
  /** Vuelve a cargar los datos del pedido tras confirmar ítems -- la página
   *  es un Client Component (Bloque J3e) y router.refresh() ya no re-ejecuta
   *  su carga de datos, así que el refresco lo hace ella misma. */
  onRecargar: () => void;
}

const ESTADOS_TERMINALES = new Set(["cobrado", "cerrado", "anulado", "cancelado"]);

/** Orquesta `/pedido/[id]`: menú a la izquierda, carrito a la derecha.
 *  Si el pedido ya está en un estado terminal (cobrado/cerrado/anulado/cancelado,
 *  CLAUDE.md §13.7), el menú no se renderiza — evita que la vendedora arme un
 *  carrito entero para enterarse solo al confirmar que el pedido ya no admite
 *  cambios. */
export function PedidoEditor({
  pedido,
  itemsConfirmados,
  categorias,
  productos,
  modificadores,
  usaCocina,
  onRecargar,
}: PedidoEditorProps) {
  const soloLectura = ESTADOS_TERMINALES.has(pedido.estado);

  // El carrito es un store de módulo (singleton): sin esto, un carrito sin
  // confirmar de otro pedido (navegación directa entre /pedido/[id] sin pasar
  // por /inicio) quedaría visible aquí y sus ítems se agregarían al pedido
  // equivocado al confirmar.
  useEffect(() => {
    useCarritoStore.getState().asegurarPedido(pedido.id);
  }, [pedido.id]);

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
      <div className="flex-1">
        {soloLectura ? (
          <p className="rounded-clay-md bg-brand-chocolate-2 p-6 text-center text-sm text-brand-crema/70">
            Este pedido ya fue cerrado y no admite más cambios.
          </p>
        ) : (
          <SelectorMenu categorias={categorias} productos={productos} modificadores={modificadores} />
        )}
      </div>
      <CarritoPedido
        pedido={pedido}
        itemsConfirmados={itemsConfirmados}
        soloLectura={soloLectura}
        usaCocina={usaCocina}
        onRecargar={onRecargar}
      />
    </div>
  );
}
