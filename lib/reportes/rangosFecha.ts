import { TZDate } from "@date-fns/tz";
import { startOfDay, startOfWeek, startOfMonth, startOfYear, addDays, addWeeks, addMonths, addYears } from "date-fns";
import { TZ_BOGOTA } from "@/lib/dates";

export type PresetRango = "dia" | "semana" | "mes" | "anio";

export interface RangoFechas {
  desde: Date;
  hasta: Date;
}

export function resolverRangoPreset(preset: PresetRango, fechaReferencia: Date = new Date()): RangoFechas {
  const referencia = new TZDate(fechaReferencia.getTime(), TZ_BOGOTA);
  switch (preset) {
    case "dia": {
      const desde = new Date(startOfDay(referencia).getTime());
      return { desde, hasta: new Date(addDays(desde, 1).getTime()) };
    }
    case "semana": {
      const desde = new Date(startOfWeek(referencia, { weekStartsOn: 1 }).getTime());
      return { desde, hasta: new Date(addWeeks(desde, 1).getTime()) };
    }
    case "mes": {
      const desde = new Date(startOfMonth(referencia).getTime());
      return { desde, hasta: new Date(addMonths(desde, 1).getTime()) };
    }
    case "anio": {
      const desde = new Date(startOfYear(referencia).getTime());
      return { desde, hasta: new Date(addYears(desde, 1).getTime()) };
    }
  }
}

export function rangoAnterior(rango: RangoFechas): RangoFechas {
  const duracionMs = rango.hasta.getTime() - rango.desde.getTime();
  return {
    desde: new Date(rango.desde.getTime() - duracionMs),
    hasta: new Date(rango.hasta.getTime() - duracionMs),
  };
}
