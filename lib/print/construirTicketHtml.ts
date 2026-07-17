import { formatearCOP } from "@/lib/money";
import { formatearFecha } from "@/lib/dates";
import { LOGO_TICKET_DATA_URI } from "@/lib/print/logoTicket";
import type { DatosTicket } from "@/lib/escpos/contenido";

// Impresora real: térmica de 80mm instalada en Windows como impresora local
// USB (nombre PRINTER_CRIOLLITAS, puerto USB001) -- el navegador imprime la
// impresora que el sistema operativo maneja, ya no bytes ESC/POS crudos por
// red (CLAUDE.md §10).
const ANCHO_MM = "80mm";

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  nequi: "Nequi",
  daviplata: "Daviplata",
  bancolombia_qr: "Bancolombia QR",
  datafono: "Datáfono",
  otro: "Otro",
};

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Arma el documento HTML completo de la tirilla de cobro (CLAUDE.md §2.6,
 *  §10.2), listo para volcarse en una ventana e imprimirse con
 *  `window.print()` (ver lib/print/imprimirTicket.ts). Función pura: no
 *  toca `window` ni el DOM, así que corre igual en el servidor (Server
 *  Action) que en el navegador. */
export function construirTicketHtml(datos: DatosTicket): string {
  const filasItems = datos.items
    .map(
      (item) => `
        <div class="fila-item">
          <span>${item.cantidad}x ${escaparHtml(item.nombre)}</span>
          <span>${formatearCOP(item.subtotalCop)}</span>
        </div>`,
    )
    .join("");

  const filasPagos = datos.pagos
    .map(
      (pago) => `
        <div class="fila">
          <span>${escaparHtml(ETIQUETA_METODO[pago.metodo] ?? pago.metodo)}</span>
          <span>${formatearCOP(pago.montoCop)}</span>
        </div>`,
    )
    .join("");

  const lineaPedido =
    datos.numeroCorto > 0 ? `Pedido #${datos.numeroCorto}` : "Pedido (por sincronizar)";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${lineaPedido}</title>
<style>
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
    padding: 1mm 3mm 2mm 3mm;
    /* Sans-serif y tamaños grandes: en térmicas de 203dpi el Courier de
       12px salía diminuto e ilegible (reporte real del usuario). */
    font-family: Arial, Helvetica, sans-serif;
    font-size: 16px;
    font-weight: 600;
    line-height: 1.35;
    color: #000;
    background: #fff;
  }
  .centro { text-align: center; }
  .sep { border-top: 2px dashed #000; margin: 5px 0; }
  .fila, .fila-item { display: flex; justify-content: space-between; gap: 8px; }
  .fila-item span:last-child { white-space: nowrap; }
  .total { font-weight: 800; font-size: 22px; }
  .marca { font-weight: 800; font-size: 19px; }
  .suave { font-size: 14px; }
  .logo { display: block; width: 34mm; margin: 0 auto 1mm auto; }
</style>
</head>
<body>
  <img class="logo" src="${LOGO_TICKET_DATA_URI}" alt="" />
  <div class="centro marca">Criollitas - Arepas Rellenas</div>
  <div class="centro suave">${escaparHtml(datos.sedeNombre)}</div>
  <div class="sep"></div>
  <div>${lineaPedido}</div>
  <div class="suave">${formatearFecha(datos.fecha)}</div>
  <div>${escaparHtml(datos.origen)}</div>
  <div class="sep"></div>
  ${filasItems}
  <div class="sep"></div>
  <div class="fila"><span>Subtotal</span><span>${formatearCOP(datos.subtotalCop)}</span></div>
  <div class="fila total"><span>TOTAL</span><span>${formatearCOP(datos.totalCop)}</span></div>
  <div class="sep"></div>
  ${filasPagos}
  <div class="sep"></div>
  <div class="centro">¡Gracias por tu compra!</div>
  <div class="centro suave">@criollitas_armenia</div>
</body>
</html>`;
}
