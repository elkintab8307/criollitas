"use client";

import { useEffect } from "react";
import { useTurnoOfflineStore } from "@/lib/offline/turnoOfflineStore";

interface SincronizarTurnoLocalProps {
  turnoId: string;
  efectivoInicialCop: number;
  abiertoEn: string;
}

/** Puentea el turno que el servidor ya confirma como abierto hacia el
 *  store local de offline (turnoOfflineStore) -- sin esto, cualquier
 *  sesión de navegador que llegue a una pantalla de turno SIN haber
 *  pasado por FormularioAbrirTurno.tsx en ESTE dispositivo (recarga de
 *  página, pestaña nueva, caché del navegador borrada) se queda sin datos
 *  locales, y una acción offline posterior (registrar movimiento, cerrar
 *  turno, cobrar, abrir el cajón) falla con "No tienes un turno abierto"
 *  aunque el turno sí esté abierto en el servidor -- bug real reportado
 *  por el usuario, reproducido con Playwright cortando la red tras un
 *  login que no pasó por /turno/abrir en este navegador. Solo escribe si
 *  hace falta -- no pisa un turno local que ya coincide, para no generar
 *  renders de más. */
export function SincronizarTurnoLocal({ turnoId, efectivoInicialCop, abiertoEn }: SincronizarTurnoLocalProps) {
  useEffect(() => {
    const actual = useTurnoOfflineStore.getState().turno;
    if (
      actual?.turnoId === turnoId &&
      actual.efectivoInicialCop === efectivoInicialCop &&
      actual.abiertoEn === abiertoEn
    ) {
      return;
    }
    useTurnoOfflineStore.getState().abrir({ turnoId, efectivoInicialCop, abiertoEn });
  }, [turnoId, efectivoInicialCop, abiertoEn]);

  return null;
}
