/**
 * Resultado de una operación de dominio: éxito con valor o fallo con error
 * tipado. Ninguna acción de dominio lanza excepciones (CLAUDE.md §12).
 */
export type Result<T, E> = { ok: true; valor: T } | { ok: false; error: E };

export function ok<T>(valor: T): Result<T, never> {
  return { ok: true, valor };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Código de error de dominio, estable y legible por la UI. */
export type CodigoError = "VALIDACION" | "NO_AUTORIZADO" | "NO_ENCONTRADO" | "BASE_DATOS";

export type DomainError = {
  codigo: CodigoError;
  mensaje: string;
};
