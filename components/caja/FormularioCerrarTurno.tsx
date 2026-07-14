"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayInput } from "@/components/ui/ClayInput";
import { formatearCOP, type MontoCOP } from "@/lib/money";
import { cierreTurnoSchema, type CierreTurnoInput } from "@/lib/validations/turno";
import { cerrarTurno } from "@/app/(cajera)/turno/actions";

interface FormularioCerrarTurnoProps {
  esperadoCop: MontoCOP;
}

export function FormularioCerrarTurno({ esperadoCop }: FormularioCerrarTurnoProps) {
  const router = useRouter();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CierreTurnoInput>({ resolver: zodResolver(cierreTurnoSchema) });

  const onSubmit = handleSubmit(async (datos) => {
    setErrorGeneral(null);
    const resultado = await cerrarTurno(datos);
    if (!resultado.ok) {
      setErrorGeneral(resultado.error.mensaje);
      return;
    }
    router.push("/turno/abrir");
  });

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-4" noValidate>
      <p className="text-sm text-brand-chocolate/70">
        Efectivo esperado: <span className="font-mono font-semibold">{formatearCOP(esperadoCop)}</span>
      </p>
      <ClayInput
        label="Efectivo contado (pesos)"
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        error={errors.efectivoDeclaradoPesos?.message}
        {...register("efectivoDeclaradoPesos", { valueAsNumber: true })}
      />
      {errorGeneral ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {errorGeneral}
        </p>
      ) : null}
      <div className="flex justify-end gap-3">
        <ClayButton type="button" variant="ghost" onClick={() => router.push("/mi-turno")}>
          Volver
        </ClayButton>
        <ClayButton type="submit" variant="destructive" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Cerrando…" : "Cerrar turno"}
        </ClayButton>
      </div>
    </form>
  );
}
