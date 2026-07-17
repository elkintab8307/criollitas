"use client";

import { useState } from "react";
import { ClayButton } from "@/components/ui/ClayButton";
import { prepararReimpresionPorPedido, reportarResultadoImpresion } from "@/app/(cajera)/cobrar/actions";
import { solicitarImpresionTicket } from "@/lib/print/imprimirTicket";
import { useConectividadStore } from "@/lib/offline/conectividadStore";

interface BotonReimprimirProps {
  pedidoId: string;
}

/** Reintento manual de impresión para un pedido ya cobrado (CLAUDE.md
 *  §10.2): trae el HTML guardado de la tirilla y vuelve a abrir la ventana
 *  de impresión. Necesita conexión (el HTML vive en `impresiones`, en el
 *  servidor) -- sin ella el botón avisa en vez de fallar en silencio. */
export function BotonReimprimir({ pedidoId }: BotonReimprimirProps) {
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function reimprimir() {
    setMensaje(null);
    if (useConectividadStore.getState().estado === "offline") {
      setMensaje("Reimprimir necesita internet: la tirilla guardada vive en el servidor.");
      return;
    }
    setTrabajando(true);
    const resultado = await prepararReimpresionPorPedido(pedidoId);
    if (!resultado.ok) {
      setMensaje(resultado.error.mensaje);
      setTrabajando(false);
      return;
    }
    const impresion = solicitarImpresionTicket(resultado.valor.html);
    await reportarResultadoImpresion(resultado.valor.impresionId, impresion.exito, impresion.error);
    if (!impresion.exito) setMensaje(impresion.error);
    setTrabajando(false);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <ClayButton type="button" variant="secondary" onClick={reimprimir} disabled={trabajando}>
        {trabajando ? "Abriendo…" : "Reimprimir tirilla"}
      </ClayButton>
      {mensaje ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {mensaje}
        </p>
      ) : null}
    </div>
  );
}
