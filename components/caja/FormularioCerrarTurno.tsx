"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayInput } from "@/components/ui/ClayInput";
import { formatearCOP, montoDesdePesos, type MontoCOP } from "@/lib/money";
import { calcularDiferencia, type DesglosePago, type ProductoVendido } from "@/lib/caja/arqueo";
import type { MovimientoArqueo } from "@/lib/print/contenidoCaja";
import { DesgloseMetodosPago } from "@/components/caja/DesgloseMetodosPago";
import { cierreTurnoSchema, type CierreTurnoInput } from "@/lib/validations/turno";
import { cerrarTurno } from "@/app/(cajera)/turno/actions";
import { reportarResultadoImpresion } from "@/app/(cajera)/cobrar/actions";
import { construirTicketArqueoHtml } from "@/lib/print/construirTicketCajaHtml";
import { solicitarImpresionTicket } from "@/lib/print/imprimirTicket";
import { ahoraBogota } from "@/lib/dates";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { useTurnoOfflineStore } from "@/lib/offline/turnoOfflineStore";
import { encolarOperacion } from "@/lib/offline/cola";
import { precargarRutasOffline } from "@/lib/offline/precargaRutas";
import { conTimeout, ErrorTimeout, marcarRedDegradadaPorTimeout } from "@/lib/offline/conTimeout";

// Ver el mismo comentario en FormularioAbrirTurno.tsx: las Server Actions
// son POST, el Service Worker las ignora, y una red degradada las deja
// colgadas en vez de fallar rápido. Pasados 6s se cae al camino offline.
const TIMEOUT_CERRAR_TURNO_MS = 6000;

interface FormularioCerrarTurnoProps {
  esperadoCop: MontoCOP;
  ventasEfectivoCop: MontoCOP;
  ventasOtroMedioCop: MontoCOP;
  desglosePagosOtroMedio: DesglosePago[];
  salidasCop: MontoCOP;
  entradasExtraCop: MontoCOP;
  productosVendidos: ProductoVendido[];
  movimientos: MovimientoArqueo[];
  sedeNombre: string;
  cajeraNombre: string;
}

export function FormularioCerrarTurno({
  esperadoCop,
  ventasEfectivoCop,
  ventasOtroMedioCop,
  desglosePagosOtroMedio,
  salidasCop,
  entradasExtraCop,
  productosVendidos,
  movimientos,
  sedeNombre,
  cajeraNombre,
}: FormularioCerrarTurnoProps) {
  const router = useRouter();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CierreTurnoInput>({ resolver: zodResolver(cierreTurnoSchema) });

  async function cerrarLocalmente(datos: CierreTurnoInput): Promise<boolean> {
    const turno = useTurnoOfflineStore.getState().turno;
    if (!turno) {
      setErrorGeneral("No tienes un turno abierto en este equipo.");
      return false;
    }
    const efectivoDeclaradoCop = Number(montoDesdePesos(datos.efectivoDeclaradoPesos));

    // La tirilla de arqueo se arma y se imprime aquí mismo (acción local
    // del navegador, no necesita internet) solo si se conoce el efectivo
    // inicial y la hora de apertura de este turno -- turnos abiertos antes
    // de que estos campos existieran no los tienen guardados localmente
    // (ver turnoOfflineStore.ts), y en ese caso se omite en vez de
    // imprimir un valor inventado. El registro en `impresiones` no puede
    // preceder a la impresión como pide CLAUDE.md §13.9 (sin conexión no
    // hay BD alcanzable) -- viaja en el payload encolado y el manejador de
    // sincronización lo inserta al reconectar (mismo criterio que la
    // tirilla de cobro offline).
    let contenidoHtml: string | null = null;
    let impresionExito: boolean | null = null;
    let impresionError: string | null = null;
    if (turno.efectivoInicialCop !== undefined && turno.abiertoEn !== undefined) {
      const efectivoInicialCop = BigInt(turno.efectivoInicialCop);
      contenidoHtml = construirTicketArqueoHtml({
        sedeNombre,
        cajeraNombre,
        fecha: ahoraBogota(),
        abiertoEn: new Date(turno.abiertoEn),
        efectivoInicialCop,
        ventasEfectivoCop,
        ventasOtroMedioCop,
        desglosePagosOtroMedio,
        salidasCop,
        entradasExtraCop,
        esperadoCop,
        efectivoDeclaradoCop: BigInt(efectivoDeclaradoCop),
        diferenciaCop: calcularDiferencia(BigInt(efectivoDeclaradoCop), esperadoCop),
        productosVendidos,
        movimientos,
      });
      const resultadoImpresion = solicitarImpresionTicket(contenidoHtml);
      impresionExito = resultadoImpresion.exito;
      impresionError = resultadoImpresion.error;
    }

    await encolarOperacion({
      tipo: "cerrar_turno",
      payload: {
        turnoId: turno.turnoId,
        efectivoDeclaradoCop,
        contenidoHtml,
        impresionExito,
        impresionError,
      },
      creadaEn: new Date().toISOString(),
    });
    useTurnoOfflineStore.getState().cerrar();
    // Navegación completa (no router.push, mismo motivo documentado en
    // los otros formularios offline) hacia /pin y no hacia /turno/abrir:
    // /turno/abrir solo es cacheable cuando NO hay turno abierto (con
    // turno redirige y el guard de precarga la descarta), así que puede
    // no tener copia si el turno se abrió rápido tras el PIN. /pin es
    // pública, se cachea en toda pasada de precarga, y además es el
    // paso natural tras cerrar el turno (fin del relevo).
    window.location.href = "/pin";
    return true;
  }

  const onSubmit = handleSubmit(async (datos) => {
    setErrorGeneral(null);

    if (useConectividadStore.getState().estado === "offline") {
      await cerrarLocalmente(datos);
      return;
    }

    let resultado;
    try {
      resultado = await conTimeout(cerrarTurno(datos), TIMEOUT_CERRAR_TURNO_MS);
    } catch (error) {
      if (error instanceof ErrorTimeout) {
        marcarRedDegradadaPorTimeout();
        await cerrarLocalmente(datos);
        return;
      }
      throw error;
    }
    if (!resultado.ok) {
      setErrorGeneral(resultado.error.mensaje);
      return;
    }
    // El turno ya está cerrado; un fallo de impresión de aquí en adelante
    // nunca debe bloquear el flujo (CLAUDE.md §10.2).
    const impresion = resultado.valor.impresion;
    if (impresion) {
      const resultadoImpresion = solicitarImpresionTicket(impresion.html);
      await reportarResultadoImpresion(impresion.impresionId, resultadoImpresion.exito, resultadoImpresion.error);
    }
    useTurnoOfflineStore.getState().cerrar();
    // Recién ahora /turno/abrir vuelve a ser cacheable (sin turno abierto
    // ya no redirige): refrescar la precarga deja el respaldo offline al
    // día para el próximo corte de internet.
    precargarRutasOffline();
    router.push("/turno/abrir");
  });

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1 rounded-clay-md bg-surface-sunken p-3">
        <p className="text-sm text-brand-chocolate/70">
          Ventas en efectivo: <span className="font-mono font-semibold">{formatearCOP(ventasEfectivoCop)}</span>
        </p>
        <p className="text-sm text-brand-chocolate/70">
          Ventas por otro medio (Nequi, datáfono, etc.):{" "}
          <span className="font-mono font-semibold">{formatearCOP(ventasOtroMedioCop)}</span>
        </p>
        <DesgloseMetodosPago desglose={desglosePagosOtroMedio} />
        <p className="text-xs text-brand-chocolate/60">
          El cuadre de caja es solo con el efectivo -- los otros medios son pagos virtuales.
        </p>
      </div>
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
