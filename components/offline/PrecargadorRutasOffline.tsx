"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { precargarRutasOffline } from "@/lib/offline/precargaRutas";

/** Dispara la precarga de rutas offline al montar la app con una sesión
 *  activa. Los otros disparos (PIN validado, turno abierto, reconexión,
 *  cierre de turno) viven en el contexto JavaScript de la página: una
 *  recarga completa (F5, o las navegaciones window.location.href del
 *  propio modo offline) mata una pasada a mitad de camino y nada la
 *  reanudaba hasta el próximo inicio de sesión (hallazgo real, hallado
 *  con verificación en navegador: la caché quedaba con 3 de 11 rutas).
 *  Este disparo por montaje cubre ese hueco. No compite con la
 *  navegación del usuario: la precarga arranca 5s después y procesa una
 *  ruta a la vez (lib/offline/precargaRutas.ts); el guard de "no guardar
 *  redirecciones" mantiene la corrección si las cookies aún no son
 *  válidas. Sin test unitario (efectos de navegador). */
export function PrecargadorRutasOffline() {
  useEffect(() => {
    if (useConectividadStore.getState().estado === "offline") return;
    let cancelado = false;
    (async () => {
      // getSession lee del almacenamiento local, sin red -- solo evita
      // disparar 11 fetches inútiles en /login antes de que exista sesión.
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!cancelado && session) precargarRutasOffline();
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  return null;
}
