"use client";

import { useState } from "react";
import Link from "next/link";
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
import { conTimeout, ErrorTimeout, marcarRedDegradadaPorTimeout } from "@/lib/offline/conTimeout";

// Las Server Actions son peticiones POST, así que el Service Worker las
// ignora por completo (`if (event.request.method !== "GET") return;` en
// public/sw.js) -- una red "degradada" (wifi débil, sin salida real a
// internet) las deja colgadas para siempre en vez de fallar rápido, y la
// cajera ve el sistema "trabado" al abrir turno (bug real reportado por el
// usuario). Pasados 6s se abandona la espera y se sigue por el mismo
// camino que un corte de red limpio: encolar la apertura localmente. La
// petición original no se cancela (las Server Actions no lo permiten) --
// si de verdad llega a completarse tarde en el servidor, el turno ya
// habría quedado abierto, y el turno encolado localmente fallará al
// sincronizar con "Ya tienes un turno abierto" en vez de duplicarlo en
// silencio; ese fallo queda visible en la cola de sincronización para que
// la cajera (o soporte) lo note.
const TIMEOUT_ABRIR_TURNO_MS = 6000;

export function FormularioAbrirTurno() {
  const router = useRouter();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  // Solo se activa por el camino de timeout (ver más abajo) -- el turno ya
  // quedó abierto en el equipo y encolado para sincronizar, pero navegar
  // de inmediato a /mi-turno arriesga una carrera real: esa pantalla es un
  // Server Component que consulta la base de datos en vivo, y como la
  // apertura todavía no sincronizó, respondería "no hay turno" y rebotaría
  // de vuelta aquí (bug real encontrado al reproducir el reporte del
  // usuario) -- muy distinto del camino realmente offline, donde el
  // Service Worker sirve la copia cacheada de /mi-turno sin tocar el
  // servidor en absoluto. Se muestra una confirmación en esta misma
  // pantalla en vez de navegar a ciegas.
  const [abiertoLocalmentePendiente, setAbiertoLocalmentePendiente] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EfectivoInicialInput>({ resolver: zodResolver(efectivoInicialSchema) });

  async function abrirLocalmente(datos: EfectivoInicialInput, navegar: boolean): Promise<boolean> {
    if (useTurnoOfflineStore.getState().turno) {
      setErrorGeneral("Ya tienes un turno abierto.");
      return false;
    }
    const sesion = useSesionOfflineStore.getState().sesion;
    if (!sesion) {
      setErrorGeneral(
        "No hay una identidad guardada en este equipo. Conéctate a internet una vez para poder trabajar sin conexión.",
      );
      return false;
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
    useTurnoOfflineStore.getState().abrir({ turnoId, efectivoInicialCop, abiertoEn: new Date().toISOString() });
    if (!navegar) {
      setAbiertoLocalmentePendiente(true);
      return true;
    }
    // Navegación completa (no router.push): mismo motivo que
    // FormularioCerrarTurno.tsx -- router.push hace un fetch "suave" con
    // encabezados RSC que el Service Worker no reconoce como la misma
    // respuesta cacheada para /mi-turno. /mi-turno está precargada
    // explícitamente (lib/offline/precargaRutas.ts) como página completa.
    // Segura aquí (a diferencia del camino de timeout) porque el estado
    // de conectividad ya confirmó que no hay red -- el Service Worker no
    // va a intentar (ni mucho menos lograr) una respuesta fresca del
    // servidor.
    window.location.href = "/mi-turno";
    return true;
  }

  const onSubmit = handleSubmit(async (datos) => {
    setErrorGeneral(null);

    if (useConectividadStore.getState().estado === "offline") {
      await abrirLocalmente(datos, true);
      return;
    }

    let resultado;
    try {
      resultado = await conTimeout(abrirTurno(datos), TIMEOUT_ABRIR_TURNO_MS);
    } catch (error) {
      if (error instanceof ErrorTimeout) {
        marcarRedDegradadaPorTimeout();
        await abrirLocalmente(datos, false);
        return;
      }
      throw error;
    }
    if (!resultado.ok) {
      setErrorGeneral(resultado.error.mensaje);
      return;
    }
    useTurnoOfflineStore.getState().abrir({
      turnoId: resultado.valor.turnoId,
      efectivoInicialCop: Number(montoDesdePesos(datos.efectivoInicialPesos)),
      abiertoEn: new Date().toISOString(),
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

  if (abiertoLocalmentePendiente) {
    return (
      <div className="flex max-w-sm flex-col gap-4 rounded-clay-md bg-brand-verde/20 p-4">
        <p className="text-sm text-text-primary">
          Tu turno quedó abierto en este equipo. La conexión está lenta, así que se está guardando y se
          sincronizará solo apenas vuelva -- puedes seguir trabajando normalmente.
        </p>
        <Link href="/mi-turno">
          <ClayButton type="button" variant="primary">
            Ir a mi turno
          </ClayButton>
        </Link>
      </div>
    );
  }

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
