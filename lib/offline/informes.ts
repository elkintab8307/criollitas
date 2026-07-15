import { baseDatosOffline, type InformeCache } from "@/lib/offline/db";

export async function guardarInforme(clave: string, datos: unknown): Promise<void> {
  await baseDatosOffline.informesCache.put({ clave, datos, descargadoEn: new Date().toISOString() });
}

export async function leerInforme(clave: string): Promise<InformeCache | undefined> {
  return baseDatosOffline.informesCache.get(clave);
}
