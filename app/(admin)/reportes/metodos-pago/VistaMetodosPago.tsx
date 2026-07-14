"use client";

import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { ClayCard } from "@/components/ui/ClayCard";
import { SelectorRangoFecha } from "@/components/reportes/SelectorRangoFecha";
import { BotonExportar } from "@/components/reportes/BotonExportar";
import { TablaReporte, type ColumnaReporte } from "@/components/reportes/TablaReporte";
import { formatearCOP } from "@/lib/money";
import { resolverRangoPreset, type RangoFechas } from "@/lib/reportes/rangosFecha";
import { obtenerReporteMetodosPago, type FilaMetodoPago } from "./actions";

const COLORES = ["#F5B822", "#7CB342", "#D84315", "#52281A", "#D69A0C", "#9CCC65"];

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  nequi: "Nequi",
  daviplata: "Daviplata",
  bancolombia_qr: "Bancolombia QR",
  datafono: "Datáfono",
  otro: "Otro",
};

const columnasMetodosPago: ColumnaReporte<FilaMetodoPago>[] = [
  { clave: "metodo", encabezado: "Método", render: (f) => ETIQUETA_METODO[f.metodo] ?? f.metodo },
  {
    clave: "totalCop",
    encabezado: "Total",
    render: (f) => <span className="font-mono">{formatearCOP(BigInt(f.totalCop))}</span>,
  },
  { clave: "numPagos", encabezado: "Pagos" },
  { clave: "porcentaje", encabezado: "%", render: (f) => `${f.porcentaje.toFixed(1)}%` },
];

export function VistaMetodosPago() {
  const [rango, setRango] = useState<RangoFechas>(() => resolverRangoPreset("mes"));
  const [filas, setFilas] = useState<FilaMetodoPago[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    obtenerReporteMetodosPago(rango.desde.toISOString(), rango.hasta.toISOString()).then((resultado) => {
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

  const datosGrafica = filas.map((f) => ({ nombre: ETIQUETA_METODO[f.metodo] ?? f.metodo, valor: f.totalCop }));

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
          <TablaReporte columnas={columnasMetodosPago} filas={filas} claveFila={(f) => f.metodo} />
          <BotonExportar
            filas={filas as unknown as Record<string, unknown>[]}
            columnas={[
              { clave: "metodo", encabezado: "Método" },
              { clave: "totalCop", encabezado: "Total (COP)" },
              { clave: "numPagos", encabezado: "Pagos" },
              { clave: "porcentaje", encabezado: "%" },
            ]}
            nombreArchivo="ventas-por-metodo-pago"
          />
        </>
      ) : null}
    </div>
  );
}
