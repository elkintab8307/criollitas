import { baseDatosOffline, type OperacionCola } from "@/lib/offline/db";

/** Wrappers delgados sobre Dexie -- sin test unitario dedicado, mismo
 *  criterio que lib/reportes/exportar.ts (requieren IndexedDB real). */

export async function encolarOperacion(
  op: Omit<OperacionCola, "id" | "sincronizada">,
): Promise<number> {
  return baseDatosOffline.colaSync.add({ ...op, sincronizada: false });
}

export async function listarPendientes(): Promise<OperacionCola[]> {
  return baseDatosOffline.colaSync.where("sincronizada").equals(0).sortBy("creadaEn");
}

export async function marcarSincronizada(id: number): Promise<void> {
  await baseDatosOffline.colaSync.update(id, { sincronizada: true });
}
