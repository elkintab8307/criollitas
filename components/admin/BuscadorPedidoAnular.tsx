"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayCard } from "@/components/ui/ClayCard";
import { ClayInput } from "@/components/ui/ClayInput";
import { ClayBadge } from "@/components/ui/ClayBadge";
import { formatearCOP } from "@/lib/money";
import { formatearFecha } from "@/lib/dates";
import { motivoAnulacionSchema, type MotivoAnulacionInput } from "@/lib/validations/anulacion";
import { buscarPedidoParaAnular, anularPedido, type PedidoParaAnularVista } from "@/app/(admin)/anular/actions";

const ETIQUETA_ESTADO: Record<string, string> = {
  abierto: "Abierto",
  enviado_cocina: "Enviado a cocina",
  en_preparacion: "En preparación",
  listo: "Listo",
  entregado: "Entregado",
  cobrado: "Cobrado",
  cerrado: "Cerrado",
  anulado: "Anulado",
};

export function BuscadorPedidoAnular() {
  const router = useRouter();
  const [numeroBuscado, setNumeroBuscado] = useState("");
  const [pedido, setPedido] = useState<PedidoParaAnularVista | null | undefined>(undefined);
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [errorAnular, setErrorAnular] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MotivoAnulacionInput>({ resolver: zodResolver(motivoAnulacionSchema) });

  async function buscar() {
    const numero = Number(numeroBuscado);
    if (!Number.isInteger(numero) || numero <= 0) {
      setErrorBusqueda("Escribe un número de pedido válido");
      return;
    }
    setErrorBusqueda(null);
    setBuscando(true);
    const resultado = await buscarPedidoParaAnular(numero);
    setBuscando(false);
    if (!resultado.ok) {
      setErrorBusqueda(resultado.error.mensaje);
      setPedido(undefined);
      return;
    }
    setPedido(resultado.valor);
    setConfirmando(false);
  }

  const onSubmitMotivo = handleSubmit(async (datos) => {
    if (!pedido) return;
    setErrorAnular(null);
    setEnviando(true);
    const resultado = await anularPedido(pedido.id, datos);
    setEnviando(false);
    if (!resultado.ok) {
      setErrorAnular(resultado.error.mensaje);
      return;
    }
    reset();
    setConfirmando(false);
    setPedido({ ...pedido, estado: "anulado" });
    router.refresh();
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end gap-3">
        <ClayInput
          label="Número de pedido"
          type="number"
          inputMode="numeric"
          min={1}
          value={numeroBuscado}
          onChange={(evento) => setNumeroBuscado(evento.target.value)}
          error={errorBusqueda ?? undefined}
        />
        <ClayButton type="button" variant="primary" disabled={buscando} onClick={buscar}>
          {buscando ? "Buscando…" : "Buscar"}
        </ClayButton>
      </div>

      {pedido === null ? (
        <p className="text-sm text-text-secondary">No encontramos un pedido con ese número.</p>
      ) : null}

      {pedido ? (
        <ClayCard variant="flat" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-display text-xl font-semibold text-text-primary">
              Pedido #{pedido.numeroCorto}
            </span>
            <ClayBadge variant={pedido.estado === "cobrado" ? "alerta" : "neutral"}>
              {ETIQUETA_ESTADO[pedido.estado] ?? pedido.estado}
            </ClayBadge>
          </div>
          <p className="text-sm text-text-secondary">{formatearFecha(new Date(pedido.creadoEn))}</p>
          <p className="font-mono text-lg text-text-primary">{formatearCOP(BigInt(pedido.totalCop))}</p>

          {pedido.estado !== "cobrado" ? (
            <p className="text-sm text-text-secondary">
              Este pedido no se puede anular — solo se anulan pedidos ya cobrados.
            </p>
          ) : !confirmando ? (
            <ClayButton type="button" variant="destructive" onClick={() => setConfirmando(true)}>
              Anular pedido
            </ClayButton>
          ) : (
            <form onSubmit={onSubmitMotivo} className="flex flex-col gap-3" noValidate>
              <ClayInput
                label="Motivo de la anulación"
                placeholder="Ej: pedido duplicado, cliente se retractó"
                error={errors.motivo?.message}
                {...register("motivo")}
              />
              {errorAnular ? (
                <p role="alert" className="text-sm text-brand-tomate-2">
                  {errorAnular}
                </p>
              ) : null}
              <div className="flex gap-3">
                <ClayButton type="button" variant="ghost" onClick={() => setConfirmando(false)}>
                  Cancelar
                </ClayButton>
                <ClayButton type="submit" variant="destructive" disabled={enviando}>
                  {enviando ? "Anulando…" : "Confirmar anulación"}
                </ClayButton>
              </div>
            </form>
          )}
        </ClayCard>
      ) : null}
    </div>
  );
}
