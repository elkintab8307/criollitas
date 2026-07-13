"use client";

import { useEffect, useState } from "react";
import { ClayCard } from "@/components/ui/ClayCard";
import { cn } from "@/lib/cn";
import { calcularColorSemaforo, type ColorSemaforo } from "@/lib/kds/semaforo";
import { ItemPedidoKDS } from "@/components/kds/ItemPedidoKDS";
import type { EstadoItemAccionable } from "@/lib/kds/transicionItem";
import type { PedidoKDSVista } from "@/components/kds/tipos";

function etiquetaOrigen(pedido: PedidoKDSVista): string {
  if (pedido.canal === "mesa") return pedido.mesaNumero ? `Mesa ${pedido.mesaNumero}` : "Mesa";
  if (pedido.canal === "domicilio") return pedido.clienteNombre ?? "Domicilio";
  return "Para llevar";
}

const BORDE_SEMAFORO: Record<ColorSemaforo, string> = {
  verde: "border-brand-verde",
  amarillo: "border-brand-mostaza",
  rojo: "border-brand-tomate",
};

interface TarjetaPedidoProps {
  pedido: PedidoKDSVista;
  onTocarItem: (pedidoItemId: string, nuevoEstado: EstadoItemAccionable) => void;
}

/** Una tarjeta = un pedido (CLAUDE.md §2.5). El borde de color es el
 *  semáforo de tiempo, recalculado cada 30s independientemente de si
 *  llegan eventos Realtime — un pedido sin toques en 10 minutos debe
 *  ponerse rojo aunque nadie haya tocado nada. */
export function TarjetaPedido({ pedido, onTocarItem }: TarjetaPedidoProps) {
  const [color, setColor] = useState<ColorSemaforo>(() =>
    calcularColorSemaforo(new Date(pedido.enviadoCocinaEn), new Date()),
  );

  useEffect(() => {
    function recalcular() {
      setColor(calcularColorSemaforo(new Date(pedido.enviadoCocinaEn), new Date()));
    }
    recalcular();
    const intervalo = setInterval(recalcular, 30_000);
    return () => clearInterval(intervalo);
  }, [pedido.enviadoCocinaEn]);

  return (
    <ClayCard variant="elevated" className={cn("flex flex-col gap-3 border-4", BORDE_SEMAFORO[color])}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-4xl font-bold text-brand-chocolate">#{pedido.numeroCorto}</span>
        <span className="text-xl text-brand-chocolate/80">{etiquetaOrigen(pedido)}</span>
      </div>
      <div className="flex flex-col gap-2">
        {pedido.items.map((item) => (
          <ItemPedidoKDS key={item.id} item={item} onTocar={onTocarItem} />
        ))}
      </div>
    </ClayCard>
  );
}
