import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export const TZ_BOGOTA = "America/Bogota";

export function ahoraBogota(): Date {
  return new TZDate(Date.now(), TZ_BOGOTA);
}

export function formatearFecha(
  fecha: Date,
  patron = "d 'de' MMMM 'de' yyyy, h:mm a"
): string {
  return format(new TZDate(fecha.getTime(), TZ_BOGOTA), patron, { locale: es });
}

export function formatearHora(fecha: Date): string {
  return formatearFecha(fecha, "h:mm a");
}

/** Límites [desde, hasta) de "hoy" en Bogotá, como instantes — para filtrar
 *  filas de un día calendario local sin que el corte caiga a medianoche UTC. */
export function limitesDeHoyBogota(): { desde: Date; hasta: Date } {
  const ahora = new TZDate(Date.now(), TZ_BOGOTA);
  const desde = new TZDate(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0, 0, TZ_BOGOTA);
  const hasta = new TZDate(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1, 0, 0, 0, 0, TZ_BOGOTA);
  return { desde, hasta };
}
