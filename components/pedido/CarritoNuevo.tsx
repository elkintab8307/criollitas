"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatearCOP, montoDesdePesos, multiplicar, sumar } from "@/lib/money";
import { ClayButton } from "@/components/ui/ClayButton";
import { useCarritoStore } from "@/lib/pedido/carritoStore";
import { crearPedidoConItems, type OrigenPedido } from "@/app/(vendedora)/pedido/actions";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { useSesionOfflineStore } from "@/lib/offline/sesionOfflineStore";
import { crearPedidoLocal } from "@/lib/offline/pedidosLocales";
import { encolarOperacion } from "@/lib/offline/cola";
import type { ItemPedidoLocal } from "@/lib/offline/db";

interface CarritoNuevoProps {
  origen: OrigenPedido;
  usaCocina: boolean;
}

/** Carrito para un pedido que todavía no existe en base de datos (Bloque A:
 *  un pedido solo se crea al confirmar el primer envío). Sin sección "ya
 *  enviado a cocina" -- nada se ha confirmado todavía -- y un único botón,
 *  sin el caso de reenvíos que sí maneja CarritoPedido. */
export function CarritoNuevo({ origen, usaCocina }: CarritoNuevoProps) {
  const router = useRouter();
  const { items, quitar, cambiarCantidad, vaciar } = useCarritoStore();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = sumar(
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

  async function confirmar() {
    if (items.length === 0) return;
    setError(null);
    setEnviando(true);

    if (useConectividadStore.getState().estado === "offline") {
      const sesion = useSesionOfflineStore.getState().sesion;
      if (!sesion) {
        setError(
          "No hay una identidad guardada en este equipo. Conéctate a internet una vez para poder trabajar sin conexión.",
        );
        setEnviando(false);
        return;
      }
      const pedidoId = crypto.randomUUID();
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
      await crearPedidoLocal({
        pedidoId,
        origen,
        items: itemsLocales,
        estado: "abierto",
        sedeId: sesion.sedeId,
        vendedoraId: sesion.usuarioId,
        creadoEn: new Date().toISOString(),
      });
      await encolarOperacion({
        tipo: "crear_pedido_con_items",
        payload: {
          pedidoId,
          origen,
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
      router.push(`/pedido/${pedidoId}`);
      return;
    }

    const resultado = await crearPedidoConItems(origen, {
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
    router.push(`/pedido/${resultado.valor.pedidoId}`);
  }

  return (
    <aside className="flex w-full flex-col gap-4 rounded-clay-lg bg-brand-crema p-4 shadow-clay-md sm:max-w-sm">
      <h2 className="font-display text-lg font-semibold text-text-primary">Carrito</h2>

      <div className="flex flex-col gap-2">
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
        <span className="font-mono text-lg font-semibold text-text-primary">{formatearCOP(total)}</span>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {error}
        </p>
      ) : null}

      <ClayButton
        type="button"
        variant="primary"
        size="lg"
        disabled={items.length === 0 || enviando}
        onClick={confirmar}
      >
        {enviando ? "Enviando…" : usaCocina ? "Enviar a cocina" : "Confirmar pedido"}
      </ClayButton>
    </aside>
  );
}
