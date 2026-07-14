"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ClayCard } from "@/components/ui/ClayCard";
import { StatCard } from "@/components/ui/StatCard";
import { SelectorRangoFecha } from "@/components/reportes/SelectorRangoFecha";
import { BotonExportar } from "@/components/reportes/BotonExportar";
import { MapaCalorVentas } from "@/components/reportes/MapaCalorVentas";
import { TablaReporte, type ColumnaReporte } from "@/components/reportes/TablaReporte";
import { formatearCOP } from "@/lib/money";
import { resolverRangoPreset, rangoAnterior, type RangoFechas } from "@/lib/reportes/rangosFecha";
import {
  obtenerVentasRango,
  obtenerTicketPromedioGlobal,
  obtenerMapaCalor,
  type FilaVentaDiaria,
  type CeldaMapaCalorReporte,
} from "./actions";

const ETIQUETA_CANAL: Record<string, string> = { mesa: "Mesa", domicilio: "Domicilio", llevar: "Para llevar" };

function totalizar(filas: FilaVentaDiaria[]) {
  return filas.reduce(
    (acc, f) => ({
      totalCop: acc.totalCop + f.totalCop,
      descuentoCop: acc.descuentoCop + f.descuentoCop,
      numPedidos: acc.numPedidos + f.numPedidos,
    }),
    { totalCop: 0, descuentoCop: 0, numPedidos: 0 },
  );
}

function porDia(filas: FilaVentaDiaria[]) {
  const mapa = new Map<string, number>();
  for (const f of filas) {
    mapa.set(f.dia, (mapa.get(f.dia) ?? 0) + f.totalCop);
  }
  return Array.from(mapa.entries())
    .map(([dia, total]) => ({ dia, total }))
    .sort((a, b) => a.dia.localeCompare(b.dia));
}

const columnasVentas: ColumnaReporte<FilaVentaDiaria>[] = [
  { clave: "dia", encabezado: "Día" },
  { clave: "canal", encabezado: "Canal", render: (f) => ETIQUETA_CANAL[f.canal] ?? f.canal },
  { clave: "numPedidos", encabezado: "Pedidos" },
  {
    clave: "totalCop",
    encabezado: "Total",
    render: (f) => <span className="font-mono">{formatearCOP(BigInt(f.totalCop))}</span>,
  },
];

export function VistaVentas() {
  const [rango, setRango] = useState<RangoFechas>(() => resolverRangoPreset("mes"));
  const [canal, setCanal] = useState("");
  const [comparar, setComparar] = useState(false);
  const [filas, setFilas] = useState<FilaVentaDiaria[]>([]);
  const [filasAnterior, setFilasAnterior] = useState<FilaVentaDiaria[]>([]);
  const [ticketPromedio, setTicketPromedio] = useState<number | null>(null);
  const [mapaCalor, setMapaCalor] = useState<CeldaMapaCalorReporte[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    const canalFiltro = canal || null;

    async function cargar() {
      const [resVentas, resTicket, resMapa] = await Promise.all([
        obtenerVentasRango(rango.desde.toISOString(), rango.hasta.toISOString(), canalFiltro),
        obtenerTicketPromedioGlobal(rango.desde.toISOString(), rango.hasta.toISOString()),
        obtenerMapaCalor(rango.desde.toISOString(), rango.hasta.toISOString()),
      ]);
      if (cancelado) return;
      if (!resVentas.ok) {
        setCargando(false);
        setError(resVentas.error.mensaje);
        return;
      }
      if (!resTicket.ok) {
        setCargando(false);
        setError(resTicket.error.mensaje);
        return;
      }
      if (!resMapa.ok) {
        setCargando(false);
        setError(resMapa.error.mensaje);
        return;
      }
      setFilas(resVentas.valor);
      setTicketPromedio(resTicket.valor.ticketPromedioCop);
      setMapaCalor(resMapa.valor);

      if (comparar) {
        const anterior = rangoAnterior(rango);
        const resAnterior = await obtenerVentasRango(
          anterior.desde.toISOString(),
          anterior.hasta.toISOString(),
          canalFiltro,
        );
        if (cancelado) return;
        if (resAnterior.ok) setFilasAnterior(resAnterior.valor);
      } else {
        setFilasAnterior([]);
      }
      setCargando(false);
    }
    cargar();
    return () => {
      cancelado = true;
    };
  }, [rango, canal, comparar]);

  const totales = useMemo(() => totalizar(filas), [filas]);
  const totalesAnterior = useMemo(() => totalizar(filasAnterior), [filasAnterior]);
  const datosBarra = useMemo(() => porDia(filas), [filas]);

  const deltaTotal =
    comparar && totalesAnterior.totalCop > 0
      ? ((totales.totalCop - totalesAnterior.totalCop) / totalesAnterior.totalCop) * 100
      : undefined;
  const deltaPedidos =
    comparar && totalesAnterior.numPedidos > 0
      ? ((totales.numPedidos - totalesAnterior.numPedidos) / totalesAnterior.numPedidos) * 100
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <SelectorRangoFecha onCambiar={setRango} />
        <select
          value={canal}
          onChange={(e) => setCanal(e.target.value)}
          className="h-9 rounded-clay-md bg-surface-sunken px-3 text-sm text-text-primary shadow-clay-pressed"
        >
          <option value="">Todos los canales</option>
          <option value="mesa">Mesa</option>
          <option value="domicilio">Domicilio</option>
          <option value="llevar">Para llevar</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={comparar} onChange={(e) => setComparar(e.target.checked)} />
          Comparar con período anterior
        </label>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {error}
        </p>
      ) : null}
      {!cargando && !error && filas.length === 0 ? (
        <p className="text-sm text-text-secondary">Sin ventas en este período.</p>
      ) : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard titulo="Total vendido" valor={formatearCOP(BigInt(totales.totalCop))} deltaPorcentaje={deltaTotal} />
        <StatCard titulo="Pedidos" valor={String(totales.numPedidos)} deltaPorcentaje={deltaPedidos} />
        <StatCard
          titulo="Ticket promedio"
          valor={ticketPromedio !== null ? formatearCOP(BigInt(ticketPromedio)) : "—"}
        />
        <StatCard titulo="Descuentos" valor={formatearCOP(BigInt(totales.descuentoCop))} />
      </div>

      {datosBarra.length > 0 ? (
        <ClayCard variant="flat" className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={datosBarra}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="dia" tickFormatter={(v: string) => v.slice(8, 10)} tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v: number) => formatearCOP(BigInt(v))} width={90} />
              <Tooltip
                formatter={(v: unknown) => (typeof v === "number" ? formatearCOP(BigInt(v)) : String(v))}
              />
              <Bar dataKey="total" fill="#F5B822" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ClayCard>
      ) : null}

      {mapaCalor.length > 0 ? (
        <ClayCard variant="flat">
          <h2 className="mb-3 font-display text-lg text-text-primary">Mapa de calor semanal</h2>
          <MapaCalorVentas celdas={mapaCalor} />
        </ClayCard>
      ) : null}

      {filas.length > 0 ? (
        <>
          <TablaReporte columnas={columnasVentas} filas={filas} claveFila={(f) => `${f.dia}-${f.canal}`} />
          <BotonExportar
            filas={filas as unknown as Record<string, unknown>[]}
            columnas={[
              { clave: "dia", encabezado: "Día" },
              { clave: "canal", encabezado: "Canal" },
              { clave: "numPedidos", encabezado: "Pedidos" },
              { clave: "totalCop", encabezado: "Total (COP)" },
            ]}
            nombreArchivo="ventas-por-rango"
          />
        </>
      ) : null}
    </div>
  );
}
