"use client";

import { useEffect, useMemo, useState } from "react";
import { StatCard } from "@/components/ui/StatCard";
import { ClayBadge } from "@/components/ui/ClayBadge";
import { SelectorRangoFecha } from "@/components/reportes/SelectorRangoFecha";
import { BotonExportar } from "@/components/reportes/BotonExportar";
import { TablaReporte, type ColumnaReporte } from "@/components/reportes/TablaReporte";
import { formatearCOP } from "@/lib/money";
import { formatearFecha } from "@/lib/dates";
import { resolverRangoPreset, type RangoFechas } from "@/lib/reportes/rangosFecha";
import { obtenerReporteArqueos, type FilaArqueo } from "./actions";

const columnasArqueos: ColumnaReporte<FilaArqueo>[] = [
  { clave: "cajeraNombre", encabezado: "Cajera" },
  { clave: "abiertoEn", encabezado: "Apertura", render: (f) => formatearFecha(new Date(f.abiertoEn)) },
  { clave: "cerradoEn", encabezado: "Cierre", render: (f) => formatearFecha(new Date(f.cerradoEn)) },
  {
    clave: "esperadoCop",
    encabezado: "Esperado",
    render: (f) => <span className="font-mono">{formatearCOP(BigInt(f.esperadoCop))}</span>,
  },
  {
    clave: "declaradoCop",
    encabezado: "Declarado",
    render: (f) => <span className="font-mono">{formatearCOP(BigInt(f.declaradoCop))}</span>,
  },
  {
    clave: "diferenciaCop",
    encabezado: "Diferencia",
    render: (f) => (
      <ClayBadge variant={f.diferenciaCop === 0 ? "exito" : "peligro"}>
        {formatearCOP(BigInt(f.diferenciaCop))}
      </ClayBadge>
    ),
  },
];

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

          <TablaReporte columnas={columnasArqueos} filas={filas} claveFila={(f) => f.turnoId} />
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
