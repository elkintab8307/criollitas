import { LOGO_ESCPOS_BASE64 } from "./logo";

const ESC = 0x1b;
const GS = 0x1d;

const INICIALIZAR = Buffer.from([ESC, 0x40]); // ESC @ : reset de la impresora
const ALINEAR_CENTRO = Buffer.from([ESC, 0x61, 0x01]); // ESC a 1 : centrado
const ALINEAR_IZQUIERDA = Buffer.from([ESC, 0x61, 0x00]); // ESC a 0 : alineación por defecto (izquierda)
const CORTE = Buffer.from([GS, 0x56, 0x00]); // GS V 0 : corte total de papel
const LOGO = Buffer.from(LOGO_ESCPOS_BASE64, "base64"); // GS v 0 : bitmap del logo (lib/escpos/logo.ts)

/** Codifica líneas de texto plano a un payload ESC/POS en base64, listo
 *  para enviar al print-bridge (CLAUDE.md §10.1). Antepone el reset de
 *  impresora y el logo centrado, une las líneas con salto de línea (ya
 *  en alineación izquierda, la que espera el resto del ticket), y agrega
 *  el corte de papel al final. */
export function codificarEscPos(lineas: string[]): string {
  const cuerpo = Buffer.from(lineas.join("\n") + "\n", "binary");
  const payload = Buffer.concat([
    INICIALIZAR,
    ALINEAR_CENTRO,
    LOGO,
    Buffer.from("\n", "binary"),
    ALINEAR_IZQUIERDA,
    cuerpo,
    CORTE,
  ]);
  return payload.toString("base64");
}
