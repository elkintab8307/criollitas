"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface TurnoOffline {
  turnoId: string;
  /** Opcional: turnos abiertos antes de que este campo existiera no lo
   *  tienen en su copia persistida. Sin él, la tirilla de arqueo al cerrar
   *  offline se omite (lib/print/construirTicketCajaHtml.ts la necesita
   *  para "con cuánto se abrió la caja") en vez de imprimir un valor
   *  inventado. */
  efectivoInicialCop?: number;
}

interface TurnoOfflineState {
  turno: TurnoOffline | null;
  abrir: (turno: TurnoOffline) => void;
  cerrar: () => void;
}

/** Referencia local al turno actualmente abierto (offline u online -- se
 *  llena en ambos casos), para que las acciones offline (registrar un
 *  movimiento, cerrar turno) sepan a qué turno pertenecen sin necesitar
 *  una consulta al servidor. Persistida en localStorage para sobrevivir
 *  una recarga de página sin conexión -- sin test unitario dedicado
 *  (localStorage no existe en el entorno Node de vitest), mismo criterio
 *  que useSesionOfflineStore (Bloque J2). */
export const useTurnoOfflineStore = create<TurnoOfflineState>()(
  persist(
    (set) => ({
      turno: null,
      abrir: (turno) => set({ turno }),
      cerrar: () => set({ turno: null }),
    }),
    { name: "criollitas-turno-offline" },
  ),
);
