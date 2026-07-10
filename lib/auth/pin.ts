export const MAX_INTENTOS = 5;
export const VENTANA_MS = 5 * 60_000;

export function evaluarRateLimit(
  fallos: Date[],
  ahora: Date,
): { bloqueado: boolean; segundosRestantes: number } {
  const enVentana = fallos
    .filter((f) => ahora.getTime() - f.getTime() < VENTANA_MS)
    .sort((a, b) => a.getTime() - b.getTime());
  if (enVentana.length < MAX_INTENTOS) {
    return { bloqueado: false, segundosRestantes: 0 };
  }
  const masAntiguo = enVentana[0];
  const liberaEn = masAntiguo!.getTime() + VENTANA_MS - ahora.getTime();
  return { bloqueado: true, segundosRestantes: Math.ceil(liberaEn / 1000) };
}
