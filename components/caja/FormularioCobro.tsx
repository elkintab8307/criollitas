"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayInput } from "@/components/ui/ClayInput";
import { formatearCOP, montoDesdePesos, sumar, type MontoCOP } from "@/lib/money";
import { pagosCuadranConTotal } from "@/lib/caja/cuadrePago";
import type { PagoInput } from "@/lib/validations/cobro";
import { cobrarPedido } from "@/app/(cajera)/cobrar/actions";

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
}

interface FormularioCobroProps {
  pedidoId: string;
  totalCop: MontoCOP;
}

export function FormularioCobro({ pedidoId, totalCop }: FormularioCobroProps) {
  const router = useRouter();
  const [pagos, setPagos] = useState<FilaPago[]>([{ clave: crypto.randomUUID(), metodo: "efectivo", montoPesos: 0 }]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const montosCop = pagos.map((p) => montoDesdePesos(p.montoPesos || 0));
  const sumaCop = sumar(...montosCop);
  const cuadra = pagosCuadranConTotal(montosCop, totalCop);

  function agregarPago() {
    setPagos((actual) => [...actual, { clave: crypto.randomUUID(), metodo: "efectivo", montoPesos: 0 }]);
  }

  function quitarPago(clave: string) {
    setPagos((actual) => actual.filter((p) => p.clave !== clave));
  }

  function actualizarPago(clave: string, cambios: Partial<Pick<FilaPago, "metodo" | "montoPesos">>) {
    setPagos((actual) => actual.map((p) => (p.clave === clave ? { ...p, ...cambios } : p)));
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
    router.push("/pedidos");
  }

  return (
    <div className="flex flex-col gap-4">
      {pagos.map((pago) => (
        <div key={pago.clave} className="flex items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="font-display text-sm font-medium text-text-primary">Método</label>
            <select
              value={pago.metodo}
              onChange={(evento) => actualizarPago(pago.clave, { metodo: evento.target.value as PagoInput["metodo"] })}
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
            label="Monto (pesos)"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={pago.montoPesos || ""}
            onChange={(evento) => actualizarPago(pago.clave, { montoPesos: Number(evento.target.value) || 0 })}
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
      ))}
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
