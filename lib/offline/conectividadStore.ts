"use client";

import { create } from "zustand";
import {
  evaluarConectividad,
  type EstadoConectividad,
  type ResultadoPing,
} from "@/lib/offline/conectividad";

interface ConectividadState {
  estado: EstadoConectividad;
  ultimoPing: ResultadoPing | null;
  /** Última señal conocida de `navigator.onLine`, guardada aparte de
   *  `estado` para que `registrarPing` pueda recalcular sin adivinar si un
   *  `estado` previo en "offline" vino de falta de señal de red o de un
   *  ping fallido -- son causas distintas y no deben confundirse. */
  navegadorOnline: boolean;
  registrarNavegador: (online: boolean) => void;
  registrarPing: (resultado: ResultadoPing) => void;
}

/** Estado global de conectividad, estilo useCarritoStore
 *  (lib/pedido/carritoStore.ts). La orquestación real (leer
 *  navigator.onLine, hacer ping periódico) vive en un componente cliente
 *  aparte (Task 4) -- este store no toca ninguna API del navegador
 *  directamente, por eso es testeable igual que carritoStore. */
export const useConectividadStore = create<ConectividadState>((set, get) => ({
  estado: "online",
  ultimoPing: null,
  navegadorOnline: true,
  registrarNavegador: (online) => {
    set({ navegadorOnline: online, estado: evaluarConectividad(online, get().ultimoPing) });
  },
  registrarPing: (resultado) => {
    set((state) => ({
      ultimoPing: resultado,
      estado: evaluarConectividad(state.navegadorOnline, resultado),
    }));
  },
}));
