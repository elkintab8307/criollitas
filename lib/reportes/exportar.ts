import * as XLSX from "xlsx";

export interface ColumnaExport {
  clave: string;
  encabezado: string;
}

function escaparCampoCSV(valor: unknown): string {
  const texto = valor === null || valor === undefined ? "" : String(valor);
  if (/[",\n]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

/** Construcción pura del contenido CSV — sin efectos de DOM, testeable en Node. */
export function construirCSV(filas: Record<string, unknown>[], columnas: ColumnaExport[]): string {
  const encabezado = columnas.map((c) => escaparCampoCSV(c.encabezado)).join(",");
  const cuerpo = filas.map((fila) => columnas.map((c) => escaparCampoCSV(fila[c.clave])).join(",")).join("\n");
  return cuerpo.length > 0 ? `${encabezado}\n${cuerpo}` : encabezado;
}

/** Dispara la descarga en el navegador. Sin test unitario (Blob/URL/document
 *  no existen en el entorno Node de vitest); la lógica de escape que sí
 *  importa está cubierta por los tests de construirCSV. */
export function exportarCSV(
  filas: Record<string, unknown>[],
  columnas: ColumnaExport[],
  nombreArchivo: string,
): void {
  const contenido = construirCSV(filas, columnas);
  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo.endsWith(".csv") ? nombreArchivo : `${nombreArchivo}.csv`;
  enlace.click();
  URL.revokeObjectURL(url);
}

/** Wrapper delgado sobre xlsx; sin test unitario dedicado (mismo criterio
 *  que otros wrappers delgados del proyecto, ej. codificarEscPos). */
export function exportarXLSX(
  filas: Record<string, unknown>[],
  columnas: ColumnaExport[],
  nombreArchivo: string,
): void {
  const datos = filas.map((fila) => {
    const objeto: Record<string, unknown> = {};
    for (const columna of columnas) {
      objeto[columna.encabezado] = fila[columna.clave] ?? "";
    }
    return objeto;
  });
  const hoja = XLSX.utils.json_to_sheet(datos);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Reporte");
  XLSX.writeFile(libro, nombreArchivo.endsWith(".xlsx") ? nombreArchivo : `${nombreArchivo}.xlsx`);
}
