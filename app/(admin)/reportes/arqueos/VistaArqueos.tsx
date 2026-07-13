"use client";

import { useEffect, useMemo, useState } from "react";
import { ClayCard } from "@/components/ui/ClayCard";
import { StatCard } from "@/components/ui/StatCard";
import { ClayBadge } from "@/components/ui/ClayBadge";
import { SelectorRangoFecha } from "@/components/reportes/SelectorRangoFecha";
import { BotonExportar } from "@/components/reportes/BotonExportar";
import { formatearCOP } from "@/lib/money";
import { formatearFecha } from "@/lib/dates";
import { resolverRangoPreset, type RangoFechas } from "@/lib/reportes/rangosFecha";
import { obtenerReporteArqueos, type FilaArqueo } from "./actions";

export function VistaArqueos() {
  const [rango, setRango] = useState<RangoFechas>(() => resolverRangoPreset("mes"));
  const [filas, setFilas] = useState<FilaArqueo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    obtenerReporteArqueos(rango.desde.toISOString(), rango.hasta.toISOString()).then((resultado) => {
      if (cancelado) return;
      setCargando(false);
      if (!resultado.ok) {
        setError(resultado.error.mensaje);
        return;
      }
      setFilas(resultado.valor);
    });
    return () => {
      cancelado = true;
    };
  }, [rango]);

  const stats = useMemo(() => {
    const conDiferencia = filas.filter((f) => f.diferenciaCop !== 0);
    const sumaDiferencias = filas.reduce((acc, f) => acc + f.diferenciaCop, 0);
    return { total: filas.length, conDiferencia: conDiferencia.length, sumaDiferencias };
  }, [filas]);

  return (
    <div className="flex flex-col gap-6">
      <SelectorRangoFecha onCambiar={setRango} />
      {error ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {error}
        </p>
      ) : null}
      {!cargando && !error && filas.length === 0 ? (
        <p className="text-sm text-text-secondary">Sin turnos cerrados en este período.</p>
      ) : null}

      {filas.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard titulo="Turnos cerrados" valor={String(stats.total)} />
            <StatCard titulo="Turnos con diferencia" valor={String(stats.conDiferencia)} />
            <StatCard titulo="Suma de diferencias" valor={formatearCOP(BigInt(stats.sumaDiferencias))} />
          </div>

          <ClayCard variant="flat" className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-text-secondary">
                  <th className="py-2 pr-4">Cajera</th>
                  <th className="py-2 pr-4">Apertura</th>
                  <th className="py-2 pr-4">Cierre</th>
                  <th className="py-2 pr-4">Esperado</th>
                  <th className="py-2 pr-4">Declarado</th>
                  <th className="py-2 pr-4">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.turnoId} className="border-b border-black/5 text-text-primary">
                    <td className="py-2 pr-4">{f.cajeraNombre}</td>
                    <td className="py-2 pr-4">{formatearFecha(new Date(f.abiertoEn))}</td>
                    <td className="py-2 pr-4">{formatearFecha(new Date(f.cerradoEn))}</td>
                    <td className="py-2 pr-4 font-mono">{formatearCOP(BigInt(f.esperadoCop))}</td>
                    <td className="py-2 pr-4 font-mono">{formatearCOP(BigInt(f.declaradoCop))}</td>
                    <td className="py-2 pr-4">
                      <ClayBadge variant={f.diferenciaCop === 0 ? "exito" : "peligro"}>
                        {formatearCOP(BigInt(f.diferenciaCop))}
                      </ClayBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ClayCard>
          <BotonExportar
            filas={filas as unknown as Record<string, unknown>[]}
            columnas={[
              { clave: "cajeraNombre", encabezado: "Cajera" },
              { clave: "abiertoEn", encabezado: "Apertura" },
              { clave: "cerradoEn", encabezado: "Cierre" },
              { clave: "esperadoCop", encabezado: "Esperado (COP)" },
              { clave: "declaradoCop", encabezado: "Declarado (COP)" },
              { clave: "diferenciaCop", encabezado: "Diferencia (COP)" },
            ]}
            nombreArchivo="historial-arqueos"
          />
        </>
      ) : null}
    </div>
  );
}
