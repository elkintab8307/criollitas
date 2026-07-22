import { useConectividadStore } from "@/lib/offline/conectividadStore";

export class ErrorTimeout extends Error {
  constructor() {
    super("TIMEOUT");
    this.name = "ErrorTimeout";
  }
}

/** Carrera entre una promesa real y un límite de tiempo -- rechaza con
 *  ErrorTimeout si `promesa` no resuelve dentro de `ms`. Existe porque las
 *  Server Actions (a diferencia de los fetch() del Service Worker, ver
 *  lib/print/... / public/sw.js) son peticiones POST que el Service
 *  Worker ignora por completo (`if (event.request.method !== "GET")
 *  return;`), así que no tienen ningún respaldo ante una red "degradada"
 *  (wifi débil, router sin salida real a internet -- se queda colgada en
 *  vez de fallar rápido). Sin este límite, un formulario crítico (abrir
 *  turno, cobrar, etc.) se queda esperando indefinidamente y la cajera ve
 *  el sistema "trabado" (bug real reportado por el usuario). El timeout
 *  NO cancela la petición real en el servidor -- solo deja de esperarla
 *  en el navegador para poder caer al camino offline; ver el comentario en
 *  cada formulario que lo usa para el manejo del caso borde de una
 *  respuesta tardía que sí llegó a completarse en el servidor. */
export function conTimeout<T>(promesa: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new ErrorTimeout()), ms);
    promesa.then(
      (valor) => {
        clearTimeout(timeoutId);
        resolve(valor);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

/** Se llama justo cuando conTimeout() da por perdida una Server Action --
 *  fuerza el estado de conectividad a "offline" como si el último ping
 *  hubiera fallado, sin esperar a que el ping periódico (cada 15s,
 *  lib/offline/ping.ts) lo note por su cuenta. Es necesario porque
 *  ManejadorReconexion.tsx solo sincroniza la cola pendiente al detectar
 *  la TRANSICIÓN offline->online -- si el estado de conectividad nunca
 *  llegó a marcarse "offline" (navigator.onLine seguía en true y el
 *  próximo ping todavía no corría), una operación encolada por timeout se
 *  quedaría "pendiente" para siempre, visible solo si la cajera nota el
 *  indicador y pulsa "Reintentar" a mano (hallazgo real, encontrado
 *  verificando este mismo fix en el navegador). Al marcarlo aquí, el
 *  próximo ping exitoso sí dispara la sincronización automática. */
export function marcarRedDegradadaPorTimeout(): void {
  useConectividadStore.getState().registrarPing({ exito: false, enMs: -1 });
}
