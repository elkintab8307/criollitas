import { baseDatosOffline, type IdentidadLocal } from "@/lib/offline/db";

export async function guardarIdentidad(
  identidad: Omit<IdentidadLocal, "actualizadaEn">,
): Promise<void> {
  await baseDatosOffline.identidadLocal.put({ ...identidad, actualizadaEn: new Date().toISOString() });
}

export async function leerIdentidad(usuarioId: string): Promise<IdentidadLocal | undefined> {
  return baseDatosOffline.identidadLocal.get(usuarioId);
}

export async function listarIdentidades(): Promise<IdentidadLocal[]> {
  return baseDatosOffline.identidadLocal.toArray();
}
