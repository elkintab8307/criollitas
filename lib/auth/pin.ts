// NOTA: esta ventana de rate limit (5 intentos / 5 minutos) está duplicada
// en supabase/functions/login-pin/index.ts porque la Edge Function (Deno,
// runtime aislado) no puede importar hoy este módulo. Si se cambia aquí,
// replicar el cambio allá. Diferencia de borde conocida: aquí se filtra con
// `<` (estrictamente dentro de la ventana); en la Edge Function se filtra
// con `gte` sobre el límite `desde` (equivalente en la práctica, pero no
// idéntico bit a bit). Unificar está pendiente para la próxima tarea de auth.
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
