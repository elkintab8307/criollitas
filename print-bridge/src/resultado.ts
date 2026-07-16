export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string };

export function ok<T>(valor: T): Resultado<T> {
  return { ok: true, valor };
}

export function err<T>(error: string): Resultado<T> {
  return { ok: false, error };
}
