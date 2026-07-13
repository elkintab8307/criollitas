"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatearCOP, montoDesdePesos, multiplicar, sumar } from "@/lib/money";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayBadge } from "@/components/ui/ClayBadge";
import { ModalCancelarPedido } from "@/components/pedido/ModalCancelarPedido";
import { useCarritoStore } from "@/lib/pedido/carritoStore";
import { confirmarItemsPedido, cancelarPedido } from "@/app/(vendedora)/pedido/actions";
import type { ItemConfirmadoVista, PedidoVista } from "@/components/pedido/tipos";

const ETIQUETA_ESTADO_ITEM: Record<ItemConfirmadoVista["estadoItem"], string> = {
  pendiente: "Pendiente",
  en_preparacion: "En preparación",
  listo: "Listo",
  entregado: "Entregado",
};

interface CarritoPedidoProps {
  pedido: PedidoVista;
  itemsConfirmados: ItemConfirmadoVista[];
  /** Pedido en estado terminal (cobrado/cerrado/anulado): el carrito en curso
   *  puede tener ítems sin enviar, pero el botón de confirmar queda bloqueado. */
  soloLectura?: boolean;
  usaCocina: boolean;
}

/** Panel del carrito en curso (zustand) + ítems ya confirmados (solo lectura) + total. */
export function CarritoPedido({ pedido, itemsConfirmados, soloLectura = false, usaCocina }: CarritoPedidoProps) {
  const router = useRouter();
  const { items, quitar, cambiarCantidad, vaciar } = useCarritoStore();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalCancelarAbierto, setModalCancelarAbierto] = useState(false);

  const totalCarritoEnCurso = sumar(
    ...items.map((item) =>
      multiplicar(
        sumar(
          montoDesdePesos(item.precioUnitPesos),
          ...item.modificadores.map((m) => montoDesdePesos(m.precioDeltaPesos)),
        ),
        item.cantidad,
      ),
    ),
  );
  const totalConfirmado = BigInt(pedido.totalCop);

  const esPrimerEnvio = pedido.estado === "abierto";
  const textoBoton = esPrimerEnvio ? (usaCocina ? "Enviar a cocina" : "Confirmar pedido") : "Agregar a la comanda";

  async function confirmar() {
    if (items.length === 0 || soloLectura) return;
    setError(null);
    setEnviando(true);
    const resultado = await confirmarItemsPedido(pedido.id, {
      items: items.map((item) => ({
        productoId: item.productoId,
        cantidad: item.cantidad,
        modificadorIds: item.modificadores.map((m) => m.modificadorId),
        nota: item.nota || undefined,
      })),
    });
    setEnviando(false);
    if (!resultado.ok) {
      setError(resultado.error.mensaje);
      return;
    }
    vaciar();
    router.refresh();
  }

  return (
    <aside className="flex w-full flex-col gap-4 rounded-clay-lg bg-brand-crema p-4 shadow-clay-md sm:max-w-sm">
      <h2 className="font-display text-lg font-semibold text-text-primary">Pedido #{pedido.numeroCorto}</h2>

      {itemsConfirmados.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="font-display text-sm font-medium text-text-secondary">
            {usaCocina ? "Ya enviado a cocina" : "Confirmado"}
          </h3>
          {itemsConfirmados.map((item) => (
            <div key={item.id} className="rounded-clay-sm bg-surface-sunken p-3 text-sm text-text-primary">
              <div className="flex items-center justify-between gap-2">
                <span>
                  {item.cantidad}× {item.productoNombre}
                </span>
                <ClayBadge variant="neutral">{ETIQUETA_ESTADO_ITEM[item.estadoItem]}</ClayBadge>
              </div>
              {item.modificadores.length > 0 ? (
                <p className="text-xs text-text-secondary">
                  {item.modificadores.map((m) => m.nombre).join(", ")}
                </p>
              ) : null}
              {item.notas ? <p className="text-xs text-text-secondary">Nota: {item.notas}</p> : null}
              <p className="mt-1 font-mono text-xs text-text-secondary">
                {formatearCOP(BigInt(item.subtotalCop))}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="font-display text-sm font-medium text-text-secondary">
          {esPrimerEnvio ? "Carrito" : "Por enviar"}
        </h3>
        {items.length === 0 ? (
          <p className="text-sm text-text-secondary">Toca un producto del menú para agregarlo.</p>
        ) : (
          items.map((item) => (
            <div key={item.clave} className="rounded-clay-sm bg-brand-crema-2 p-3 text-sm text-text-primary">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{item.nombre}</span>
                <button
                  type="button"
                  aria-label={`Quitar ${item.nombre}`}
                  onClick={() => quitar(item.clave)}
                  className="text-brand-tomate-2 hover:text-brand-tomate focus-visible:outline-2 focus-visible:outline-brand-tomate"
                >
                  ✕
                </button>
              </div>
              {item.modificadores.length > 0 ? (
                <p className="text-xs text-text-secondary">
                  {item.modificadores.map((m) => m.nombre).join(", ")}
                </p>
              ) : null}
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`Reducir cantidad de ${item.nombre}`}
                  disabled={item.cantidad <= 1}
                  onClick={() => cambiarCantidad(item.clave, item.cantidad - 1)}
                  className="flex size-8 items-center justify-center rounded-clay-sm bg-brand-crema shadow-clay-sm disabled:opacity-30"
                >
                  −
                </button>
                <span className="w-6 text-center font-mono">{item.cantidad}</span>
                <button
                  type="button"
                  aria-label={`Aumentar cantidad de ${item.nombre}`}
                  onClick={() => cambiarCantidad(item.clave, item.cantidad + 1)}
                  className="flex size-8 items-center justify-center rounded-clay-sm bg-brand-crema shadow-clay-sm"
                >
                  +
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex items-center justify-between border-t border-black/10 pt-3">
        <span className="font-display text-sm font-medium text-text-secondary">Total</span>
        <span className="font-mono text-lg font-semibold text-text-primary">
          {formatearCOP(totalConfirmado + totalCarritoEnCurso)}
        </span>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {error}
        </p>
      ) : null}

      {soloLectura ? (
        <p className="text-sm text-text-secondary">Este pedido ya no se puede modificar.</p>
      ) : (
        <>
          <ClayButton
            type="button"
            variant="primary"
            size="lg"
            disabled={items.length === 0 || enviando}
            onClick={confirmar}
          >
            {enviando ? "Enviando…" : textoBoton}
          </ClayButton>
          <ClayButton type="button" variant="destructive" onClick={() => setModalCancelarAbierto(true)}>
            Cancelar pedido
          </ClayButton>
        </>
      )}

      <ModalCancelarPedido
        pedido={pedido}
        abierto={modalCancelarAbierto}
        onCerrar={() => setModalCancelarAbierto(false)}
        onCancelar={cancelarPedido}
        onExito={() => {
          setModalCancelarAbierto(false);
          router.push("/inicio");
        }}
      />
    </aside>
  );
}
