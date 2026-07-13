"use client";

import { useEffect, useMemo, useState } from "react";
import { ClayCard } from "@/components/ui/ClayCard";
import { StatCard } from "@/components/ui/StatCard";
import { SelectorRangoFecha } from "@/components/reportes/SelectorRangoFecha";
import { BotonExportar } from "@/components/reportes/BotonExportar";
import { formatearCOP } from "@/lib/money";
import { formatearFecha } from "@/lib/dates";
import { resolverRangoPreset, type RangoFechas } from "@/lib/reportes/rangosFecha";
import { obtenerReporteAnulaciones, type FilaAnulacion } from "./actions";

export function VistaAnulaciones() {
  const [rango, setRango] = useState<RangoFechas>(() => resolverRangoPreset("mes"));
  const [filas, setFilas] = useState<FilaAnulacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    obtenerReporteAnulaciones(rango.desde.toISOString(), rango.hasta.toISOString()).then((resultado) => {
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

  const totalAnulado = useMemo(() => filas.reduce((acc, f) => acc + f.totalCop, 0), [filas]);

  return (
    <div className="flex flex-col gap-6">
      <SelectorRangoFecha onCambiar={setRango} />
      {error ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {error}
        </p>
      ) : null}
      {!cargando && !error && filas.length === 0 ? (
        <p className="text-sm text-text-secondary">Sin anulaciones en este período.</p>
      ) : null}

      {filas.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard titulo="Anulaciones" valor={String(filas.length)} />
            <StatCard titulo="Total anulado" valor={formatearCOP(BigInt(totalAnulado))} />
          </div>

          <ClayCard variant="flat" className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-text-secondary">
                  <th className="py-2 pr-4">Pedido</th>
                  <th className="py-2 pr-4">Fecha</th>
                  <th className="py-2 pr-4">Anulado por</th>
                  <th className="py-2 pr-4">Motivo</th>
                  <th className="py-2 pr-4">Total</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.anulacionId} className="border-b border-black/5 text-text-primary">
                    <td className="py-2 pr-4">#{f.pedidoNumeroCorto}</td>
                    <td className="py-2 pr-4">{formatearFecha(new Date(f.anuladoEn))}</td>
                    <td className="py-2 pr-4">{f.usuarioNombre}</td>
                    <td className="py-2 pr-4">{f.motivo}</td>
                    <td className="py-2 pr-4 font-mono">{formatearCOP(BigInt(f.totalCop))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ClayCard>
          <BotonExportar
            filas={filas as unknown as Record<string, unknown>[]}
            columnas={[
              { clave: "pedidoNumeroCorto", encabezado: "Pedido" },
              { clave: "anuladoEn", encabezado: "Fecha" },
              { clave: "usuarioNombre", encabezado: "Anulado por" },
              { clave: "motivo", encabezado: "Motivo" },
              { clave: "totalCop", encabezado: "Total (COP)" },
            ]}
            nombreArchivo="anulaciones"
          />
        </>
      ) : null}
    </div>
  );
}
