"use client";

import { useEffect, useState } from "react";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayBadge } from "@/components/ui/ClayBadge";
import { listarPendientes } from "@/lib/offline/cola";
import { sincronizarPendientes } from "@/lib/offline/sync";

const INTERVALO_MS = 5000;

/** Red de seguridad visible: mientras haya operaciones "pendiente" en la
 *  cola offline (turnos, movimientos, pedidos), muestra un indicador con
 *  botón de reintento manual que llama sincronizarPendientes() directo --
 *  no depende de que la detección automática de reconexión
 *  (ManejadorReconexion.tsx) haya funcionado. Sondea cada 5s en vez de
 *  suscribirse a la cola: más simple y suficiente para un indicador, no
 *  para lógica de negocio. Sin test unitario (IndexedDB real + temporizador
 *  de navegador). */
export function IndicadorPendientesSync() {
  const [pendientes, setPendientes] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    async function contar() {
      const op = await listarPendientes();
      if (!cancelado) setPendientes(op.length);
    }
    contar();
    const intervalo = setInterval(contar, INTERVALO_MS);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, []);

  if (pendientes === 0) return null;

  async function reintentar() {
    setSincronizando(true);
    await sincronizarPendientes();
    setSincronizando(false);
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-clay-md bg-surface-elevated px-4 py-3 shadow-clay-md">
      <ClayBadge variant="alerta">
        {pendientes} {pendientes === 1 ? "pendiente" : "pendientes"} por sincronizar
      </ClayBadge>
      <ClayButton type="button" variant="secondary" size="sm" onClick={reintentar} disabled={sincronizando}>
        {sincronizando ? "Sincronizando…" : "Reintentar"}
      </ClayButton>
    </div>
  );
}
