"use client";

import { useEffect, useRef, useState } from "react";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { listarPendientes } from "@/lib/offline/cola";

const SONDEO_SYNC_MS = 3000;
const DURACION_AVISO_MS = 6000;

/** Banner de estado de conexión para la Cajera (spec del modo offline,
 *  "Indicador visual"): mientras el detector confirma que no hay internet,
 *  un aviso fijo arriba deja claro que las ventas se están guardando en
 *  este equipo; al volver la conexión y vaciarse la cola de
 *  sincronización, un aviso verde temporal confirma que todo subió.
 *  Complementa (no reemplaza) a IndicadorPendientesSync, que muestra el
 *  conteo con reintento manual. Sin test unitario (efectos de navegador/
 *  IndexedDB, mismo criterio que el resto de components/offline/). */
export function BannerConectividad() {
  const estado = useConectividadStore((s) => s.estado);
  const [mostrarSincronizado, setMostrarSincronizado] = useState(false);
  const estuvoOfflineRef = useRef(false);

  useEffect(() => {
    if (estado === "offline") {
      estuvoOfflineRef.current = true;
      setMostrarSincronizado(false);
      return;
    }
    if (!estuvoOfflineRef.current) return;

    // Volvió la conexión tras operar offline: esperar a que la cola quede
    // vacía (la sincroniza ManejadorReconexion o el reintento manual) y
    // solo entonces confirmar. Si no había nada pendiente, confirmar de una.
    let cancelado = false;
    let intervalo: ReturnType<typeof setInterval> | null = null;
    async function revisar() {
      const pendientes = await listarPendientes();
      if (cancelado) return;
      if (pendientes.length === 0) {
        estuvoOfflineRef.current = false;
        if (intervalo) clearInterval(intervalo);
        setMostrarSincronizado(true);
        setTimeout(() => {
          if (!cancelado) setMostrarSincronizado(false);
        }, DURACION_AVISO_MS);
      }
    }
    revisar();
    intervalo = setInterval(revisar, SONDEO_SYNC_MS);
    return () => {
      cancelado = true;
      if (intervalo) clearInterval(intervalo);
    };
  }, [estado]);

  if (estado === "offline") {
    return (
      <div
        role="status"
        className="sticky top-0 z-50 bg-brand-mostaza px-4 py-2 text-center font-display text-sm font-semibold text-brand-chocolate shadow-clay-sm"
      >
        Sin conexión — las ventas se están guardando en este equipo y subirán solas al volver el internet.
      </div>
    );
  }

  if (mostrarSincronizado) {
    return (
      <div
        role="status"
        className="sticky top-0 z-50 bg-brand-verde px-4 py-2 text-center font-display text-sm font-semibold text-brand-chocolate shadow-clay-sm"
      >
        Conexión restablecida — todo lo pendiente quedó sincronizado.
      </div>
    );
  }

  return null;
}
