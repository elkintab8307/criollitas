"use client";

import { useEffect } from "react";

/** Registra el Service Worker la primera vez que el sitio carga con
 *  internet, para que quede disponible sin conexión más adelante. Sin
 *  test unitario (API de Service Worker del navegador), verificado
 *  manualmente en el Step 5. */
export function RegistradorServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Sin conexión o navegador sin soporte -- la app sigue funcionando
      // en modo normal, simplemente sin respaldo offline esta vez.
    });
  }, []);

  return null;
}
