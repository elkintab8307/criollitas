import { baseDatosOffline, type ItemPedidoLocal, type PedidoLocal } from "@/lib/offline/db";

/** Wrappers delgados sobre Dexie -- sin test unitario dedicado, mismo
 *  criterio que lib/offline/cola.ts (requieren IndexedDB real). */

export async function crearPedidoLocal(pedido: PedidoLocal): Promise<void> {
  await baseDatosOffline.pedidosLocales.put(pedido);
}

export async function leerPedidoLocal(pedidoId: string): Promise<PedidoLocal | undefined> {
  return baseDatosOffline.pedidosLocales.get(pedidoId);
}

export async function agregarItemsPedidoLocal(pedidoId: string, items: ItemPedidoLocal[]): Promise<void> {
  const pedido = await baseDatosOffline.pedidosLocales.get(pedidoId);
  if (!pedido) return;
  await baseDatosOffline.pedidosLocales.put({ ...pedido, items: [...pedido.items, ...items] });
}

export async function marcarPedidoLocalCobrado(pedidoId: string): Promise<void> {
  const pedido = await baseDatosOffline.pedidosLocales.get(pedidoId);
  if (!pedido) return;
  await baseDatosOffline.pedidosLocales.put({ ...pedido, estado: "cobrado" });
}
