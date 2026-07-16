import { err, ok, type Resultado } from "./resultado";

export interface PaqueteImpresion {
  ip: string;
  puerto: number;
  bytes: Buffer;
}

const BASE64_VALIDO = /^[A-Za-z0-9+/]+={0,2}$/;

function esBase64Valido(valor: string): boolean {
  return valor.length > 0 && valor.length % 4 === 0 && BASE64_VALIDO.test(valor);
}

function esPuertoValido(puerto: number): boolean {
  return Number.isInteger(puerto) && puerto > 0 && puerto <= 65535;
}

/** Decodifica el ticket y valida el destino antes de que imprimir.ts
 *  (Task 4) abra el socket TCP real. Pura: no toca la red, solo decide
 *  si hay algo válido que enviar y a dónde (ver
 *  docs/superpowers/specs/2026-07-15-print-bridge-red-design.md). */
export function construirPaqueteImpresion(
  escposBase64: string,
  ip: string,
  puerto: number,
): Resultado<PaqueteImpresion> {
  if (!ip.trim()) {
    return err("Falta configurar la IP de la impresora (PRINTER_IP en .env)");
  }
  if (!esPuertoValido(puerto)) {
    return err("El puerto de la impresora no es válido (PRINTER_PORT en .env)");
  }
  if (!esBase64Valido(escposBase64)) {
    return err("El contenido del ticket no es base64 válido");
  }
  const bytes = Buffer.from(escposBase64, "base64");
  return ok({ ip, puerto, bytes });
}
