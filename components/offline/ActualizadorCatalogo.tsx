"use client";

import { useEffect, useRef } from "react";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { refrescarCatalogo } from "@/lib/offline/catalogoRefresh";

/** Mantiene actualizada la copia local del catálogo (Bloque J3c) mientras
 *  hay internet: la refresca al montar si ya hay conexión, y cada vez que
 *  se detecta que volvió después de estar offline. No se ejecuta con
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

  return null;
}
