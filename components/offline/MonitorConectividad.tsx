"use client";

import { useEffect } from "react";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { hacerPing } from "@/lib/offline/ping";

const INTERVALO_PING_MS = 15_000;

/** Monta el monitoreo real de conectividad: escucha los eventos
 *  online/offline del navegador y hace ping periódico a Supabase. No
 *  renderiza nada visible -- el indicador para el usuario es trabajo del
 *  Bloque J5. Sin test unitario (efectos de navegador), verificado
 *  manualmente en el Step 5. */
export function MonitorConectividad() {
  useEffect(() => {
    const store = useConectividadStore.getState();
    store.registrarNavegador(navigator.onLine);

    const alCambiarNavegador = () => useConectividadStore.getState().registrarNavegador(navigator.onLine);
    window.addEventListener("online", alCambiarNavegador);
    window.addEventListener("offline", alCambiarNavegador);

    const intervalo = setInterval(async () => {
      const resultado = await hacerPing();
      useConectividadStore.getState().registrarPing(resultado);
    }, INTERVALO_PING_MS);

    return () => {
      window.removeEventListener("online", alCambiarNavegador);
      window.removeEventListener("offline", alCambiarNavegador);
      clearInterval(intervalo);
    };
  }, []);

  return null;
}
