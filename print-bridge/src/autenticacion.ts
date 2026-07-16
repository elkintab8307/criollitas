/** Compara el header X-Bridge-Token contra el token configurado
 *  (PRINT_BRIDGE_TOKEN en .env). Un header ausente o vacío siempre se
 *  rechaza, incluso si el token esperado también está vacío -- eso indica
 *  una configuración incompleta, nunca una autorización válida. */
export function tokenValido(headerToken: string | undefined, tokenEsperado: string): boolean {
  return typeof headerToken === "string" && headerToken.length > 0 && headerToken === tokenEsperado;
}
