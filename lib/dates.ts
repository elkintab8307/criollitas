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
