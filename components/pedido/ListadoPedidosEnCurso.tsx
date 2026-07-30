"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatearCOP } from "@/lib/money";
import { ClayCard } from "@/components/ui/ClayCard";
import { ClayBadge } from "@/components/ui/ClayBadge";
import { ClayButton } from "@/components/ui/ClayButton";
import { ModalCancelarPedido } from "@/components/pedido/ModalCancelarPedido";
import type { PedidoVista, EstadoPedido } from "@/components/pedido/tipos";
import type { MotivoCancelacionInput } from "@/lib/validations/cancelacion";
import type { DomainError, Result } from "@/lib/result";

const ETIQUETA_CANAL: Record<"domicilio" | "llevar", string> = {
  domicilio: "Domicilio",
  llevar: "Para llevar",
};

const ETIQUETA_ESTADO: Record<EstadoPedido, string> = {
  abierto: "Abierto",
  enviado_cocina: "Enviado a cocina",
  en_preparacion: "En preparación",
  listo: "Listo",
  entregado: "Entregado",
  cobrado: "Cobrado",
  cerrado: "Cerrado",
  anulado: "Anulado",
  cancelado: "Cancelado",
};

interface ListadoPedidosEnCursoProps {
  pedidos: PedidoVista[];
  variante: "vendedora" | "cajera";
  onCancelar: (pedidoId: string, input: MotivoCancelacionInput) => Promise<Result<null, DomainError>>;
}

/** Lista de pedidos de domicilio/llevar en curso, compartida entre la vista
 *  de vendedora (con link a /pedido/[id] para agregar productos) y la de
 *  cajera (solo ver + cancelar, Bloque C). */
export function ListadoPedidosEnCurso({ pedidos, variante, onCancelar }: ListadoPedidosEnCursoProps) {
  const router = useRouter();
  const [pedidoACancelar, setPedidoACancelar] = useState<PedidoVista | null>(null);
  // Cancelar sin conexión no puede esperar un router.refresh() (no hay
  // servidor que responder) -- se quita de la lista aquí mismo apenas se
  // confirma la cancelación (local u online), sin depender de que la
  // página vuelva a pedir datos frescos.
  const [idsCancelados, setIdsCancelados] = useState<Set<string>>(new Set());
  const pedidosVisibles = pedidos.filter((p) => !idsCancelados.has(p.id));

  if (pedidosVisibles.length === 0) {
    return <p className="text-sm text-brand-crema/70">No hay pedidos de domicilio o para llevar en curso.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {pedidosVisibles.map((pedido) => (
        <ClayCard key={pedido.id} variant="flat" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-display text-xl font-semibold text-text-primary">
              Pedido #{pedido.numeroCorto}
            </span>
            <ClayBadge variant="neutral">{ETIQUETA_ESTADO[pedido.estado]}</ClayBadge>
          </div>
          <p className="text-sm text-text-secondary">
            {pedido.canal === "domicilio" || pedido.canal === "llevar" ? ETIQUETA_CANAL[pedido.canal] : pedido.canal}
            {pedido.clienteNombre ? ` — ${pedido.clienteNombre}` : ""}
          </p>
          <p className="font-mono text-lg text-text-primary">{formatearCOP(BigInt(pedido.totalCop))}</p>
          <div className="flex gap-3">
            {variante === "vendedora" ? (
              <ClayButton type="button" variant="secondary" onClick={() => router.push(`/pedido/${pedido.id}`)}>
                Ver / agregar productos
              </ClayButton>
            ) : null}
            <ClayButton type="button" variant="destructive" onClick={() => setPedidoACancelar(pedido)}>
              Cancelar
            </ClayButton>
          </div>
        </ClayCard>
      ))}

      {pedidoACancelar ? (
        <ModalCancelarPedido
          pedido={pedidoACancelar}
          abierto={true}
          onCerrar={() => setPedidoACancelar(null)}
          onCancelar={onCancelar}
          onExito={(fueOffline) => {
            setIdsCancelados((actuales) => new Set(actuales).add(pedidoACancelar.id));
            setPedidoACancelar(null);
            // Offline no hay servidor que refrescar -- la lista ya se
            // actualizó arriba de forma optimista.
            if (!fueOffline) {
              router.refresh();
            }
          }}
        />
      ) : null}
    </div>
  );
}
