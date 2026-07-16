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

export async function listarPedidosLocales(): Promise<PedidoLocal[]> {
  return baseDatosOffline.pedidosLocales.toArray();
}

export async function eliminarPedidoLocal(pedidoId: string): Promise<void> {
  await baseDatosOffline.pedidosLocales.delete(pedidoId);
}

/** Reemplaza el conjunto de copias locales que vinieron del servidor por
 *  uno fresco, sin tocar los pedidos con ids en `idsProtegidos` (los
 *  creados offline cuya sincronización sigue pendiente -- borrarlos aquí
 *  perdería la única copia visible antes de que el servidor los tenga). */
export async function reemplazarPedidosLocalesDelServidor(
  pedidosServidor: PedidoLocal[],
  idsProtegidos: Set<string>,
): Promise<void> {
  await baseDatosOffline.transaction("rw", baseDatosOffline.pedidosLocales, async () => {
    const actuales = await baseDatosOffline.pedidosLocales.toArray();
    const aBorrar = actuales.filter((p) => !idsProtegidos.has(p.pedidoId)).map((p) => p.pedidoId);
    await baseDatosOffline.pedidosLocales.bulkDelete(aBorrar);
    await baseDatosOffline.pedidosLocales.bulkPut(pedidosServidor.filter((p) => !idsProtegidos.has(p.pedidoId)));
  });
}
