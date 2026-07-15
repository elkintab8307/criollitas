import { baseDatosOffline, type OperacionCola } from "@/lib/offline/db";

/** Wrappers delgados sobre Dexie -- sin test unitario dedicado, mismo
 *  criterio que lib/reportes/exportar.ts (requieren IndexedDB real). */

export async function encolarOperacion(
  op: Omit<OperacionCola, "id" | "sincronizada">,
): Promise<number> {
  return baseDatosOffline.colaSync.add({ ...op, sincronizada: false });
}

export async function listarPendientes(): Promise<OperacionCola[]> {
  const todas = await baseDatosOffline.colaSync.orderBy("creadaEn").toArray();
  return todas.filter((op) => !op.sincronizada);
}

export async function marcarSincronizada(id: number): Promise<void> {
  await baseDatosOffline.colaSync.update(id, { sincronizada: true });
}
