"use client";

import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { ClayCard } from "@/components/ui/ClayCard";
import { SelectorRangoFecha } from "@/components/reportes/SelectorRangoFecha";
import { BotonExportar } from "@/components/reportes/BotonExportar";
import { formatearCOP } from "@/lib/money";
import { resolverRangoPreset, type RangoFechas } from "@/lib/reportes/rangosFecha";
import { obtenerReporteCanales, type FilaCanal } from "./actions";

const COLORES = ["#F5B822", "#7CB342", "#D84315"];

const ETIQUETA_CANAL: Record<string, string> = {
  mesa: "Mesa",
  domicilio: "Domicilio",
  llevar: "Para llevar",
};

export function VistaCanales() {
  const [rango, setRango] = useState<RangoFechas>(() => resolverRangoPreset("mes"));
  const [filas, setFilas] = useState<FilaCanal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    obtenerReporteCanales(rango.desde.toISOString(), rango.hasta.toISOString()).then((resultado) => {
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

  const datosGrafica = filas.map((f) => ({ nombre: ETIQUETA_CANAL[f.canal] ?? f.canal, valor: f.totalCop }));

  return (
    <div className="flex flex-col gap-6">
      <SelectorRangoFecha onCambiar={setRango} />
      {error ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {error}
        </p>
      ) : null}
      {!cargando && !error && filas.length === 0 ? (
        <p className="text-sm text-text-secondary">Sin ventas en este período.</p>
      ) : null}
      {filas.length > 0 ? (
        <>
          <ClayCard variant="flat" className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={datosGrafica} dataKey="valor" nameKey="nombre" outerRadius={100} label>
                  {datosGrafica.map((_, i) => (
                    <Cell key={i} fill={COLORES[i % COLORES.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(valor) => (typeof valor === "number" ? formatearCOP(BigInt(valor)) : "")} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ClayCard>
          <ClayCard variant="flat" className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-text-secondary">
                  <th className="py-2 pr-4">Canal</th>
                  <th className="py-2 pr-4">Total</th>
                  <th className="py-2 pr-4">Pedidos</th>
                  <th className="py-2 pr-4">%</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.canal} className="border-b border-black/5 text-text-primary">
                    <td className="py-2 pr-4">{ETIQUETA_CANAL[f.canal] ?? f.canal}</td>
                    <td className="py-2 pr-4 font-mono">{formatearCOP(BigInt(f.totalCop))}</td>
                    <td className="py-2 pr-4">{f.numPedidos}</td>
                    <td className="py-2 pr-4">{f.porcentaje.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ClayCard>
          <BotonExportar
            filas={filas as unknown as Record<string, unknown>[]}
            columnas={[
              { clave: "canal", encabezado: "Canal" },
              { clave: "totalCop", encabezado: "Total (COP)" },
              { clave: "numPedidos", encabezado: "Pedidos" },
              { clave: "porcentaje", encabezado: "%" },
            ]}
            nombreArchivo="ventas-por-canal"
          />
        </>
      ) : null}
    </div>
  );
}
