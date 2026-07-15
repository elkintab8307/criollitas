import { esRutaPublica, resolverAccesoRuta } from "@/lib/auth/roles";
import type { SesionOffline } from "@/lib/offline/sesionOfflineStore";

export type DecisionGuardia = { tipo: "quedarse" } | { tipo: "redirigir"; destino: string };

/** Núcleo puro: decide si, estando offline, la ruta actual requiere
 *  redirigir a /pin (sin sesión offline activa) o a la ruta base del rol
 *  (sesión offline de un rol sin acceso a esta ruta) -- reutiliza las
 *  mismas reglas de acceso que ya aplica middleware.ts cuando hay
 *  conexión (esRutaPublica/resolverAccesoRuta), sin duplicarlas. */
export function decidirRedireccionOffline(
  pathname: string,
  sesion: SesionOffline | null,
): DecisionGuardia {
  if (esRutaPublica(pathname)) return { tipo: "quedarse" };
  if (!sesion) return { tipo: "redirigir", destino: "/pin" };
  const decision = resolverAccesoRuta(sesion.rol, pathname);
  return decision.tipo === "permitido"
    ? { tipo: "quedarse" }
    : { tipo: "redirigir", destino: decision.destino };
}
