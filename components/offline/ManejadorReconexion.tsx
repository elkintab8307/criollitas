"use client";

import { useEffect, useRef } from "react";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { useSesionOfflineStore } from "@/lib/offline/sesionOfflineStore";
import { leerIdentidad } from "@/lib/offline/identidad";
import { createClient } from "@/lib/supabase/client";
import { marcarPinValidado } from "@/app/(auth)/pin/actions";
import { sincronizarPendientes } from "@/lib/offline/sync";
import { precargarRutasOffline } from "@/lib/offline/precargaRutas";

/** Cuando vuelve la conexión tras haber operado offline, intenta
 *  restaurar una sesión real de Supabase con el refresh_token cacheado
 *  (Bloque J1/J2), reproduce la cola de operaciones pendientes (Bloque
 *  J3a) una vez la sesión real está activa, y devuelve el flujo al camino
 *  normal (cookie pin_validado vía middleware.ts). Si el refresh_token ya
 *  venció (caso raro, equipo sin uso prolongado), no hace nada más -- el
 *  usuario reingresa normalmente la próxima vez que el middleware lo
 *  mande a /login o /pin. Sin test unitario (efectos de navegador/
 *  Supabase). */
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
      await sincronizarPendientes();
      // Después de sincronizar, no antes: si un "abrir turno" quedó
      // encolado offline, recién aquí el servidor ya lo procesó y la
      // cookie de turno abierto (CLAUDE.md bloque F) es válida -- antes
      // de este punto, /turno/movimientos, /turno/cerrar, /pedidos y
      // /pedido/nuevo redirigirían y quedarían excluidas por el guard de
      // "no guardar una redirección" (lib/offline/precargaRutas.ts).
      precargarRutasOffline();
      useSesionOfflineStore.getState().cerrar();
    })();
  }, [estado]);

  return null;
}
