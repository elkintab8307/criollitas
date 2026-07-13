/** Siguiente número corto de pedido dado los números ya usados hoy en la sede.
 *  Reinicia porque el llamador filtra por el día (ver `limitesDeHoyBogota` en
 *  `lib/dates.ts`); esta función en sí no sabe nada de fechas. */
export function siguienteNumeroCorto(numerosHoy: number[]): number {
  if (numerosHoy.length === 0) return 1;
  return Math.max(...numerosHoy) + 1;
}
