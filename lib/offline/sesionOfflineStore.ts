"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SesionOffline {
  usuarioId: string;
  nombre: string;
  rol: "cajera" | "admin";
  sedeId: string;
}

interface SesionOfflineState {
  sesion: SesionOffline | null;
  iniciar: (sesion: SesionOffline) => void;
  cerrar: () => void;
}

/** Sesión activa mientras se navega offline (distinta de la sesión real de
 *  Supabase, que no existe en este momento). Persistida en localStorage
 *  para sobrevivir a una recarga de página sin conexión -- sin test
 *  unitario dedicado (localStorage no existe en el entorno Node de
 *  vitest), mismo criterio que otros wrappers de navegador del proyecto. */
export const useSesionOfflineStore = create<SesionOfflineState>()(
  persist(
    (set) => ({
      sesion: null,
      iniciar: (sesion) => set({ sesion }),
      cerrar: () => set({ sesion: null }),
    }),
    { name: "criollitas-sesion-offline" },
  ),
);
