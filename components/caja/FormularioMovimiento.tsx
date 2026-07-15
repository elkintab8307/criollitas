"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayInput } from "@/components/ui/ClayInput";
import { movimientoSchema, type MovimientoInput } from "@/lib/validations/turno";
import { registrarMovimiento } from "@/app/(cajera)/turno/actions";
import { montoDesdePesos } from "@/lib/money";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { useTurnoOfflineStore } from "@/lib/offline/turnoOfflineStore";
import { encolarOperacion } from "@/lib/offline/cola";

const ETIQUETA_TIPO: Record<MovimientoInput["tipo"], string> = {
  retiro: "Retiro",
  gasto: "Gasto",
  ingreso_extra: "Ingreso extra",
};

export function FormularioMovimiento() {
  const router = useRouter();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MovimientoInput>({ resolver: zodResolver(movimientoSchema) });

  const onSubmit = handleSubmit(async (datos) => {
    setErrorGeneral(null);

    if (useConectividadStore.getState().estado === "offline") {
      const turno = useTurnoOfflineStore.getState().turno;
      if (!turno) {
        setErrorGeneral("No tienes un turno abierto.");
        return;
      }
      await encolarOperacion({
        tipo: "registrar_movimiento",
        payload: {
          turnoId: turno.turnoId,
          tipo: datos.tipo,
          concepto: datos.concepto,
          montoCop: Number(montoDesdePesos(datos.montoPesos)),
        },
        creadaEn: new Date().toISOString(),
      });
      reset();
      return;
    }

    const resultado = await registrarMovimiento(datos);
    if (!resultado.ok) {
      setErrorGeneral(resultado.error.mensaje);
      return;
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
