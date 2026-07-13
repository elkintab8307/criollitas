"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayModal } from "@/components/ui/ClayModal";
import { ClayInput } from "@/components/ui/ClayInput";
import { motivoCancelacionSchema, type MotivoCancelacionInput } from "@/lib/validations/cancelacion";
import type { CanalPedido } from "@/components/pedido/tipos";
import type { DomainError, Result } from "@/lib/result";

interface ModalCancelarPedidoProps {
  pedido: { id: string; numeroCorto: number; canal: CanalPedido };
  abierto: boolean;
  onCerrar: () => void;
  onCancelar: (pedidoId: string, input: MotivoCancelacionInput) => Promise<Result<null, DomainError>>;
  onExito: () => void;
}

/** Modal + formulario de motivo para cancelar un pedido (Bloque B). Extraído
 *  de CarritoPedido para reutilizarse también en los listados de pedidos en
 *  curso de vendedora y cajera (Bloque C) -- onCancelar delega la llamada al
 *  Server Action correcto según quién lo use. */
export function ModalCancelarPedido({ pedido, abierto, onCerrar, onCancelar, onExito }: ModalCancelarPedidoProps) {
  const [errorCancelar, setErrorCancelar] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MotivoCancelacionInput>({ resolver: zodResolver(motivoCancelacionSchema) });

  function cerrar() {
    reset();
    setErrorCancelar(null);
    onCerrar();
  }

  const onSubmit = handleSubmit(async (datos) => {
    setErrorCancelar(null);
    setCancelando(true);
    const resultado = await onCancelar(pedido.id, datos);
    setCancelando(false);
    if (!resultado.ok) {
      setErrorCancelar(resultado.error.mensaje);
      return;
    }
    reset();
    onExito();
  });

  return (
    <ClayModal abierto={abierto} titulo="Cancelar pedido" onCerrar={cerrar}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <p className="text-sm text-text-secondary">
          El pedido #{pedido.numeroCorto} se cancelará y no se podrá cobrar.
          {pedido.canal === "mesa" ? " La mesa quedará libre." : ""}
        </p>
        <ClayInput
          label="Motivo de la cancelación"
          placeholder="Ej: el cliente se retiró"
          error={errors.motivo?.message}
          {...register("motivo")}
        />
        {errorCancelar ? (
          <p role="alert" className="text-sm text-brand-tomate-2">
            {errorCancelar}
          </p>
        ) : null}
        <div className="flex justify-end gap-3">
          <ClayButton type="button" variant="ghost" onClick={cerrar}>
            Volver
          </ClayButton>
          <ClayButton type="submit" variant="destructive" disabled={cancelando}>
            {cancelando ? "Cancelando…" : "Confirmar cancelación"}
          </ClayButton>
        </div>
      </form>
    </ClayModal>
  );
}
