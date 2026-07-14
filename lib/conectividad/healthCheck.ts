import { detectarModoVerificacion } from "@/lib/auth/jwtLocal";
import { esErrorDeRed } from "@/lib/conectividad/errorRed";
import { reportarExito, reportarFalloDeRed } from "@/lib/conectividad/estado";

const INTERVALO_MS = 7_000;
const TIMEOUT_MS = 2_000;

let intervaloIniciado = false;

async function verificarUnaVez(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return;

  try {
    const respuesta = await fetch(`${url}/auth/v1/health`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (respuesta.ok) {
      reportarExito();
    } else {
      // Respuesta HTTP real (no fallo de red): Supabase está vivo, aunque
      // el endpoint de salud responda distinto a 200 — no es un problema
      // de conectividad del local.
      reportarExito();
    }
    // Aprovecha que hay red confirmada para detectar/cachear el modo de
    // verificación JWT si aún no se ha logrado (ver lib/auth/jwtLocal.ts).
    void detectarModoVerificacion();
  } catch (error) {
    if (esErrorDeRed(error)) {
      reportarFalloDeRed();
    }
  }
}

/**
 * Arranca el loop de healthcheck una sola vez por proceso. Debe llamarse
 * desde instrumentation.ts (hook oficial de Next.js para inicialización
 * única del servidor), nunca desde una Server Action o ruta.
 */
export function iniciarHealthCheck(): void {
  if (intervaloIniciado) return;
  intervaloIniciado = true;
  void verificarUnaVez();
  setInterval(() => void verificarUnaVez(), INTERVALO_MS);
}
