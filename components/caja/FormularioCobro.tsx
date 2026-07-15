"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayInput } from "@/components/ui/ClayInput";
import { formatearCOP, montoDesdePesos, sumar, type MontoCOP } from "@/lib/money";
import { calcularVuelto, pagosCuadranConTotal } from "@/lib/caja/cuadrePago";
import type { PagoInput } from "@/lib/validations/cobro";
import { cobrarPedido, reportarResultadoImpresion } from "@/app/(cajera)/cobrar/actions";
import { enviarAlPrintBridgeDesdeNavegador } from "@/lib/escpos/clienteBridge";

const ETIQUETA_METODO: Record<PagoInput["metodo"], string> = {
  efectivo: "Efectivo",
  nequi: "Nequi",
  daviplata: "Daviplata",
  bancolombia_qr: "Bancolombia QR",
  datafono: "Datáfono",
  otro: "Otro",
};

interface FilaPago {
  clave: string;
  metodo: PagoInput["metodo"];
  montoPesos: number;
  entregaPesos: number;
}

interface FormularioCobroProps {
  pedidoId: string;
  totalCop: MontoCOP;
}

export function FormularioCobro({ pedidoId, totalCop }: FormularioCobroProps) {
  const router = useRouter();
  const [pagos, setPagos] = useState<FilaPago[]>([
    { clave: crypto.randomUUID(), metodo: "efectivo", montoPesos: 0, entregaPesos: 0 },
  ]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Math.trunc: montoDesdePesos lanza RangeError ante un no-entero
  // (lib/money.ts). El input es type="number" con step=1, pero eso no
  // impide que el usuario pegue o escriba "1.5" -- sin este guard, un
  // render con ese valor tumba toda la pantalla de cobro.
  const montosCop = pagos.map((p) => montoDesdePesos(Math.trunc(p.montoPesos) || 0));
  const sumaCop = sumar(...montosCop);
  const cuadra = pagosCuadranConTotal(montosCop, totalCop);

  function agregarPago() {
    setPagos((actual) => [
      ...actual,
      { clave: crypto.randomUUID(), metodo: "efectivo", montoPesos: 0, entregaPesos: 0 },
    ]);
  }

  function quitarPago(clave: string) {
    setPagos((actual) => actual.filter((p) => p.clave !== clave));
  }

  function actualizarPago(clave: string, cambios: Partial<Pick<FilaPago, "metodo" | "montoPesos" | "entregaPesos">>) {
    setPagos((actual) => actual.map((p) => (p.clave === clave ? { ...p, ...cambios } : p)));
  }

  /** Total menos lo que ya cubren las filas anteriores a `indice`, en
   *  orden de índice -- así un pago mixto se resuelve fila por fila. */
  function restanteAntesDe(indice: number): MontoCOP {
    const cubiertoAntes = sumar(
      ...pagos.slice(0, indice).map((p) => montoDesdePesos(Math.trunc(p.montoPesos) || 0)),
    );
    const restante = totalCop - cubiertoAntes;
    return restante > 0n ? restante : 0n;
  }

  /** Al escribir "cuánto entrega el cliente" en una fila, autocompleta
   *  "Monto" con lo que corresponde cubrir del restante en ese punto. La
   *  cajera puede seguir editando "Monto" a mano después. */
  function manejarEntrega(indice: number, entregaPesos: number) {
    const entregaCop = montoDesdePesos(Math.trunc(entregaPesos) || 0);
    const { cubreCop } = calcularVuelto(entregaCop, restanteAntesDe(indice));
    const cubrePesos = Number(cubreCop / 100n);
    setPagos((filas) => filas.map((p, i) => (i === indice ? { ...p, entregaPesos, montoPesos: cubrePesos } : p)));
  }

  async function confirmar() {
    if (!cuadra) return;
    setError(null);
    setEnviando(true);
    const resultado = await cobrarPedido(pedidoId, {
      pagos: pagos.map((p) => ({ metodo: p.metodo, montoPesos: p.montoPesos })),
    });
    setEnviando(false);
    if (!resultado.ok) {
      setError(resultado.error.mensaje);
      return;
    }
    // El cobro ya quedó confirmado -- un fallo de impresión de aquí en
    // adelante nunca debe bloquear la navegación (CLAUDE.md §10.2). El
    // envío ocurre desde este navegador (el PC de caja sí está en la LAN
    // del print-bridge; el servidor de la app, en Vercel, no).
    const impresion = resultado.valor.impresion;
    if (impresion) {
      const resultadoImpresion = await enviarAlPrintBridgeDesdeNavegador(impresion.contenidoBase64);
      await reportarResultadoImpresion(impresion.impresionId, resultadoImpresion.exito, resultadoImpresion.error);
    }
    router.push("/pedidos");
  }

  return (
    <div className="flex flex-col gap-4">
      {pagos.map((pago, indice) => {
        const { vueltoCop } = calcularVuelto(
          montoDesdePesos(Math.trunc(pago.entregaPesos) || 0),
          restanteAntesDe(indice),
        );
        return (
          <div key={pago.clave} className="flex flex-col gap-2 rounded-clay-md bg-surface-sunken p-3">
            <div className="flex items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="font-display text-sm font-medium text-text-primary">Método</label>
                <select
                  value={pago.metodo}
                  onChange={(evento) =>
                    actualizarPago(pago.clave, { metodo: evento.target.value as PagoInput["metodo"] })
                  }
                  className="h-12 rounded-clay-md bg-surface-sunken px-4 text-base text-text-primary shadow-clay-pressed"
                >
                  {(Object.keys(ETIQUETA_METODO) as PagoInput["metodo"][]).map((metodo) => (
                    <option key={metodo} value={metodo}>
                      {ETIQUETA_METODO[metodo]}
                    </option>
                  ))}
                </select>
              </div>
              <ClayInput
                label="Cuánto entrega el cliente"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={pago.entregaPesos || ""}
                onChange={(evento) => manejarEntrega(indice, Math.trunc(Number(evento.target.value)) || 0)}
              />
              <ClayInput
                label="Monto (pesos)"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={pago.montoPesos || ""}
                onChange={(evento) =>
                  actualizarPago(pago.clave, { montoPesos: Math.trunc(Number(evento.target.value)) || 0 })
                }
              />
              {pagos.length > 1 ? (
                <button
                  type="button"
                  aria-label="Quitar pago"
                  onClick={() => quitarPago(pago.clave)}
                  className="mb-1 text-brand-tomate-2 hover:text-brand-tomate"
                >
                  ✕
                </button>
              ) : null}
            </div>
            {vueltoCop > 0n ? (
              <p className="font-mono text-lg font-semibold text-brand-verde-2">
                Vuelto: {formatearCOP(vueltoCop)}
              </p>
            ) : null}
          </div>
        );
      })}
      <ClayButton type="button" variant="secondary" size="sm" onClick={agregarPago}>
        + Agregar otro pago
      </ClayButton>

      <div className="flex items-center justify-between border-t border-black/10 pt-3">
        <span className="text-sm text-text-secondary">Total del pedido</span>
        <span className="font-mono text-lg font-semibold text-text-primary">{formatearCOP(totalCop)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-secondary">Suma de pagos</span>
        <span className={`font-mono text-lg font-semibold ${cuadra ? "text-brand-verde-2" : "text-brand-tomate-2"}`}>
          {formatearCOP(sumaCop)}
        </span>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {error}
        </p>
      ) : null}

      <ClayButton type="button" variant="primary" size="lg" disabled={!cuadra || enviando} onClick={confirmar}>
        {enviando ? "Cobrando…" : "Confirmar cobro"}
      </ClayButton>
    </div>
  );
}
