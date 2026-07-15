"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayInput } from "@/components/ui/ClayInput";
import { formatearCOP, montoDesdePesos, type MontoCOP } from "@/lib/money";
import { cierreTurnoSchema, type CierreTurnoInput } from "@/lib/validations/turno";
import { cerrarTurno } from "@/app/(cajera)/turno/actions";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { useTurnoOfflineStore } from "@/lib/offline/turnoOfflineStore";
import { encolarOperacion } from "@/lib/offline/cola";

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

    if (useConectividadStore.getState().estado === "offline") {
      const turno = useTurnoOfflineStore.getState().turno;
      if (!turno) {
        setErrorGeneral("No tienes un turno abierto en este equipo.");
        return;
      }
      await encolarOperacion({
        tipo: "cerrar_turno",
        payload: {
          turnoId: turno.turnoId,
          efectivoDeclaradoCop: Number(montoDesdePesos(datos.efectivoDeclaradoPesos)),
        },
        creadaEn: new Date().toISOString(),
      });
      useTurnoOfflineStore.getState().cerrar();
      // Navegación completa (no router.push): /turno/abrir es la parada
      // obligatoria tras iniciar sesión sin turno abierto (CLAUDE.md
      // bloque F), así que ya quedó cacheada por el Service Worker como
      // una petición GET normal. router.push haría un fetch "suave" con
      // encabezados RSC que el Service Worker (Bloque J1) no reconoce
      // como la misma respuesta cacheada, y fallaría offline (bug real
      // encontrado con verificación en navegador).
      window.location.href = "/turno/abrir";
      return;
    }

    const resultado = await cerrarTurno(datos);
    if (!resultado.ok) {
      setErrorGeneral(resultado.error.mensaje);
      return;
    }
    useTurnoOfflineStore.getState().cerrar();
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
