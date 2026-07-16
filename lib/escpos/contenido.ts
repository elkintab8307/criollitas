import { formatearCOP, type MontoCOP } from "@/lib/money";
import { formatearFecha } from "@/lib/dates";

export interface ItemTicket {
  cantidad: number;
  nombre: string;
  subtotalCop: MontoCOP;
}

export interface PagoTicket {
  metodo: string;
  montoCop: MontoCOP;
}

export interface DatosTicket {
  sedeNombre: string;
  numeroCorto: number;
  fecha: Date;
  origen: string;
  items: ItemTicket[];
  subtotalCop: MontoCOP;
  totalCop: MontoCOP;
  pagos: PagoTicket[];
}

// Impresora real: COLPOS de 80mm, 48 columnas en Font A (CLAUDE.md §10.3) --
// en una de 58mm serían 32.
const ANCHO_TICKET = 48;
const SEPARADOR = "-".repeat(ANCHO_TICKET);

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  nequi: "Nequi",
  daviplata: "Daviplata",
  bancolombia_qr: "Bancolombia QR",
  datafono: "Datáfono",
  otro: "Otro",
};

/** Arma las líneas de texto de la tirilla de cobro (CLAUDE.md §2.6, §10.2).
 *  Función pura: no sabe nada de ESC/POS, solo decide qué contenido va y en
 *  qué orden — la codificación a bytes vive en codificarEscPos. */
export function construirLineasTicket(datos: DatosTicket): string[] {
  const lineas: string[] = [];
  // Guion simple, no em dash: codificarEscPos codifica con Buffer "binary"
  // (latin1, 1 byte por carácter, lo que entienden las impresoras
  // térmicas) — un em dash (U+2014) queda fuera de ese rango y se
  // corrompe en bytes reales. Tildes/¡/@ sí sobreviven (≤ U+00FF).
  lineas.push("Criollitas - Arepas Rellenas");
  lineas.push(datos.sedeNombre);
  lineas.push(SEPARADOR);
  // numeroCorto 0 = pedido cobrado offline (Bloque J3f): el número lo
  // asigna el servidor al sincronizar, así que la tirilla no puede
  // inventarse uno.
  lineas.push(datos.numeroCorto > 0 ? `Pedido #${datos.numeroCorto}` : "Pedido (por sincronizar)");
  lineas.push(formatearFecha(datos.fecha));
  lineas.push(datos.origen);
  lineas.push(SEPARADOR);
  for (const item of datos.items) {
    lineas.push(`${item.cantidad}x ${item.nombre}`);
    lineas.push(`  ${formatearCOP(item.subtotalCop)}`);
  }
  lineas.push(SEPARADOR);
  lineas.push(`Subtotal: ${formatearCOP(datos.subtotalCop)}`);
  lineas.push(`TOTAL: ${formatearCOP(datos.totalCop)}`);
  lineas.push(SEPARADOR);
  for (const pago of datos.pagos) {
    lineas.push(`${ETIQUETA_METODO[pago.metodo] ?? pago.metodo}: ${formatearCOP(pago.montoCop)}`);
  }
  lineas.push(SEPARADOR);
  lineas.push("¡Gracias por tu compra!");
  lineas.push("@criollitas_armenia");
  return lineas;
}
