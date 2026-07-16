import { connect } from "node:net";
import { err, ok, type Resultado } from "./resultado";
import type { PaqueteImpresion } from "./paqueteImpresion";

const TIMEOUT_MS = 5000;

/** Abre un socket TCP a la impresora, escribe los bytes ESC/POS y cierra
 *  la conexión (protocolo "raw"/JetDirect, puerto 9100 típico) -- la
 *  impresora imprime todo lo recibido hasta el cierre. Resuelve una sola
 *  vez sin importar qué evento dispare primero (close/error/timeout). */
export async function ejecutarImpresion(paquete: PaqueteImpresion): Promise<Resultado<null>> {
  return new Promise((resolve) => {
    let resuelto = false;
    function resolverUnaVez(resultado: Resultado<null>) {
      if (resuelto) return;
      resuelto = true;
      resolve(resultado);
    }

    const socket = connect({ host: paquete.ip, port: paquete.puerto, timeout: TIMEOUT_MS });

    socket.on("connect", () => {
      socket.end(paquete.bytes);
    });
    socket.on("close", () => resolverUnaVez(ok(null)));
    socket.on("timeout", () => {
      socket.destroy();
      resolverUnaVez(err("Tiempo de espera agotado conectando a la impresora"));
    });
    socket.on("error", (error) => {
      resolverUnaVez(err(error.message));
    });
  });
}
