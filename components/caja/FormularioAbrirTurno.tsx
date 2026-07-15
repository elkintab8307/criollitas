"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayInput } from "@/components/ui/ClayInput";
import { efectivoInicialSchema, type EfectivoInicialInput } from "@/lib/validations/turno";
import { abrirTurno } from "@/app/(cajera)/turno/actions";
import { montoDesdePesos } from "@/lib/money";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { useSesionOfflineStore } from "@/lib/offline/sesionOfflineStore";
import { useTurnoOfflineStore } from "@/lib/offline/turnoOfflineStore";
import { encolarOperacion } from "@/lib/offline/cola";

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

    if (useConectividadStore.getState().estado === "offline") {
      if (useTurnoOfflineStore.getState().turno) {
        setErrorGeneral("Ya tienes un turno abierto.");
        return;
      }
      const sesion = useSesionOfflineStore.getState().sesion;
      if (!sesion) {
        setErrorGeneral(
          "No hay una identidad guardada en este equipo. Conéctate a internet una vez para poder trabajar sin conexión.",
        );
        return;
      }
      const turnoId = crypto.randomUUID();
      await encolarOperacion({
        tipo: "abrir_turno",
        payload: {
          turnoId,
          sedeId: sesion.sedeId,
          cajeraId: sesion.usuarioId,
          efectivoInicialCop: Number(montoDesdePesos(datos.efectivoInicialPesos)),
        },
        creadaEn: new Date().toISOString(),
      });
      useTurnoOfflineStore.getState().abrir({ turnoId });
      router.push("/mi-turno");
      return;
    }

    const resultado = await abrirTurno(datos);
    if (!resultado.ok) {
      setErrorGeneral(resultado.error.mensaje);
      return;
    }
    useTurnoOfflineStore.getState().abrir({ turnoId: resultado.valor.turnoId });
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
