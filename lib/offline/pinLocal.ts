import bcrypt from "bcryptjs";
import { evaluarRateLimit } from "@/lib/auth/pin";
import type { IdentidadLocal } from "@/lib/offline/db";
import { leerIdentidad } from "@/lib/offline/identidad";
import {
  limpiarIntentos,
  listarIntentosRecientes,
  registrarIntentoFallido,
} from "@/lib/offline/intentosPin";

export type ResultadoPinLocal =
  | { tipo: "sin_credencial_local" }
  | { tipo: "bloqueado"; segundosRestantes: number }
  | { tipo: "incorrecto" }
  | { tipo: "correcto"; identidad: IdentidadLocal };

/** Núcleo puro: decide el resultado de un intento de PIN offline a partir
 *  de datos ya calculados (identidad cacheada, si el hash coincide, y el
 *  estado del límite de intentos) -- sin tocar IndexedDB ni bcrypt
 *  directamente, para poder testearlo sin dependencias de navegador. */
export function decidirResultadoPin(
  identidad: IdentidadLocal | undefined,
  coincideHash: boolean,
  rateLimit: { bloqueado: boolean; segundosRestantes: number },
): ResultadoPinLocal {
  if (!identidad) return { tipo: "sin_credencial_local" };
  if (rateLimit.bloqueado) return { tipo: "bloqueado", segundosRestantes: rateLimit.segundosRestantes };
  if (!coincideHash) return { tipo: "incorrecto" };
  return { tipo: "correcto", identidad };
}

/** Orquestación: junta IndexedDB (identidad + intentos) y bcryptjs para
 *  verificar un PIN completamente offline. Sin test unitario dedicado
 *  (requiere IndexedDB real) -- la lógica de decisión que sí importa vive
 *  en decidirResultadoPin, ya testeada arriba. */
export async function verificarPinLocal(usuarioId: string, pin: string): Promise<ResultadoPinLocal> {
  const identidad = await leerIdentidad(usuarioId);
  const fallos = await listarIntentosRecientes(usuarioId);
  const rateLimit = evaluarRateLimit(fallos, new Date());
  const coincideHash =
    identidad && !rateLimit.bloqueado ? await bcrypt.compare(pin, identidad.pinHash) : false;
  const resultado = decidirResultadoPin(identidad, coincideHash, rateLimit);

  if (resultado.tipo === "incorrecto") await registrarIntentoFallido(usuarioId);
  if (resultado.tipo === "correcto") await limpiarIntentos(usuarioId);

  return resultado;
}
