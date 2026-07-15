import type { ResultadoPing } from "@/lib/offline/conectividad";

const TIMEOUT_MS = 3000;

/** Ping liviano a Supabase para confirmar que hay internet real, no solo
 *  señal de red -- cualquier respuesta (incluso 404/401) prueba que el
 *  camino de red está vivo, así que no depende de un endpoint específico
 *  que responda 200. Sin test unitario (fetch/AbortController de
 *  navegador no aportan valor mockeados), mismo criterio que otros
 *  wrappers delgados del proyecto. */
export async function hacerPing(): Promise<ResultadoPing> {
  const inicio = Date.now();
  const controlador = new AbortController();
  const timeoutId = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL!, {
      method: "HEAD",
      signal: controlador.signal,
    });
    return { exito: true, enMs: Date.now() - inicio };
  } catch {
    return { exito: false, enMs: Date.now() - inicio };
  } finally {
    clearTimeout(timeoutId);
  }
}
