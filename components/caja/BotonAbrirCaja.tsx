"use client";

import { useState } from "react";
import { ClayButton } from "@/components/ui/ClayButton";
import { construirTicketAperturaCajonHtml } from "@/lib/print/construirTicketCajaHtml";
import { solicitarImpresionTicket } from "@/lib/print/imprimirTicket";
import { ahoraBogota } from "@/lib/dates";
import { registrarAperturaCajon } from "@/app/(cajera)/turno/actions";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { useTurnoOfflineStore } from "@/lib/offline/turnoOfflineStore";
import { encolarOperacion } from "@/lib/offline/cola";

interface BotonAbrirCajaProps {
  sedeNombre: string;
  cajeraNombre: string;
}

/** El cajón de dinero está conectado a la impresora térmica y salta al
 *  recibir cualquier trabajo de impresión (CLAUDE.md §10.1) -- el
 *  navegador no tiene forma de decirle "abre el cajón" sin pasar por un
 *  trabajo de impresión real, así que este botón imprime una tirilla
 *  mínima (sin datos de venta) solo para disparar ese pulso. Funciona
 *  igual con o sin conexión: la impresión es una acción local del
 *  navegador que no necesita internet; solo el registro de auditoría en
 *  `impresiones` se encola para más tarde si no hay conexión. */
export function BotonAbrirCaja({ sedeNombre, cajeraNombre }: BotonAbrirCajaProps) {
  const [estado, setEstado] = useState<"quieto" | "abriendo" | "error">("quieto");
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  async function manejarClic() {
    setEstado("abriendo");
    setMensajeError(null);

    const html = construirTicketAperturaCajonHtml({ sedeNombre, cajeraNombre, fecha: ahoraBogota() });
    const resultadoImpresion = solicitarImpresionTicket(html);

    if (useConectividadStore.getState().estado === "offline") {
      const turno = useTurnoOfflineStore.getState().turno;
      if (!turno) {
        setEstado("error");
        setMensajeError("No tienes un turno abierto en este equipo.");
        return;
      }
      await encolarOperacion({
        tipo: "registrar_apertura_cajon",
        payload: {
          turnoId: turno.turnoId,
          contenidoHtml: html,
          exito: resultadoImpresion.exito,
          error: resultadoImpresion.error,
        },
        creadaEn: new Date().toISOString(),
      });
      setEstado("quieto");
      return;
    }

    const resultado = await registrarAperturaCajon();
    if (!resultado.ok) {
      setEstado("error");
      setMensajeError(resultado.error.mensaje);
      return;
    }
    setEstado("quieto");
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <ClayButton type="button" variant="secondary" onClick={manejarClic} disabled={estado === "abriendo"}>
        {estado === "abriendo" ? "Abriendo caja…" : "Abrir caja (contar efectivo)"}
      </ClayButton>
      {estado === "error" && mensajeError ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {mensajeError}
        </p>
      ) : null}
    </div>
  );
}
