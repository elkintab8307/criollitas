const ESC = "\x1B";
const GS = "\x1D";
const INICIALIZAR = `${ESC}@`; // ESC @ : reset de la impresora
const CORTE = `${GS}V\x00`; // GS V 0 : corte total de papel

/** Codifica líneas de texto plano a un payload ESC/POS en base64, listo
 *  para enviar al print-bridge (CLAUDE.md §10.1). Antepone el reset de
 *  impresora, une las líneas con salto de línea, y agrega el corte de
 *  papel al final. */
export function codificarEscPos(lineas: string[]): string {
  const cuerpo = lineas.join("\n") + "\n";
  const payload = INICIALIZAR + cuerpo + CORTE;
  return Buffer.from(payload, "binary").toString("base64");
}
