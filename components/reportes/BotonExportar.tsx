"use client";

import { ClayButton } from "@/components/ui/ClayButton";
import { exportarCSV, exportarXLSX, type ColumnaExport } from "@/lib/reportes/exportar";

interface BotonExportarProps {
  filas: Record<string, unknown>[];
  columnas: ColumnaExport[];
  nombreArchivo: string;
}

export function BotonExportar({ filas, columnas, nombreArchivo }: BotonExportarProps) {
  return (
    <div className="flex gap-2">
      <ClayButton
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => exportarCSV(filas, columnas, nombreArchivo)}
      >
        Exportar CSV
      </ClayButton>
      <ClayButton
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => exportarXLSX(filas, columnas, nombreArchivo)}
      >
        Exportar XLSX
      </ClayButton>
    </div>
  );
}
