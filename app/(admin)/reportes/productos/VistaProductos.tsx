"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ClayCard } from "@/components/ui/ClayCard";
import { ClayButton } from "@/components/ui/ClayButton";
import { SelectorRangoFecha } from "@/components/reportes/SelectorRangoFecha";
import { BotonExportar } from "@/components/reportes/BotonExportar";
import { formatearCOP } from "@/lib/money";
import { resolverRangoPreset, type RangoFechas } from "@/lib/reportes/rangosFecha";
import { obtenerReporteProductos, type FilaProducto } from "./actions";

type CriterioOrden = "unidades" | "ingreso";

export function VistaProductos() {
  const [rango, setRango] = useState<RangoFechas>(() => resolverRangoPreset("mes"));
  const [filas, setFilas] = useState<FilaProducto[]>([]);
  const [criterio, setCriterio] = useState<CriterioOrden>("ingreso");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    obtenerReporteProductos(rango.desde.toISOString(), rango.hasta.toISOString()).then((resultado) => {
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

  const filasOrdenadas = useMemo(() => {
    const copia = [...filas];
    copia.sort((a, b) => (criterio === "unidades" ? b.unidades - a.unidades : b.ingresoCop - a.ingresoCop));
    return copia;
  }, [filas, criterio]);

  const top10 = filasOrdenadas.slice(0, 10);
  const datosGrafica = top10.map((f) => ({
    nombre: f.nombre,
    valor: criterio === "unidades" ? f.unidades : f.ingresoCop,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <SelectorRangoFecha onCambiar={setRango} />
        <div className="flex items-end gap-2">
          <span className="text-sm text-text-secondary">Ordenar por:</span>
          <ClayButton
            type="button"
            variant={criterio === "unidades" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setCriterio("unidades")}
          >
            Unidades
          </ClayButton>
          <ClayButton
            type="button"
            variant={criterio === "ingreso" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setCriterio("ingreso")}
          >
            Ingreso
          </ClayButton>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {error}
        </p>
      ) : null}
      {!cargando && !error && filas.length === 0 ? (
        <p className="text-sm text-text-secondary">Sin ventas en este período.</p>
      ) : null}

      {top10.length > 0 ? (
        <ClayCard variant="flat" className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={datosGrafica} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number"
                tickFormatter={(v: number) => (criterio === "ingreso" ? formatearCOP(BigInt(v)) : String(v))}
              />
              <YAxis type="category" dataKey="nombre" width={160} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: unknown) =>
                  typeof v === "number" ? (criterio === "ingreso" ? formatearCOP(BigInt(v)) : String(v)) : ""
                }
              />
              <Bar dataKey="valor" fill="#F5B822" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ClayCard>
      ) : null}

      {filasOrdenadas.length > 0 ? (
        <>
          <ClayCard variant="flat" className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-text-secondary">
                  <th className="py-2 pr-4">Producto</th>
                  <th className="py-2 pr-4">Categoría</th>
                  <th className="py-2 pr-4">Unidades</th>
                  <th className="py-2 pr-4">Ingreso</th>
                </tr>
              </thead>
              <tbody>
                {filasOrdenadas.map((f) => (
                  <tr key={f.productoId} className="border-b border-black/5 text-text-primary">
                    <td className="py-2 pr-4">{f.nombre}</td>
                    <td className="py-2 pr-4">{f.categoriaNombre}</td>
                    <td className="py-2 pr-4">{f.unidades}</td>
                    <td className="py-2 pr-4 font-mono">{formatearCOP(BigInt(f.ingresoCop))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ClayCard>
          <BotonExportar
            filas={filasOrdenadas as unknown as Record<string, unknown>[]}
            columnas={[
              { clave: "nombre", encabezado: "Producto" },
              { clave: "categoriaNombre", encabezado: "Categoría" },
              { clave: "unidades", encabezado: "Unidades" },
              { clave: "ingresoCop", encabezado: "Ingreso (COP)" },
            ]}
            nombreArchivo="productos-mas-vendidos"
          />
        </>
      ) : null}
    </div>
  );
}
