import { formatearCOP } from "@/lib/money";
import { formatearFecha } from "@/lib/dates";
import { LOGO_TICKET_DATA_URI } from "@/lib/print/logoTicket";
import { estilosTicketBase } from "@/lib/print/estilosTicket";
import type { DatosAperturaCajon, DatosArqueo, DatosMovimiento } from "@/lib/print/contenidoCaja";

const ETIQUETA_TIPO_MOVIMIENTO: Record<DatosMovimiento["tipo"], string> = {
  retiro: "Retiro",
  gasto: "Gasto",
  ingreso_extra: "Ingreso extra",
};

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Etiqueta legible de la diferencia de arqueo: positiva = sobrante,
 *  negativa = faltante, cero = exacto. La cajera lee el papel sin tener
 *  que interpretar el signo mentalmente. */
function etiquetaDiferencia(diferenciaCop: bigint): string {
  if (diferenciaCop > 0n) return "Sobra";
  if (diferenciaCop < 0n) return "Falta";
  return "Exacto";
}

/** Tirilla mínima cuyo único propósito es disparar la apertura del cajón de
 *  dinero conectado a la impresora térmica -- el cajón salta al recibir
 *  cualquier trabajo de impresión (CLAUDE.md §10.1), y el navegador no
 *  puede enviarle un comando aparte sin pasar por un trabajo de impresión
 *  real. Se mantiene deliberadamente corta (sin ítems ni montos) para
 *  gastar el mínimo de papel -- la "cola de papel" del estilo compartido
 *  ya deja el margen de corte. */
export function construirTicketAperturaCajonHtml(datos: DatosAperturaCajon): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Apertura de caja</title>
<style>${estilosTicketBase()}</style>
</head>
<body>
  <img class="logo" src="${LOGO_TICKET_DATA_URI}" alt="" />
  <div class="centro marca">Criollitas - Arepas Rellenas</div>
  <div class="centro suave">${escaparHtml(datos.sedeNombre)}</div>
  <div class="sep"></div>
  <div class="centro">Apertura de caja</div>
  <div class="suave">${formatearFecha(datos.fecha)}</div>
  <div class="suave">Cajera: ${escaparHtml(datos.cajeraNombre)}</div>
  <div class="cola-papel"></div>
</body>
</html>`;
}

/** Tirilla de arqueo, impresa al cerrar el turno (CLAUDE.md §2.4): deja un
 *  registro en papel de con cuánto se abrió la caja, cuánto debía haber
 *  según lo cobrado/movimientos del turno, y cuánto contó la cajera --
 *  para el seguimiento diario del arqueo que pidió el usuario. */
export function construirTicketArqueoHtml(datos: DatosArqueo): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Arqueo de caja</title>
<style>${estilosTicketBase()}</style>
</head>
<body>
  <img class="logo" src="${LOGO_TICKET_DATA_URI}" alt="" />
  <div class="centro marca">Criollitas - Arepas Rellenas</div>
  <div class="centro suave">${escaparHtml(datos.sedeNombre)}</div>
  <div class="sep"></div>
  <div class="centro">Cierre de turno — Arqueo de caja</div>
  <div class="suave">${formatearFecha(datos.fecha)}</div>
  <div class="suave">Cajera: ${escaparHtml(datos.cajeraNombre)}</div>
  <div class="sep"></div>
  <div class="fila"><span>Dinero con que se abrió</span><span>${formatearCOP(datos.efectivoInicialCop)}</span></div>
  <div class="fila"><span>Ventas (efectivo)</span><span>${formatearCOP(datos.ventasEfectivoCop)}</span></div>
  <div class="fila"><span>Salidas (gastos/retiros)</span><span>-${formatearCOP(datos.salidasCop)}</span></div>
  <div class="fila"><span>Entradas extra</span><span>${formatearCOP(datos.entradasExtraCop)}</span></div>
  <div class="sep"></div>
  <div class="fila total"><span>Total en caja (efectivo)</span><span>${formatearCOP(datos.esperadoCop)}</span></div>
  <div class="sep"></div>
  <div class="fila"><span>Efectivo contado</span><span>${formatearCOP(datos.efectivoDeclaradoCop)}</span></div>
  <div class="fila"><span>${etiquetaDiferencia(datos.diferenciaCop)}</span><span>${formatearCOP(datos.diferenciaCop)}</span></div>
  <div class="sep"></div>
  <div class="centro suave">Pagos virtuales (no cuentan para el cuadre)</div>
  <div class="fila"><span>Ventas por otro medio</span><span>${formatearCOP(datos.ventasOtroMedioCop)}</span></div>
  <div class="cola-papel"></div>
</body>
</html>`;
}

/** Comprobante de un movimiento de caja (retiro, gasto o ingreso extra),
 *  impreso al momento de registrarlo (pedido del usuario) -- mismo diseño
 *  visual que la tirilla de cobro (marca, sede, separadores). */
export function construirTicketMovimientoHtml(datos: DatosMovimiento): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${ETIQUETA_TIPO_MOVIMIENTO[datos.tipo]}</title>
<style>${estilosTicketBase()}</style>
</head>
<body>
  <img class="logo" src="${LOGO_TICKET_DATA_URI}" alt="" />
  <div class="centro marca">Criollitas - Arepas Rellenas</div>
  <div class="centro suave">${escaparHtml(datos.sedeNombre)}</div>
  <div class="sep"></div>
  <div class="centro">Comprobante de ${ETIQUETA_TIPO_MOVIMIENTO[datos.tipo]}</div>
  <div class="suave">${formatearFecha(datos.fecha)}</div>
  <div class="suave">Cajera: ${escaparHtml(datos.cajeraNombre)}</div>
  <div class="sep"></div>
  <div>${escaparHtml(datos.concepto)}</div>
  <div class="fila total"><span>Monto</span><span>${formatearCOP(datos.montoCop)}</span></div>
  <div class="cola-papel"></div>
</body>
</html>`;
}
