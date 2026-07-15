import { baseDatosOffline, type EntradaCatalogo } from "@/lib/offline/db";

export async function guardarEnCatalogo(clave: string, datos: unknown): Promise<void> {
  await baseDatosOffline.catalogoCache.put({ clave, datos, actualizadaEn: new Date().toISOString() });
}

export async function leerDelCatalogo(clave: string): Promise<EntradaCatalogo | undefined> {
  return baseDatosOffline.catalogoCache.get(clave);
}
