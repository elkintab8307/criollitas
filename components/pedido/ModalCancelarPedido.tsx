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
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { marcarPedidoLocalCancelado } from "@/lib/offline/pedidosLocales";
import { encolarOperacion } from "@/lib/offline/cola";
import { conTimeout, ErrorTimeout, marcarRedDegradadaPorTimeout } from "@/lib/offline/conTimeout";

// Ver el mismo comentario en FormularioAbrirTurno.tsx: las Server Actions
// son POST, el Service Worker las ignora, y una red degradada las deja
// colgadas en vez de fallar rápido. Pasados 6s se cae al camino offline.
const TIMEOUT_CANCELAR_PEDIDO_MS = 6000;

interface ModalCancelarPedidoProps {
  pedido: { id: string; numeroCorto: number; canal: CanalPedido };
  abierto: boolean;
  onCerrar: () => void;
  onCancelar: (pedidoId: string, input: MotivoCancelacionInput) => Promise<Result<null, DomainError>>;
  /** `fueOffline` distingue el camino local (encolado, aún no confirmado
   *  por el servidor) del camino online -- quien use este modal decide con
   *  ese dato cómo navegar después (ver CarritoPedido.tsx: una navegación
   *  "suave" no la reconoce el Service Worker como la página cacheada). */
  onExito: (fueOffline: boolean) => void;
}

/** Modal + formulario de motivo para cancelar un pedido (Bloque B). Extraído
 *  de CarritoPedido para reutilizarse también en los listados de pedidos en
 *  curso de vendedora y cajera (Bloque C) -- onCancelar delega la llamada al
 *  Server Action correcto según quién lo use. Funciona sin conexión (mesa,
 *  domicilio o para llevar por igual): si no hay red, o la petición se
 *  cuelga por una red degradada, la cancelación se guarda en la copia local
 *  del pedido y se encola para sincronizar al reconectar -- mismo patrón que
 *  el resto de acciones offline de este proyecto (CarritoNuevo.tsx,
 *  FormularioCobro.tsx). */
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

  // El registro en `pedidosLocales` no falla si el pedido no vive en este
  // equipo (ver marcarPedidoLocalCancelado) -- pasa igual para un pedido
  // ajeno que la cajera cancela desde /pedidos-en-curso sin haberlo creado
  // ella misma; la operación igual se encola para sincronizar.
  async function cancelarLocalmente(motivo: string): Promise<void> {
    await marcarPedidoLocalCancelado(pedido.id);
    await encolarOperacion({
      tipo: "cancelar_pedido",
      payload: { pedidoId: pedido.id, motivo },
      creadaEn: new Date().toISOString(),
    });
  }

  const onSubmit = handleSubmit(async (datos) => {
    setErrorCancelar(null);
    setCancelando(true);

    if (useConectividadStore.getState().estado === "offline") {
      await cancelarLocalmente(datos.motivo);
      setCancelando(false);
      reset();
      onExito(true);
      return;
    }

    let resultado: Result<null, DomainError>;
    try {
      resultado = await conTimeout(onCancelar(pedido.id, datos), TIMEOUT_CANCELAR_PEDIDO_MS);
    } catch (error) {
      if (error instanceof ErrorTimeout) {
        marcarRedDegradadaPorTimeout();
        await cancelarLocalmente(datos.motivo);
        setCancelando(false);
        reset();
        onExito(true);
        return;
      }
      throw error;
    }
    setCancelando(false);
    if (!resultado.ok) {
      setErrorCancelar(resultado.error.mensaje);
      return;
    }
    reset();
    onExito(false);
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
