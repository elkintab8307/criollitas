const CACHE_NAME = "criollitas-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
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
