import { formatearCOP } from "@/lib/money";
import { formatearFecha } from "@/lib/dates";
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
  @page { size: ${ANCHO_MM} auto; margin: 0; }
  * { box-sizing: border-box; }
  body {
    width: ${ANCHO_MM};
    margin: 0;
    padding: 4mm;
    font-family: "Courier New", monospace;
    font-size: 12px;
    color: #000;
    background: #fff;
  }
  .centro { text-align: center; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .fila, .fila-item { display: flex; justify-content: space-between; gap: 8px; }
  .fila-item span:last-child { white-space: nowrap; }
  .total { font-weight: bold; font-size: 14px; }
  .marca { font-weight: bold; font-size: 14px; }
</style>
</head>
<body>
  <div class="centro marca">Criollitas - Arepas Rellenas</div>
  <div class="centro">${escaparHtml(datos.sedeNombre)}</div>
  <div class="sep"></div>
  <div>${lineaPedido}</div>
  <div>${formatearFecha(datos.fecha)}</div>
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
  <div class="centro">@criollitas_armenia</div>
</body>
</html>`;
}
