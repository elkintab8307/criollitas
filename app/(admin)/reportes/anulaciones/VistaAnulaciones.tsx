"use client";

import { useEffect, useMemo, useState } from "react";
import { StatCard } from "@/components/ui/StatCard";
import { SelectorRangoFecha } from "@/components/reportes/SelectorRangoFecha";
import { BotonExportar } from "@/components/reportes/BotonExportar";
import { TablaReporte, type ColumnaReporte } from "@/components/reportes/TablaReporte";
import { formatearCOP } from "@/lib/money";
import { formatearFecha } from "@/lib/dates";
import { resolverRangoPreset, type RangoFechas } from "@/lib/reportes/rangosFecha";
import { obtenerReporteAnulaciones, type FilaAnulacion } from "./actions";

const columnasAnulaciones: ColumnaReporte<FilaAnulacion>[] = [
  { clave: "pedidoNumeroCorto", encabezado: "Pedido", render: (f) => `#${f.pedidoNumeroCorto}` },
  { clave: "anuladoEn", encabezado: "Fecha", render: (f) => formatearFecha(new Date(f.anuladoEn)) },
  { clave: "usuarioNombre", encabezado: "Anulado por" },
  { clave: "motivo", encabezado: "Motivo" },
  {
    clave: "totalCop",
    encabezado: "Total",
    render: (f) => <span className="font-mono">{formatearCOP(BigInt(f.totalCop))}</span>,
  },
];

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

          <TablaReporte columnas={columnasAnulaciones} filas={filas} claveFila={(f) => f.anulacionId} />
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
