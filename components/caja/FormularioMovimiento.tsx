"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayInput } from "@/components/ui/ClayInput";
import { movimientoSchema, type MovimientoInput } from "@/lib/validations/turno";
import { registrarMovimiento } from "@/app/(cajera)/turno/actions";
import { reportarResultadoImpresion } from "@/app/(cajera)/cobrar/actions";
import { construirTicketMovimientoHtml } from "@/lib/print/construirTicketCajaHtml";
import { solicitarImpresionTicket } from "@/lib/print/imprimirTicket";
import { montoDesdePesos } from "@/lib/money";
import { ahoraBogota } from "@/lib/dates";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { useTurnoOfflineStore } from "@/lib/offline/turnoOfflineStore";
import { encolarOperacion } from "@/lib/offline/cola";
import { conTimeout, ErrorTimeout, marcarRedDegradadaPorTimeout } from "@/lib/offline/conTimeout";

// Ver el mismo comentario en FormularioAbrirTurno.tsx: las Server Actions
// son POST, el Service Worker las ignora, y una red degradada las deja
// colgadas en vez de fallar rápido. Pasados 6s se cae al camino offline.
const TIMEOUT_MOVIMIENTO_MS = 6000;

const ETIQUETA_TIPO: Record<MovimientoInput["tipo"], string> = {
  retiro: "Retiro",
  gasto: "Gasto",
  ingreso_extra: "Ingreso extra",
};

interface FormularioMovimientoProps {
  sedeNombre: string;
  cajeraNombre: string;
}

export function FormularioMovimiento({ sedeNombre, cajeraNombre }: FormularioMovimientoProps) {
  const router = useRouter();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MovimientoInput>({ resolver: zodResolver(movimientoSchema) });

  async function registrarLocalmente(datos: MovimientoInput): Promise<boolean> {
    const turno = useTurnoOfflineStore.getState().turno;
    if (!turno) {
      setErrorGeneral("No tienes un turno abierto.");
      return false;
    }
    // El comprobante se arma e imprime aquí mismo (acción local del
    // navegador, no necesita internet); el registro en `impresiones` no
    // puede preceder a la impresión como pide CLAUDE.md §13.9 (sin
    // conexión no hay BD alcanzable) -- viaja en el payload encolado y
    // el manejador de sincronización lo inserta al reconectar (mismo
    // criterio que la tirilla de arqueo offline).
    const html = construirTicketMovimientoHtml({
      sedeNombre,
      cajeraNombre,
      fecha: ahoraBogota(),
      tipo: datos.tipo,
      concepto: datos.concepto,
      montoCop: montoDesdePesos(datos.montoPesos),
    });
    const resultadoImpresion = solicitarImpresionTicket(html);
    await encolarOperacion({
      tipo: "registrar_movimiento",
      payload: {
        turnoId: turno.turnoId,
        tipo: datos.tipo,
        concepto: datos.concepto,
        montoCop: Number(montoDesdePesos(datos.montoPesos)),
        contenidoHtml: html,
        impresionExito: resultadoImpresion.exito,
        impresionError: resultadoImpresion.error,
      },
      creadaEn: new Date().toISOString(),
    });
    reset();
    return true;
  }

  const onSubmit = handleSubmit(async (datos) => {
    setErrorGeneral(null);

    if (useConectividadStore.getState().estado === "offline") {
      await registrarLocalmente(datos);
      return;
    }

    let resultado;
    try {
      resultado = await conTimeout(registrarMovimiento(datos), TIMEOUT_MOVIMIENTO_MS);
    } catch (error) {
      if (error instanceof ErrorTimeout) {
        marcarRedDegradadaPorTimeout();
        await registrarLocalmente(datos);
        return;
      }
      throw error;
    }
    if (!resultado.ok) {
      setErrorGeneral(resultado.error.mensaje);
      return;
    }
    // El movimiento ya quedó registrado; un fallo de impresión de aquí en
    // adelante nunca debe bloquear el flujo (CLAUDE.md §10.2).
    const impresion = resultado.valor.impresion;
    if (impresion) {
      const resultadoImpresion = solicitarImpresionTicket(impresion.html);
      await reportarResultadoImpresion(impresion.impresionId, resultadoImpresion.exito, resultadoImpresion.error);
    }
    reset();
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="tipo-movimiento" className="font-display text-sm font-medium text-text-primary">
          Tipo de movimiento
        </label>
        <select
          id="tipo-movimiento"
          className="h-12 rounded-clay-md bg-surface-sunken px-4 text-base text-text-primary shadow-clay-pressed"
          {...register("tipo")}
        >
          {(Object.keys(ETIQUETA_TIPO) as MovimientoInput["tipo"][]).map((tipo) => (
            <option key={tipo} value={tipo}>
              {ETIQUETA_TIPO[tipo]}
            </option>
          ))}
        </select>
        {errors.tipo ? <p className="text-sm text-brand-tomate-2">{errors.tipo.message}</p> : null}
      </div>
      <ClayInput label="Concepto" placeholder="Ej: compra de bolsas" error={errors.concepto?.message} {...register("concepto")} />
      <ClayInput
        label="Monto (pesos)"
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        error={errors.montoPesos?.message}
        {...register("montoPesos", { valueAsNumber: true })}
      />
      {errorGeneral ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {errorGeneral}
        </p>
      ) : null}
      <ClayButton type="submit" variant="primary" disabled={isSubmitting}>
        {isSubmitting ? "Guardando…" : "Registrar movimiento"}
      </ClayButton>
    </form>
  );
}
