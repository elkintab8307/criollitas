/** Rutas fijas que la Cajera necesita poder alcanzar con una navegación
 *  completa (window.location.href, no router.push) mientras está sin
 *  conexión. "/pedido/plantilla-offline" no es un pedido real: es el shell
 *  de la ruta dinámica /pedido/[id] (Client Component que lee el id de la
 *  URL real del navegador) -- el Service Worker lo sirve como respaldo
 *  para CUALQUIER /pedido/<id> sin copia exacta (Bloque J3e), porque el id
 *  de un pedido creado offline no existe hasta que se crea y no se puede
 *  precargar individualmente. */
export const RUTA_PLANTILLA_PEDIDO = "/pedido/plantilla-offline";

export const RUTAS_PRECARGA_OFFLINE = [
  "/pin",
  "/turno/abrir",
  "/turno/cerrar",
  "/turno/movimientos",
  "/mi-turno",
  "/pedidos",
  "/pedido/nuevo",
  RUTA_PLANTILLA_PEDIDO,
] as const;

// Mismo nombre que usa public/sw.js para peticiones de navegación real --
// deben coincidir para que el Service Worker encuentre lo que esta
// función guarda aquí.
const NOMBRE_CACHE_SHELL = "criollitas-shell-v2";

/** Descarga los assets (/_next/static/*: chunks JS, CSS, fuentes) que el
 *  HTML precargado referencia, SIN el header de bypass -- así pasan por el
 *  Service Worker y quedan en su caché normal de assets. Sin esto, una
 *  página nunca visitada online sirve su HTML desde la precarga pero no
 *  puede hidratar React sin conexión (sus chunks nunca se descargaron), y
 *  cualquier botón/form queda muerto o dispara un submit nativo que
 *  navega y falla (bug real, hallado con verificación en navegador). */
async function precargarAssetsDelHtml(html: string): Promise<void> {
  const urls = [...html.matchAll(/(?:src|href)="(\/_next\/[^"]+)"/g)].map((m) => m[1]!);
  await Promise.all(
    [...new Set(urls)].map(async (url) => {
      try {
        await fetch(url, { credentials: "same-origin" });
      } catch {
        // Sin red en este intento -- se reintenta en la próxima precarga.
      }
    }),
  );
}

/** Precarga en Cache Storage la versión de página completa de cada ruta
 *  de RUTAS_PRECARGA_OFFLINE (y los assets que cada una referencia), para
 *  que una navegación completa después de una acción offline siempre
 *  tenga algo que servir, sin depender de que la Cajera ya haya visitado
 *  la página antes online. Escribe directo en Cache Storage (accesible
 *  desde la página, no solo desde el Service Worker) -- no depende de que
 *  el Service Worker esté activo todavía. Sin test unitario (Cache
 *  Storage real, mismo criterio que el resto de lib/offline/). */
export async function precargarRutasOffline(): Promise<void> {
  if (typeof caches === "undefined") return;
  const cache = await caches.open(NOMBRE_CACHE_SHELL);
  await Promise.all(
    RUTAS_PRECARGA_OFFLINE.map(async (ruta) => {
      try {
        // El header x-precarga-offline le dice al Service Worker que NO
        // sirva esta petición desde sus cachés (public/sw.js) -- la
        // precarga necesita el estado fresco del servidor con las cookies
        // recién fijadas, no la copia guardada de antes.
        const respuesta = await fetch(ruta, {
          credentials: "same-origin",
          headers: { "x-precarga-offline": "1" },
        });
        // Una respuesta redirigida (ej. sin la cookie pin_validado todavía
        // aplicada, cae a /pin) no se guarda -- Chromium rechaza responder
        // a una navegación con una respuesta así, y dejaría esa ruta
        // permanentemente rota offline bajo la URL equivocada (bug real,
        // hallado con verificación en navegador). Por esto esta función
        // solo se llama en los momentos en que las cookies ya son válidas
        // con certeza -- ver PinPad.tsx, FormularioAbrirTurno.tsx y
        // ManejadorReconexion.tsx.
        if (respuesta.ok && !respuesta.redirected) {
          const paraAssets = respuesta.clone();
          await cache.put(ruta, respuesta);
          await precargarAssetsDelHtml(await paraAssets.text());
        }
      } catch {
        // Sin red en este intento -- se reintenta en el próximo disparo
        // (próximo inicio de sesión, apertura de turno o reconexión).
      }
    }),
  );
}
