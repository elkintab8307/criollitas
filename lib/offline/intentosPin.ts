import { baseDatosOffline } from "@/lib/offline/db";

/** Wrappers delgados sobre Dexie -- sin test unitario dedicado, mismo
 *  criterio que lib/offline/cola.ts (requieren IndexedDB real). */

export async function registrarIntentoFallido(usuarioId: string): Promise<void> {
  await baseDatosOffline.intentosPin.add({ usuarioId, intentoEn: new Date().toISOString() });
}

export async function listarIntentosRecientes(usuarioId: string): Promise<Date[]> {
  const intentos = await baseDatosOffline.intentosPin.where("usuarioId").equals(usuarioId).toArray();
  return intentos.map((i) => new Date(i.intentoEn));
}

export async function limpiarIntentos(usuarioId: string): Promise<void> {
  await baseDatosOffline.intentosPin.where("usuarioId").equals(usuarioId).delete();
}
