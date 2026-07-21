const CACHE_SHELL = "criollitas-shell-v2";
const CACHE_RSC = "criollitas-rsc-v1";
const CACHES_VIGENTES = [CACHE_SHELL, CACHE_RSC];

// 5s: una wifi débil o un router sin salida a internet (LAN viva, sin
// respuesta real) no rechaza la conexión -- la deja colgada. Sin este
// timeout, fetch() nunca resuelve ni falla, así que el "catch" que sirve
// el respaldo cacheado de abajo nunca se alcanza: el módulo queda
// esperando indefinidamente en vez de caer a la copia offline en
// segundos (bug real reportado por el usuario: "los módulos no
// responden"). Mismo patrón que lib/offline/ping.ts (3s, ahí más corto
// porque es un HEAD liviano; aquí hay página/datos reales de por medio).
const TIMEOUT_FETCH_MS = 5000;

function fetchConTimeout(request, opciones) {
  const controlador = new AbortController();
  const timeoutId = setTimeout(() => controlador.abort(), TIMEOUT_FETCH_MS);
  return fetch(request, { ...opciones, signal: controlador.signal }).finally(() => clearTimeout(timeoutId));
}

/** Cuenta las operaciones pendientes de la cola de sincronización leyendo
 *  IndexedDB directo (Dexie no está disponible dentro del Service Worker).
 *  Los nombres ("criollitas-offline", "colaSync", estado "pendiente")
 *  deben coincidir con lib/offline/db.ts. Si algo falla (base aún no
 *  creada, esquema viejo), se asume 0 -- bloquear la activación por un
 *  error de lectura dejaría el SW viejo para siempre. */
function contarPendientesColaSync() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open("criollitas-offline");
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction("colaSync", "readonly");
          const getAll = tx.objectStore("colaSync").getAll();
          getAll.onsuccess = () => {
            db.close();
            resolve(getAll.result.filter((op) => op.estado === "pendiente").length);
          };
          getAll.onerror = () => {
            db.close();
            resolve(0);
          };
        } catch {
          db.close();
          resolve(0);
        }
      };
      req.onerror = () => resolve(0);
    } catch {
      resolve(0);
    }
  });
}

self.addEventListener("install", (event) => {
  // Una versión nueva del SW solo desplaza a la vigente si la cola de
  // sincronización está vacía (spec del modo offline, "Orden de
  // actualización"): datos encolados con el formato de la versión
  // anterior deben subirse con el código que los creó. Si hay
  // pendientes, el SW nuevo queda en espera y tomará control en un
  // arranque futuro, cuando la cola ya esté vacía.
  event.waitUntil(
    contarPendientesColaSync().then((pendientes) => {
      if (pendientes === 0) return self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches
        .keys()
        .then((nombres) => Promise.all(nombres.filter((n) => !CACHES_VIGENTES.includes(n)).map((n) => caches.delete(n)))),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Las peticiones de precarga (lib/offline/precargaRutas.ts) deben ir
  // SIEMPRE a la red, nunca a estas cachés: su propósito es capturar el
  // estado fresco del servidor con las cookies recién fijadas (pin
  // validado / turno abierto). Si pasaran por el cache-first de abajo,
  // recibirían la copia vieja (posiblemente una redirección de antes de
  // abrir el turno) y la precarga nunca se actualizaría (bug real,
  // hallado con verificación en navegador).
  if (event.request.headers.get("x-precarga-offline")) return;

  // Peticiones de navegación real (recargar, escribir la URL,
  // window.location.href) van a una caché separada de las peticiones
  // internas de Next.js (RSC: router.push, prefetch) y siempre ignoran el
  // encabezado Vary al buscar coincidencia -- son exactamente el formato
  // que lib/offline/precargaRutas.ts guarda ahí explícitamente. Sin esto,
  // una página guardada solo en su variante RSC (por una navegación
  // interna previa) no se reconoce como la misma respuesta para una
  // navegación completa offline, y el navegador cae en su página de
  // error nativa (bug real, hallado con verificación en navegador).
  //
  // Se busca/guarda por URL (string), nunca con event.request directamente
  // -- Chromium no permite reutilizar el mismo objeto Request en más de
  // un fetch() para una petición de navegación (bug real, hallado con
  // verificación en navegador: net::ERR_FAILED incluso estando online).
  // Navegaciones: PRIMERO RED, caché solo como respaldo sin conexión. Con
  // el orden inverso (primero caché, refrescar después -- versión
  // anterior), cada pantalla se servía desde la copia guardada incluso
  // estando online: tras cerrar un turno, /pedidos y /mi-turno seguían
  // mostrando el valor de caja del turno anterior hasta la siguiente
  // visita (bug real reportado por el usuario). Los datos financieros
  // renderizados en servidor no admiten "stale-while-revalidate".
  if (event.request.mode === "navigate") {
    const url = event.request.url;
    event.respondWith(
      caches.open(CACHE_SHELL).then(async (cache) => {
        try {
          // redirect "manual": si el servidor redirige (ej. /pedidos sin
          // turno abierto -> /turno/abrir), el SW devuelve la respuesta
          // opaca de redirección y el NAVEGADOR la sigue él mismo --
          // Chromium rechaza (net::ERR_FAILED) que un SW responda a una
          // navegación con una respuesta ya redirigida-y-seguida, y
          // tampoco debe cachearse (dejaría esa URL rota offline). La
          // respuesta opaca tiene status 0, así que el guard de abajo la
          // excluye de la caché sin código extra.
          const respuestaRed = await fetchConTimeout(url, { credentials: "same-origin", redirect: "manual" });
          if (respuestaRed.ok) cache.put(url, respuestaRed.clone());
          return respuestaRed;
        } catch (error) {
          // Sin red: copia exacta guardada. ignoreSearch: el shell
          // precargado de /pedido/nuevo (sin query) sirve igual para
          // /pedido/nuevo?canal=llevar o ?mesaId=... -- la página lee sus
          // parámetros de la URL real del navegador, no del payload
          // embebido (ver app/(vendedora)/pedido/nuevo/page.tsx).
          const cacheada = await cache.match(url, { ignoreVary: true, ignoreSearch: true });
          if (cacheada) return cacheada;
          // Sin copia exacta: las rutas dinámicas de pedido/cobro
          // (/pedido/<id>, /cobrar/<id>) comparten todas el mismo shell de
          // página -- un Client Component que lee el id de la URL real del
          // navegador (Bloques J3e/J3f). Se sirve la plantilla precargada
          // (lib/offline/precargaRutas.ts); el id de un pedido creado
          // offline no existía cuando se precargó, así que nunca puede
          // haber copia exacta para él.
          const pathname = new URL(url).pathname;
          if (/^\/pedido\/[^/]+$/.test(pathname) && pathname !== "/pedido/nuevo") {
            const plantilla = await cache.match("/pedido/plantilla-offline", { ignoreVary: true });
            if (plantilla) return plantilla;
          }
          if (/^\/cobrar\/[^/]+$/.test(pathname)) {
            const plantilla = await cache.match("/cobrar/plantilla-offline", { ignoreVary: true });
            if (plantilla) return plantilla;
          }
          throw error;
        }
      }),
    );
    return;
  }

  // Assets estáticos de Next (/_next/static/*): el nombre de archivo lleva
  // un hash de contenido, así que la copia guardada nunca puede quedar
  // desactualizada -- primero caché es correcto y más rápido aquí.
  const esAssetInmutable = new URL(event.request.url).pathname.startsWith("/_next/static/");
  if (esAssetInmutable) {
    event.respondWith(
      caches.open(CACHE_RSC).then(async (cache) => {
        const cacheada = await cache.match(event.request);
        if (cacheada) return cacheada;
        const respuestaRed = await fetchConTimeout(event.request);
        if (respuestaRed.ok) cache.put(event.request, respuestaRed.clone());
        return respuestaRed;
      }),
    );
    return;
  }

  // Resto de GETs (payloads RSC de router.push/prefetch, imágenes, etc.):
  // primero red -- son datos que cambian con cada mutación (mismo motivo
  // que las navegaciones); la caché queda solo como respaldo offline.
  event.respondWith(
    caches.open(CACHE_RSC).then(async (cache) => {
      try {
        const respuestaRed = await fetchConTimeout(event.request);
        if (respuestaRed.ok) cache.put(event.request, respuestaRed.clone());
        return respuestaRed;
      } catch (error) {
        const cacheada = await cache.match(event.request);
        if (cacheada) return cacheada;
        throw error;
      }
    }),
  );
});
