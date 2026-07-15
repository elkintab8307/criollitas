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
        fetch(event.request)
          .then((respuestaRed) => cache.put(event.request, respuestaRed))
          .catch(() => {});
        return cacheada;
      }
      try {
        const respuestaRed = await fetch(event.request);
        cache.put(event.request, respuestaRed.clone());
        return respuestaRed;
      } catch (error) {
        throw error;
      }
    }),
  );
});
