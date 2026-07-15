"use client";

import { useEffect, useRef } from "react";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { refrescarCatalogo } from "@/lib/offline/catalogoRefresh";
import { createClient } from "@/lib/supabase/client";

/** Mantiene actualizada la copia local del catálogo (Bloque J3c) mientras
 *  hay internet: la refresca al montar si ya hay conexión, cada vez que
 *  se detecta que volvió después de estar offline, y justo cuando se
 *  completa un inicio de sesión -- este componente vive en el layout
 *  raíz, así que monta también en /login/pin ANTES de que exista sesión;
 *  sin este último disparo, `refrescarCatalogo()` (que ahora no hace
 *  nada sin sesión, ver catalogoRefresh.ts) nunca se volvería a intentar
 *  después de iniciar sesión en la misma pestaña. No se ejecuta con
 *  ninguna frecuencia fija adicional -- evita golpear Supabase a cada
 *  ciclo de ping del detector de conectividad (Bloque J1). Sin test
 *  unitario (efectos de navegador). */
export function ActualizadorCatalogo() {
  const estado = useConectividadStore((s) => s.estado);
  const estadoAnteriorRef = useRef(estado);
  const yaRefrescoAlMontar = useRef(false);

  useEffect(() => {
    const volvioOnline = estadoAnteriorRef.current === "offline" && estado === "online";
    estadoAnteriorRef.current = estado;

    if (estado === "online" && (volvioOnline || !yaRefrescoAlMontar.current)) {
      yaRefrescoAlMontar.current = true;
      refrescarCatalogo();
    }
  }, [estado]);

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_IN") refrescarCatalogo();
    });
    return () => subscription.unsubscribe();
  }, []);

  return null;
}
