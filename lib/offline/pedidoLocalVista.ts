import { calcularSubtotalItem, calcularTotalesPedido, type ItemParaTotal } from "@/lib/pedido/totales";
import type { PedidoLocal } from "@/lib/offline/db";
import type { ItemConfirmadoVista, PedidoVista } from "@/components/pedido/tipos";

export interface MesaCacheada {
  id: string;
  numero: number;
}

/** Convierte la copia local de un pedido (IndexedDB, Bloque J3d) a las
 *  mismas vistas que el editor de pedido ya consume online -- así
 *  PedidoEditor/CarritoPedido no distinguen de dónde vinieron los datos.
 *  Núcleo puro (testeado): los totales se recalculan aquí con la misma
 *  aritmética bigint de lib/pedido/totales.ts, porque el pedido local no
 *  guarda totales (siempre se derivan de los ítems, una sola fuente de
 *  verdad). El estado local "abierto" se muestra como "listo": con
 *  usa_cocina = false (sede de Armenia, CLAUDE.md §2.5) los ítems nacen
 *  listos y el agregado real en el servidor también quedará "listo" al
 *  sincronizar. numeroCorto es 0 -- lo asigna el servidor al sincronizar;
 *  la UI muestra un texto alternativo cuando es 0. */
export function construirVistaPedidoLocal(
  pedidoLocal: PedidoLocal,
  mesasCache: MesaCacheada[],
): { pedido: PedidoVista; itemsConfirmados: ItemConfirmadoVista[] } {
  const itemsParaTotal: ItemParaTotal[] = pedidoLocal.items.map((item) => ({
    precioUnitCop: BigInt(item.precioUnitCop),
    cantidad: item.cantidad,
    modificadoresDeltaCop: item.modificadores.map((m) => BigInt(m.precioDeltaCop)),
  }));
  const { subtotalCop, totalCop } = calcularTotalesPedido(itemsParaTotal);

  const mesaNumero =
    pedidoLocal.origen.canal === "mesa"
      ? (mesasCache.find((m) => m.id === (pedidoLocal.origen as { mesaId: string }).mesaId)?.numero ?? null)
      : null;

  const pedido: PedidoVista = {
    id: pedidoLocal.pedidoId,
    numeroCorto: 0,
    canal: pedidoLocal.origen.canal,
    estado: pedidoLocal.estado === "cobrado" ? "cobrado" : "listo",
    mesaNumero,
    clienteNombre: null,
    subtotalCop: Number(subtotalCop),
    totalCop: Number(totalCop),
  };

  const itemsConfirmados: ItemConfirmadoVista[] = pedidoLocal.items.map((item, indice) => ({
    id: `${pedidoLocal.pedidoId}:${indice}`,
    productoNombre: item.nombre,
    cantidad: item.cantidad,
    precioUnitCop: item.precioUnitCop,
    subtotalCop: Number(calcularSubtotalItem(itemsParaTotal[indice]!)),
    notas: item.nota,
    estadoItem: "listo",
    modificadores: item.modificadores.map((m) => ({ nombre: m.nombre, precioDeltaCop: m.precioDeltaCop })),
  }));

  return { pedido, itemsConfirmados };
}
