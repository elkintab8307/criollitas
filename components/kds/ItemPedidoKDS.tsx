"use client";

import { cn } from "@/lib/cn";
import { siguienteEstadoItem, type EstadoItemAccionable } from "@/lib/kds/transicionItem";
import type { ItemKDSVista } from "@/components/kds/tipos";

const ICONO_ESTADO: Record<ItemKDSVista["estadoItem"], string> = {
  pendiente: "○",
  en_preparacion: "◐",
  listo: "✓",
  entregado: "✓",
};

interface ItemPedidoKDSProps {
  item: ItemKDSVista;
  onTocar: (pedidoItemId: string, nuevoEstado: EstadoItemAccionable) => void;
}

/** Un ítem dentro de la tarjeta de un pedido. Un toque avanza su estado
 *  (pendiente→en_preparacion→listo); un toque sobre "listo" lo destoca a
 *  en_preparacion (corrección de error). Sin color semántico propio — el
 *  único color con significado en el tablero es el semáforo de tiempo de
 *  la tarjeta (CLAUDE.md §2.5, §8.4): el estado del ítem se indica con un
 *  glifo y tachado, no con color. */
export function ItemPedidoKDS({ item, onTocar }: ItemPedidoKDSProps) {
  const accionable = item.estadoItem !== "entregado";
  const completado = item.estadoItem === "listo" || item.estadoItem === "entregado";

  function alTocar() {
    if (!accionable) return;
    onTocar(item.id, siguienteEstadoItem(item.estadoItem as EstadoItemAccionable));
  }

  return (
    <button
      type="button"
      disabled={!accionable}
      onClick={alTocar}
      aria-label={`${item.cantidad} ${item.productoNombre}, ${item.estadoItem}. Toca para cambiar el estado.`}
      className={cn(
        "flex w-full items-start gap-3 rounded-clay-md bg-brand-crema-2 px-4 py-3 text-left shadow-clay-sm",
        "transition-all active:shadow-clay-pressed disabled:cursor-default",
        completado && "opacity-60",
      )}
    >
      <span className="mt-0.5 font-mono text-2xl text-brand-chocolate" aria-hidden="true">
        {ICONO_ESTADO[item.estadoItem]}
      </span>
      <span className="flex flex-col gap-1">
        <span
          className={cn(
            "font-display text-xl font-semibold text-brand-chocolate",
            completado && "line-through",
          )}
        >
          {item.cantidad}× {item.productoNombre}
        </span>
        {item.modificadores.length > 0 ? (
          <span className="text-xl text-brand-chocolate/80">
            {item.modificadores.map((m) => m.nombre).join(", ")}
          </span>
        ) : null}
        {item.notas ? (
          <span className="text-xl italic text-brand-chocolate/80">Nota: {item.notas}</span>
        ) : null}
      </span>
    </button>
  );
}
