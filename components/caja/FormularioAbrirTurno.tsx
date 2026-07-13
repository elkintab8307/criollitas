"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayInput } from "@/components/ui/ClayInput";
import { efectivoInicialSchema, type EfectivoInicialInput } from "@/lib/validations/turno";
import { abrirTurno } from "@/app/(cajera)/turno/actions";

export function FormularioAbrirTurno() {
  const router = useRouter();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EfectivoInicialInput>({ resolver: zodResolver(efectivoInicialSchema) });

  const onSubmit = handleSubmit(async (datos) => {
    setErrorGeneral(null);
    const resultado = await abrirTurno(datos);
    if (!resultado.ok) {
      setErrorGeneral(resultado.error.mensaje);
      return;
    }
    router.push("/mi-turno");
  });

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-4" noValidate>
      <ClayInput
        label="Efectivo inicial (pesos)"
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        error={errors.efectivoInicialPesos?.message}
        {...register("efectivoInicialPesos", { valueAsNumber: true })}
      />
      {errorGeneral ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {errorGeneral}
        </p>
      ) : null}
      <ClayButton type="submit" variant="primary" size="lg" disabled={isSubmitting}>
        {isSubmitting ? "Abriendo…" : "Abrir turno"}
      </ClayButton>
    </form>
  );
}
