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

// Copias con creadoEn dentro de esta ventana no se borran aunque falten en
// la foto del servidor: la foto pudo tomarse ANTES de que el pedido
// existiera (el refresco arranca al montar la página y sus consultas tardan
// segundos; crear un pedido en ese intervalo perdía su copia local -- bug
// real, hallado con verificación en navegador). En el próximo refresco el
// pedido ya aparece en la foto y entra al flujo normal.
const VENTANA_PROTECCION_RECIENTES_MS = 2 * 60_000;

/** Reemplaza el conjunto de copias locales que vinieron del servidor por
 *  uno fresco, sin tocar: (1) los pedidos con ids en `idsProtegidos` (los
 *  creados offline cuya sincronización sigue pendiente -- borrarlos aquí
 *  perdería la única copia visible antes de que el servidor los tenga), y
 *  (2) las copias creadas hace menos de VENTANA_PROTECCION_RECIENTES_MS
 *  que falten en la foto (carrera foto-vieja vs escritura-nueva). */
export async function reemplazarPedidosLocalesDelServidor(
  pedidosServidor: PedidoLocal[],
  idsProtegidos: Set<string>,
): Promise<void> {
  const limiteReciente = Date.now() - VENTANA_PROTECCION_RECIENTES_MS;
  const idsServidor = new Set(pedidosServidor.map((p) => p.pedidoId));
  await baseDatosOffline.transaction("rw", baseDatosOffline.pedidosLocales, async () => {
    const actuales = await baseDatosOffline.pedidosLocales.toArray();
    const aBorrar = actuales
      .filter((p) => {
        if (idsProtegidos.has(p.pedidoId)) return false;
        if (idsServidor.has(p.pedidoId)) return true; // se sobreescribe abajo, no importa
        return new Date(p.creadoEn).getTime() < limiteReciente;
      })
      .map((p) => p.pedidoId);
    await baseDatosOffline.pedidosLocales.bulkDelete(aBorrar);
    await baseDatosOffline.pedidosLocales.bulkPut(pedidosServidor.filter((p) => !idsProtegidos.has(p.pedidoId)));
  });
}
