const CACHE_SHELL = "criollitas-shell-v2";
const CACHE_RSC = "criollitas-rsc-v1";
const CACHES_VIGENTES = [CACHE_SHELL, CACHE_RSC];

self.addEventListener("install", () => {
  self.skipWaiting();
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
  if (event.request.mode === "navigate") {
    const url = event.request.url;
    event.respondWith(
      caches.open(CACHE_SHELL).then(async (cache) => {
        // ignoreSearch: el shell precargado de /pedido/nuevo (sin query)
        // sirve igual para /pedido/nuevo?canal=llevar o ?mesaId=... -- la
        // página lee sus parámetros de la URL real del navegador, no del
        // payload embebido (ver app/(vendedora)/pedido/nuevo/page.tsx).
        const cacheada = await cache.match(url, { ignoreVary: true, ignoreSearch: true });
        if (cacheada) {
          fetch(url, { credentials: "same-origin" })
            .then((respuestaRed) => {
              if (respuestaRed.ok && !respuestaRed.redirected) cache.put(url, respuestaRed);
            })
            .catch(() => {});
          return cacheada;
        }
        try {
          const respuestaRed = await fetch(url, { credentials: "same-origin" });
          // Una respuesta que vino de una redirección (ej. sin la cookie
          // pin_validado todavía, cayó a /pin) no se guarda -- Chromium
          // rechaza responder a una navegación con una respuesta así, y
          // guardarla dejaría esa URL permanentemente rota offline (bug
          // real, hallado con verificación en navegador: cache.match
          // devolvía la respuesta de /pin bajo la clave /turno/abrir).
          if (respuestaRed.ok && !respuestaRed.redirected) cache.put(url, respuestaRed.clone());
          return respuestaRed;
        } catch (error) {
          // Sin red y sin copia exacta: las rutas dinámicas de pedido
          // (/pedido/<id>) comparten todas el mismo shell de página -- un
          // Client Component que lee el id de la URL real del navegador
          // (Bloque J3e). Se sirve la plantilla precargada
          // (lib/offline/precargaRutas.ts, RUTA_PLANTILLA_PEDIDO); el id
          // de un pedido creado offline no existía cuando se precargó,
          // así que nunca puede haber copia exacta para él.
          const pathname = new URL(url).pathname;
          if (/^\/pedido\/[^/]+$/.test(pathname) && pathname !== "/pedido/nuevo") {
            const plantilla = await cache.match("/pedido/plantilla-offline", { ignoreVary: true });
            if (plantilla) return plantilla;
          }
          throw error;
        }
      }),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_RSC).then(async (cache) => {
      const cacheada = await cache.match(event.request);
      if (cacheada) {
        // cache-first: sirve la copia guardada, y de paso refresca en
        // segundo plano si hay red (no bloquea la respuesta al usuario).
        // Solo sobrescribe la copia buena si la respuesta nueva es
        // exitosa -- un 500/401 transitorio no debe reemplazar el shell.
        fetch(event.request)
          .then((respuestaRed) => {
            if (respuestaRed.ok) cache.put(event.request, respuestaRed);
          })
          .catch(() => {});
        return cacheada;
      }
      const respuestaRed = await fetch(event.request);
      if (respuestaRed.ok) cache.put(event.request, respuestaRed.clone());
      return respuestaRed;
    }),
  );
});
