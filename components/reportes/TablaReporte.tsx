import { ClayCard } from "@/components/ui/ClayCard";

export interface ColumnaReporte<T> {
  clave: string;
  encabezado: string;
  /** Si no se da, se muestra String(fila[clave]) sin formatear. */
  render?: (fila: T) => React.ReactNode;
}

export interface TablaReporteProps<T> {
  columnas: ColumnaReporte<T>[];
  filas: T[];
  claveFila: (fila: T) => string;
}

function valorColumna<T>(columna: ColumnaReporte<T>, fila: T): React.ReactNode {
  if (columna.render) return columna.render(fila);
  const valor = (fila as Record<string, unknown>)[columna.clave];
  return valor === null || valor === undefined ? "" : String(valor);
}

/** Tabla de reporte responsive: en desktop (`sm:` en adelante) es una tabla
 *  real; en móvil cada fila se convierte en una tarjeta apilada, con la
 *  primera columna del arreglo como título (CLAUDE.md Bloque I). */
export function TablaReporte<T>({ columnas, filas, claveFila }: TablaReporteProps<T>) {
  const [primera, ...resto] = columnas;
  if (!primera) return null;

  return (
    <>
      <ClayCard variant="flat" className="hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-black/10 text-text-secondary">
              {columnas.map((columna) => (
                <th key={columna.clave} className="py-2 pr-4">
                  {columna.encabezado}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={claveFila(fila)} className="border-b border-black/5 text-text-primary">
                {columnas.map((columna) => (
                  <td key={columna.clave} className="py-2 pr-4">
                    {valorColumna(columna, fila)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ClayCard>

      <div className="flex flex-col gap-3 sm:hidden">
        {filas.map((fila) => (
          <ClayCard key={claveFila(fila)} variant="flat">
            <div className="font-display text-base text-text-primary">{valorColumna(primera, fila)}</div>
            <div className="mt-2 flex flex-col">
              {resto.map((columna) => (
                <div
                  key={columna.clave}
                  className="flex items-center justify-between border-t border-(--border-soft) py-1.5 text-sm first:border-t-0"
                >
                  <span className="text-text-secondary">{columna.encabezado}</span>
                  <span className="text-text-primary">{valorColumna(columna, fila)}</span>
                </div>
              ))}
            </div>
          </ClayCard>
        ))}
      </div>
    </>
  );
}
