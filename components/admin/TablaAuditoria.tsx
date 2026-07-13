"use client";

import { useEffect, useState } from "react";
import { ClayCard } from "@/components/ui/ClayCard";
import { ClayButton } from "@/components/ui/ClayButton";
import { formatearFecha } from "@/lib/dates";
import { TABLAS_AUDITADAS } from "@/lib/auditoria";
import { listarAuditoria, type AuditoriaVista } from "@/app/(admin)/auditoria/actions";

const ETIQUETA_ACCION: Record<string, string> = {
  INSERT: "Creación",
  UPDATE: "Actualización",
  DELETE: "Eliminación",
};

interface TablaAuditoriaProps {
  filasIniciales: AuditoriaVista[];
}

export function TablaAuditoria({ filasIniciales }: TablaAuditoriaProps) {
  const [filas, setFilas] = useState<AuditoriaVista[]>(filasIniciales);
  const [tabla, setTabla] = useState<string>("");
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    listarAuditoria({ tabla: tabla || undefined, pagina }).then((resultado) => {
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
  }, [tabla, pagina]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <label htmlFor="filtro-tabla" className="font-display text-sm font-medium text-text-primary">
          Tabla
        </label>
        <select
          id="filtro-tabla"
          value={tabla}
          onChange={(evento) => {
            setTabla(evento.target.value);
            setPagina(1);
          }}
          className="h-12 rounded-clay-md bg-surface-sunken px-4 text-base text-text-primary shadow-clay-pressed"
        >
          <option value="">Todas</option>
          {TABLAS_AUDITADAS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {error}
        </p>
      ) : null}

      <ClayCard variant="flat" className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-black/10 text-text-secondary">
              <th className="py-2 pr-4">Fecha</th>
              <th className="py-2 pr-4">Tabla</th>
              <th className="py-2 pr-4">Acción</th>
              <th className="py-2 pr-4">Usuario</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila.id} className="border-b border-black/5 text-text-primary">
                <td className="py-2 pr-4">{formatearFecha(new Date(fila.creadoEn))}</td>
                <td className="py-2 pr-4 font-mono">{fila.tabla}</td>
                <td className="py-2 pr-4">{ETIQUETA_ACCION[fila.accion] ?? fila.accion}</td>
                <td className="py-2 pr-4">{fila.usuarioNombre}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filas.length === 0 && !cargando ? (
          <p className="py-6 text-center text-sm text-text-secondary">Sin registros de auditoría.</p>
        ) : null}
      </ClayCard>

      <div className="flex gap-3">
        <ClayButton
          type="button"
          variant="secondary"
          size="sm"
          disabled={pagina <= 1 || cargando}
          onClick={() => setPagina((p) => Math.max(1, p - 1))}
        >
          Anterior
        </ClayButton>
        <ClayButton
          type="button"
          variant="secondary"
          size="sm"
          disabled={cargando}
          onClick={() => setPagina((p) => p + 1)}
        >
          Siguiente
        </ClayButton>
      </div>
    </div>
  );
}
