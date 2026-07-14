/**
 * Clasifica si un error viene de un fallo de red/conectividad (Supabase
 * inalcanzable) o es un error de dominio/autenticación real. Solo los
 * errores de red activan el modo offline — un token realmente inválido o
 * una operación no autorizada nunca deben tratarse como "sin conexión".
 */
export function esErrorDeRed(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;

  if (error instanceof TypeError) {
    // fetch() en Node/browser lanza TypeError ("fetch failed", "Failed to fetch")
    // cuando no puede completar la conexión, a diferencia de errores HTTP
    // (esos resuelven la promesa con una response, no lanzan).
    return true;
  }

  const codigo = (error as { cause?: { code?: string }; code?: string } | null)?.code
    ?? (error as { cause?: { code?: string } } | null)?.cause?.code;

  const codigosDeRed = ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN"];
  if (typeof codigo === "string" && codigosDeRed.includes(codigo)) return true;

  const mensaje = error instanceof Error ? error.message : String(error);
  return /fetch failed|network|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(mensaje);
}
