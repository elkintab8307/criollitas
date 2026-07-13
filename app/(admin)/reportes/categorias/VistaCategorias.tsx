"use client";

import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { ClayCard } from "@/components/ui/ClayCard";
import { SelectorRangoFecha } from "@/components/reportes/SelectorRangoFecha";
import { BotonExportar } from "@/components/reportes/BotonExportar";
import { formatearCOP } from "@/lib/money";
import { resolverRangoPreset, type RangoFechas } from "@/lib/reportes/rangosFecha";
import { obtenerReporteCategorias, type FilaCategoria } from "./actions";

const COLORES = ["#F5B822", "#7CB342", "#D84315", "#52281A", "#D69A0C", "#9CCC65"];

export function VistaCategorias() {
  const [rango, setRango] = useState<RangoFechas>(() => resolverRangoPreset("mes"));
  const [filas, setFilas] = useState<FilaCategoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    obtenerReporteCategorias(rango.desde.toISOString(), rango.hasta.toISOString()).then((resultado) => {
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

  const datosGrafica = filas.map((f) => ({ nombre: f.categoriaNombre, valor: f.ingresoCop }));

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
                  <th className="py-2 pr-4">Categoría</th>
                  <th className="py-2 pr-4">Unidades</th>
                  <th className="py-2 pr-4">Ingreso</th>
                  <th className="py-2 pr-4">%</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.categoriaId} className="border-b border-black/5 text-text-primary">
                    <td className="py-2 pr-4">{f.categoriaNombre}</td>
                    <td className="py-2 pr-4">{f.unidades}</td>
                    <td className="py-2 pr-4 font-mono">{formatearCOP(BigInt(f.ingresoCop))}</td>
                    <td className="py-2 pr-4">{f.porcentaje.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ClayCard>
          <BotonExportar
            filas={filas as unknown as Record<string, unknown>[]}
            columnas={[
              { clave: "categoriaNombre", encabezado: "Categoría" },
              { clave: "unidades", encabezado: "Unidades" },
              { clave: "ingresoCop", encabezado: "Ingreso (COP)" },
              { clave: "porcentaje", encabezado: "%" },
            ]}
            nombreArchivo="categorias-mas-vendidas"
          />
        </>
      ) : null}
    </div>
  );
}
