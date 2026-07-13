"use client";

import { useEffect } from "react";
import { CarritoNuevo } from "@/components/pedido/CarritoNuevo";
import { SelectorMenu } from "@/components/pedido/SelectorMenu";
import { useCarritoStore } from "@/lib/pedido/carritoStore";
import type { CategoriaFila, ModificadorFila, ProductoFila } from "@/components/menu/types";
import type { OrigenPedido } from "@/app/(vendedora)/pedido/actions";

interface PedidoNuevoEditorProps {
  origen: OrigenPedido;
  categorias: CategoriaFila[];
  productos: ProductoFila[];
  modificadores: ModificadorFila[];
  usaCocina: boolean;
}

function claveContexto(origen: OrigenPedido): string {
  if (origen.canal === "mesa") return `nuevo:mesa:${origen.mesaId}`;
  if (origen.canal === "domicilio") return `nuevo:domicilio:${origen.clienteId}`;
  return "nuevo:llevar";
}

/** Orquesta /pedido/nuevo: menú a la izquierda, carrito en curso (sin
 *  pedido en base de datos todavía) a la derecha. */
export function PedidoNuevoEditor({ origen, categorias, productos, modificadores, usaCocina }: PedidoNuevoEditorProps) {
  const clave = claveContexto(origen);

  // Mismo mecanismo que PedidoEditor.tsx (asegurarPedido): protege contra un
  // carrito sin confirmar de otro origen distinto quedando visible aquí. La
  // clave es sintética (no un pedido.id real) porque todavía no existe fila.
  useEffect(() => {
    useCarritoStore.getState().asegurarPedido(clave);
  }, [clave]);

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
      <div className="flex-1">
        <SelectorMenu categorias={categorias} productos={productos} modificadores={modificadores} />
      </div>
      <CarritoNuevo origen={origen} usaCocina={usaCocina} />
    </div>
  );
}
