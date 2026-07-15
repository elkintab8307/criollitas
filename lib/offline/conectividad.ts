export type EstadoConectividad = "online" | "offline";

export interface ResultadoPing {
  exito: boolean;
  enMs: number;
}

/** Decide el estado de conectividad combinando la señal de red del
 *  navegador (`navigator.onLine`, solo indica si hay interfaz de red, no
 *  si de verdad hay internet) con el resultado del último ping activo a
 *  Supabase. Sin señal de red, offline siempre. Con señal de red y sin
 *  ping todavía, se asume online hasta el primer resultado (evita mostrar
 *  "offline" en el instante en que carga la app). */
export function evaluarConectividad(
  navegadorOnline: boolean,
  ultimoPing: ResultadoPing | null,
): EstadoConectividad {
  if (!navegadorOnline) return "offline";
  if (ultimoPing === null) return "online";
  return ultimoPing.exito ? "online" : "offline";
}
