import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { tokenValido } from "./autenticacion";
import { construirPaqueteImpresion } from "./paqueteImpresion";
import { ejecutarImpresion } from "./imprimir";

const CABECERAS_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-bridge-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface ConfigServidor {
  token: string;
  printerIp: string;
  printerPuerto: number;
}

function responderJson(res: ServerResponse, status: number, cuerpo: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json", ...CABECERAS_CORS });
  res.end(JSON.stringify(cuerpo));
}

async function leerCuerpo(req: IncomingMessage): Promise<string> {
  const trozos: Buffer[] = [];
  for await (const trozo of req) trozos.push(trozo as Buffer);
  return Buffer.concat(trozos).toString("utf-8");
}

interface CuerpoImprimir {
  printer?: unknown;
  escpos_base64?: unknown;
}

/** Servidor HTTP del print-bridge: CORS abierto (solo alcanzable desde la
 *  LAN del local -- mismo criterio que login-pin, CLAUDE.md §10.2), token
 *  compartido en X-Bridge-Token, y un único camino de impresión real vía
 *  paqueteImpresion.ts + imprimir.ts (socket TCP a la impresora de red).
 *  Sin test automatizado (servidor HTTP real) -- se verifica manualmente
 *  con curl. */
export function crearServidor(config: ConfigServidor): Server {
  return createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CABECERAS_CORS);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/salud") {
      responderJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && req.url === "/print") {
      if (!tokenValido(req.headers["x-bridge-token"] as string | undefined, config.token)) {
        responderJson(res, 401, { ok: false, error: "Token inválido" });
        return;
      }

      let cuerpo: CuerpoImprimir;
      try {
        cuerpo = JSON.parse(await leerCuerpo(req)) as CuerpoImprimir;
      } catch {
        responderJson(res, 400, { ok: false, error: "Cuerpo inválido" });
        return;
      }
      if (typeof cuerpo.escpos_base64 !== "string" || typeof cuerpo.printer !== "string" || !cuerpo.printer) {
        responderJson(res, 400, { ok: false, error: "Faltan campos" });
        return;
      }

      const paqueteResultado = construirPaqueteImpresion(cuerpo.escpos_base64, config.printerIp, config.printerPuerto);
      if (!paqueteResultado.ok) {
        responderJson(res, 400, { ok: false, error: paqueteResultado.error });
        return;
      }

      const resultadoImpresion = await ejecutarImpresion(paqueteResultado.valor);
      if (!resultadoImpresion.ok) {
        responderJson(res, 500, { ok: false, error: resultadoImpresion.error });
        return;
      }

      responderJson(res, 200, { ok: true });
      return;
    }

    responderJson(res, 404, { ok: false, error: "No encontrado" });
  });
}
