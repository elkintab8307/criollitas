import { LOGO_ESCPOS_BASE64 } from "./logo";

// Todo se maneja como "cadenas binarias" (latin1, 1 byte por carácter) con
// btoa/atob -- globales tanto en el navegador como en Node ≥16 -- en vez de
// Buffer (solo Node): desde el Bloque J3f el ticket también se construye en
// el navegador de la Cajera para poder cobrar e imprimir sin conexión (el
// print-bridge está en la LAN del local, no necesita internet).
const ESC = "\x1B";
const GS = "\x1D";
const INICIALIZAR = `${ESC}@`; // ESC @ : reset de la impresora
const ALINEAR_CENTRO = `${ESC}a\x01`; // ESC a 1 : centrado
const ALINEAR_IZQUIERDA = `${ESC}a\x00`; // ESC a 0 : alineación por defecto (izquierda)
const CORTE = `${GS}V\x00`; // GS V 0 : corte total de papel
const LOGO = atob(LOGO_ESCPOS_BASE64); // GS v 0 : bitmap del logo (lib/escpos/logo.ts)

/** Codifica líneas de texto plano a un payload ESC/POS en base64, listo
 *  para enviar al print-bridge (CLAUDE.md §10.1). Antepone el reset de
 *  impresora y el logo centrado, une las líneas con salto de línea (ya
 *  en alineación izquierda, la que espera el resto del ticket), y agrega
 *  el corte de papel al final. */
export function codificarEscPos(lineas: string[]): string {
  // Cualquier carácter fuera de Latin-1 (> U+00FF, ej. un em dash) se
  // reemplaza por "?" -- btoa lanzaría InvalidCharacterError y un problema
  // de impresión jamás debe tumbar un cobro (CLAUDE.md §10.2). Con Buffer
  // "binary" (implementación anterior) se corrompía en silencio a un byte
  // basura; "?" al menos es legible en el papel.
  const cuerpo = (lineas.join("\n") + "\n").replace(/[^\x00-\xFF]/g, "?");
  const payload = INICIALIZAR + ALINEAR_CENTRO + LOGO + "\n" + ALINEAR_IZQUIERDA + cuerpo + CORTE;
  return btoa(payload);
}
