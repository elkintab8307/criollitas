// Impresora real: térmica de 80mm instalada en Windows como impresora local
// USB (nombre PRINTER_CRIOLLITAS, puerto USB001) -- el navegador imprime la
// impresora que el sistema operativo maneja, ya no bytes ESC/POS crudos por
// red (CLAUDE.md §10).
//
// 72mm, no 80mm: el ÁREA IMPRIMIBLE de una térmica de 80mm es ~72mm -- el
// cabezal no llega a los bordes y el driver corre el contenido hacia la
// derecha su margen físico. Diseñar a 80mm hacía que el borde derecho
// saliera cortado (reporte real del usuario).
export const ANCHO_MM = "72mm";

/** CSS compartido por todas las tirillas (cobro, arqueo, apertura de caja) --
 *  extraído de construirTicketHtml.ts para no repetir el ajuste fino ya
 *  verificado contra la impresora real (tamaño de fuente, colchón derecho,
 *  cola de papel). Las clases (.centro, .sep, .fila, .fila-item, .total,
 *  .marca, .suave, .logo, .cola-papel) son el vocabulario común de todas
 *  las tirillas. */
export function estilosTicketBase(): string {
  return `
  /* size con alto AUTO: la página mide exactamente lo que mide el
     contenido -- clave para que la impresora corte ahí y no alimente el
     resto de un largo fijo. El driver de Windows también debe tener un
     tamaño de papel de largo variable ("80 x Receipt"), ver CLAUDE.md
     §10.3. */
  @page { size: ${ANCHO_MM} auto; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: auto; }
  body {
    width: ${ANCHO_MM};
    /* Sin padding superior (el papel ya sale con margen físico propio) y
       sin padding izquierdo: la impresora corre el contenido a la derecha
       su margen físico. 7mm de colchón a la derecha: con 2mm el último
       dígito de los valores aún se cortaba (verificado con foto real de
       la tirilla) -- el corrimiento físico del cabezal es ~5mm. */
    padding: 0 7mm 0 0;
    /* Sans-serif, grande y TODO en negrita: en térmicas de 203dpi los
       trazos finos salen claritos y el texto pequeño ilegible (reportes
       reales del usuario) -- trazo grueso = impresión más oscura. */
    font-family: Arial, Helvetica, sans-serif;
    font-size: 15px;
    font-weight: 700;
    line-height: 1.35;
    color: #000;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .centro { text-align: center; }
  .sep { border-top: 2px solid #000; margin: 5px 0; }
  .fila, .fila-item { display: flex; justify-content: space-between; gap: 8px; }
  .fila-item span:last-child { white-space: nowrap; }
  .total { font-weight: 900; font-size: 21px; }
  .marca { font-weight: 900; font-size: 17px; }
  .suave { font-size: 13px; }
  .logo { display: block; width: 32mm; margin: 0 auto 1mm auto; }
  /* Papel extra tras el texto para poder cortar sin comerse el contenido
     (pedido del usuario: al menos 2cm). */
  .cola-papel { height: 20mm; }
  `;
}
