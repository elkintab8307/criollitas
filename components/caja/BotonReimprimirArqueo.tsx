"use client";

import { useState } from "react";
import { ClayButton } from "@/components/ui/ClayButton";
import { prepararReimpresionArqueo } from "@/app/(cajera)/turno/actions";
import { reportarResultadoImpresion } from "@/app/(cajera)/cobrar/actions";
import { solicitarImpresionTicket } from "@/lib/print/imprimirTicket";
import { useConectividadStore } from "@/lib/offline/conectividadStore";

/** Reimprime la tirilla de cierre (arqueo) del último turno que la cajera
 *  cerró, para sacar varias copias (pedido del usuario). Mismo patrón que
 *  BotonReimprimir: necesita conexión porque el HTML guardado vive en
 *  `impresiones`, en el servidor -- sin ella avisa en vez de fallar en
 *  silencio. El botón queda habilitado para pulsarlo una vez por copia. */
export function BotonReimprimirArqueo() {
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function reimprimir() {
    setMensaje(null);
    if (useConectividadStore.getState().estado === "offline") {
      setMensaje("Reimprimir necesita internet: la tirilla guardada vive en el servidor.");
      return;
    }
    setTrabajando(true);
    const resultado = await prepararReimpresionArqueo();
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
    <div className="flex flex-col gap-2">
      <ClayButton type="button" variant="secondary" onClick={reimprimir} disabled={trabajando}>
        {trabajando ? "Abriendo…" : "Reimprimir tirilla de cierre"}
      </ClayButton>
      <p className="text-xs text-brand-chocolate/60">Púlsalo una vez por cada copia que necesites.</p>
      {mensaje ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {mensaje}
        </p>
      ) : null}
    </div>
  );
}
