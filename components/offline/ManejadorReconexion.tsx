"use client";

import { useEffect, useRef } from "react";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { useSesionOfflineStore } from "@/lib/offline/sesionOfflineStore";
import { leerIdentidad } from "@/lib/offline/identidad";
import { createClient } from "@/lib/supabase/client";
import { marcarPinValidado } from "@/app/(auth)/pin/actions";

/** Cuando vuelve la conexión tras haber operado offline, intenta
 *  restaurar una sesión real de Supabase con el refresh_token cacheado
 *  (Bloque J1/J2) y devolver el flujo al camino normal (cookie
 *  pin_validado vía middleware.ts). Si el refresh_token ya venció (caso
 *  raro, equipo sin uso prolongado), no hace nada más -- el usuario
 *  reingresa normalmente la próxima vez que el middleware lo mande a
 *  /login o /pin. Sin test unitario (efectos de navegador/Supabase). */
export function ManejadorReconexion() {
  const estado = useConectividadStore((s) => s.estado);
  const estadoAnteriorRef = useRef(estado);

  useEffect(() => {
    const volvioOnline = estadoAnteriorRef.current === "offline" && estado === "online";
    estadoAnteriorRef.current = estado;
    if (!volvioOnline) return;

    const sesion = useSesionOfflineStore.getState().sesion;
    if (!sesion) return;

    (async () => {
      const identidad = await leerIdentidad(sesion.usuarioId);
      if (!identidad) return;
      const supabase = createClient();
      const { error } = await supabase.auth.refreshSession({ refresh_token: identidad.refreshToken });
      if (error) return;
      await marcarPinValidado();
      useSesionOfflineStore.getState().cerrar();
    })();
  }, [estado]);

  return null;
}
