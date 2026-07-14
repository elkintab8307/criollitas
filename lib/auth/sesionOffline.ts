import { SignJWT, jwtVerify } from "jose";

import type { Rol } from "@/lib/auth/roles";

export const COOKIE_SESION_OFFLINE = "sesion_offline";
export const VENTANA_SESION_OFFLINE_SEGUNDOS = 60 * 60 * 12;

export type PayloadSesionOffline = {
  usuarioId: string;
  rol: Rol;
  sedeId: string;
};

function secreto(): Uint8Array {
  const valor = process.env.OFFLINE_SESSION_SECRET;
  if (!valor) {
    throw new Error("OFFLINE_SESSION_SECRET no está configurado");
  }
  return new TextEncoder().encode(valor);
}

/**
 * Firma un token de sesión offline. Debe emitirse únicamente tras una
 * validación ONLINE exitosa de `getUser()` (nunca se renueva a partir de
 * otra validación offline previa — la ventana de 12h siempre cuenta desde
 * el último contacto real con Supabase).
 */
export async function crearTokenSesionOffline(payload: PayloadSesionOffline): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${VENTANA_SESION_OFFLINE_SEGUNDOS}s`)
    .sign(secreto());
}

/** Verifica el token; null si falta, es inválido, o ya expiró la ventana. */
export async function verificarTokenSesionOffline(
  tokenCrudo: string | undefined,
): Promise<PayloadSesionOffline | null> {
  if (!tokenCrudo) return null;

  try {
    const { payload } = await jwtVerify(tokenCrudo, secreto());
    if (
      typeof payload.usuarioId !== "string" ||
      typeof payload.rol !== "string" ||
      typeof payload.sedeId !== "string"
    ) {
      return null;
    }
    return { usuarioId: payload.usuarioId, rol: payload.rol as Rol, sedeId: payload.sedeId };
  } catch {
    return null;
  }
}
