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
import { precargarRutasOffline } from "@/lib/offline/precargaRutas";

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
      const efectivoInicialCop = Number(montoDesdePesos(datos.efectivoInicialPesos));
      await encolarOperacion({
        tipo: "abrir_turno",
        payload: {
          turnoId,
          sedeId: sesion.sedeId,
          cajeraId: sesion.usuarioId,
          efectivoInicialCop,
        },
        creadaEn: new Date().toISOString(),
      });
      useTurnoOfflineStore.getState().abrir({ turnoId, efectivoInicialCop });
      // Navegación completa (no router.push): mismo motivo que
      // FormularioCerrarTurno.tsx -- router.push hace un fetch "suave" con
      // encabezados RSC que el Service Worker no reconoce como la misma
      // respuesta cacheada para /mi-turno. /mi-turno está precargada
      // explícitamente (lib/offline/precargaRutas.ts) como página completa.
      window.location.href = "/mi-turno";
      return;
    }

    const resultado = await abrirTurno(datos);
    if (!resultado.ok) {
      setErrorGeneral(resultado.error.mensaje);
      return;
    }
    useTurnoOfflineStore.getState().abrir({
      turnoId: resultado.valor.turnoId,
      efectivoInicialCop: Number(montoDesdePesos(datos.efectivoInicialPesos)),
    });
    // Tercer momento seguro para precargar (lib/offline/precargaRutas.ts):
    // recién ahora existe un turno abierto, así que /turno/movimientos,
    // /turno/cerrar, /pedidos y /pedido/nuevo (gateadas por CLAUDE.md
    // bloque F a tener turno abierto) ya no redirigen. Antes de este punto
    // (ej. justo tras validar el PIN) siempre redirigían a /turno/abrir y
    // quedaban excluidas por el guard de "no guardar una redirección".
    precargarRutasOffline();
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
