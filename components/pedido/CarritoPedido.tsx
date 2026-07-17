"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatearCOP, montoDesdePesos, multiplicar, sumar } from "@/lib/money";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayBadge } from "@/components/ui/ClayBadge";
import { ModalCancelarPedido } from "@/components/pedido/ModalCancelarPedido";
import { useCarritoStore } from "@/lib/pedido/carritoStore";
import { confirmarItemsPedido, cancelarPedido } from "@/app/(vendedora)/pedido/actions";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { agregarItemsPedidoLocal, leerPedidoLocal } from "@/lib/offline/pedidosLocales";
import { encolarOperacion } from "@/lib/offline/cola";
import type { ItemPedidoLocal } from "@/lib/offline/db";
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
  /** Recarga los datos del pedido tras confirmar ítems (ver PedidoEditor). */
  onRecargar: () => void;
}

/** Panel del carrito en curso (zustand) + ítems ya confirmados (solo lectura) + total. */
export function CarritoPedido({ pedido, itemsConfirmados, soloLectura = false, usaCocina, onRecargar }: CarritoPedidoProps) {
  const router = useRouter();
  const { items, quitar, cambiarCantidad, vaciar } = useCarritoStore();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalCancelarAbierto, setModalCancelarAbierto] = useState(false);
  const offline = useConectividadStore((s) => s.estado) === "offline";

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

    if (useConectividadStore.getState().estado === "offline") {
      // Solo un pedido que ya vive en la copia local (creado offline,
      // Bloque J3d) admite agregarle ítems sin conexión -- para un pedido
      // que solo existe en el servidor no hay copia local que editar, y
      // encolar la operación sin reflejarla en ninguna pantalla dejaría a
      // la vendedora sin forma de ver lo que agregó.
      const pedidoLocal = await leerPedidoLocal(pedido.id);
      if (!pedidoLocal) {
        setError("Este pedido no está guardado en este equipo. Conéctate a internet para modificarlo.");
        setEnviando(false);
        return;
      }
      const itemsLocales: ItemPedidoLocal[] = items.map((item) => ({
        productoId: item.productoId,
        nombre: item.nombre,
        cantidad: item.cantidad,
        precioUnitCop: Number(montoDesdePesos(item.precioUnitPesos)),
        modificadores: item.modificadores.map((m) => ({
          modificadorId: m.modificadorId,
          nombre: m.nombre,
          precioDeltaCop: Number(montoDesdePesos(m.precioDeltaPesos)),
        })),
        nota: item.nota || null,
      }));
      await agregarItemsPedidoLocal(pedido.id, itemsLocales);
      await encolarOperacion({
        tipo: "agregar_items_pedido",
        payload: {
          pedidoId: pedido.id,
          items: items.map((item) => ({
            productoId: item.productoId,
            cantidad: item.cantidad,
            modificadorIds: item.modificadores.map((m) => m.modificadorId),
            nota: item.nota || undefined,
          })),
        },
        creadaEn: new Date().toISOString(),
      });
      setEnviando(false);
      vaciar();
      onRecargar();
      return;
    }

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
    // Mantener la copia local al día también en el camino ONLINE (mismo
    // motivo que CarritoNuevo.tsx): si el internet se cae después de
    // agregar estos ítems y antes de que /pedidos refresque el caché, la
    // cajera cobraría offline un total viejo. agregarItemsPedidoLocal no
    // hace nada si el pedido no tiene copia local.
    await agregarItemsPedidoLocal(
      pedido.id,
      items.map((item) => ({
        productoId: item.productoId,
        nombre: item.nombre,
        cantidad: item.cantidad,
        precioUnitCop: Number(montoDesdePesos(item.precioUnitPesos)),
        modificadores: item.modificadores.map((m) => ({
          modificadorId: m.modificadorId,
          nombre: m.nombre,
          precioDeltaCop: Number(montoDesdePesos(m.precioDeltaPesos)),
        })),
        nota: item.nota || null,
      })),
    );
    vaciar();
    onRecargar();
  }

  return (
    <aside className="flex w-full flex-col gap-4 rounded-clay-lg bg-brand-crema p-4 shadow-clay-md sm:max-w-sm">
      <h2 className="font-display text-lg font-semibold text-text-primary">
        {pedido.numeroCorto > 0 ? `Pedido #${pedido.numeroCorto}` : "Pedido (por sincronizar)"}
      </h2>

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
          {offline ? (
            <p className="text-sm text-text-secondary">
              Cancelar un pedido no está disponible sin conexión.
            </p>
          ) : (
            <ClayButton type="button" variant="destructive" onClick={() => setModalCancelarAbierto(true)}>
              Cancelar pedido
            </ClayButton>
          )}
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
