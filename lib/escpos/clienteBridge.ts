export interface ResultadoImpresion {
  exito: boolean;
  error: string | null;
}

/** Envía un ticket ya codificado (ESC/POS en base64) al print-bridge desde
 *  el navegador de la cajera, no desde el servidor. El servidor de la app
 *  corre en Vercel (nube) y no tiene ruta de red hacia el print-bridge
 *  (IP privada de la LAN del local, CLAUDE.md §10.1) -- el PC de caja sí
 *  está en esa misma red, así que el navegador puede alcanzarlo
 *  directamente. Nunca lanza: un fallo de impresión no debe romper el
 *  flujo de cobro (CLAUDE.md §10.2). */
export async function enviarAlPrintBridgeDesdeNavegador(contenidoBase64: string): Promise<ResultadoImpresion> {
  const url = process.env.NEXT_PUBLIC_PRINT_BRIDGE_URL;
  if (!url) return { exito: false, error: "Impresora no configurada en este equipo" };
  try {
    const respuesta = await fetch(`${url}/print`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Bridge-Token": process.env.NEXT_PUBLIC_PRINT_BRIDGE_TOKEN ?? "",
      },
      body: JSON.stringify({ printer: "caja-01", escpos_base64: contenidoBase64 }),
      signal: AbortSignal.timeout(5000),
    });
    return respuesta.ok ? { exito: true, error: null } : { exito: false, error: `HTTP ${respuesta.status}` };
  } catch (error) {
    return { exito: false, error: error instanceof Error ? error.message : "Error de red" };
  }
}
