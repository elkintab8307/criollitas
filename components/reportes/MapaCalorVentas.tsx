import { formatearCOP } from "@/lib/money";

export interface CeldaMapaCalor {
  diaSemana: number;
  hora: number;
  promedioCop: number;
  numPedidos: number;
}

interface MapaCalorVentasProps {
  celdas: CeldaMapaCalor[];
}

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function MapaCalorVentas({ celdas }: MapaCalorVentasProps) {
  const maximo = Math.max(1, ...celdas.map((c) => c.promedioCop));
  const porClave = new Map(celdas.map((c) => [`${c.diaSemana}-${c.hora}`, c]));

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1">
        <thead>
          <tr>
            <th />
            {Array.from({ length: 24 }, (_, hora) => (
              <th key={hora} className="text-[10px] font-normal text-text-secondary">
                {hora}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DIAS.map((etiquetaDia, diaSemana) => (
            <tr key={diaSemana}>
              <td className="pr-2 text-xs font-medium text-text-secondary">{etiquetaDia}</td>
              {Array.from({ length: 24 }, (_, hora) => {
                const celda = porClave.get(`${diaSemana}-${hora}`);
                const intensidad = celda ? celda.promedioCop / maximo : 0;
                return (
                  <td
                    key={hora}
                    title={
                      celda
                        ? `${etiquetaDia} ${hora}:00 — ${formatearCOP(BigInt(celda.promedioCop))} (${celda.numPedidos} pedidos)`
                        : `${etiquetaDia} ${hora}:00 — sin ventas`
                    }
                    className="h-4 w-4 rounded-sm"
                    style={{ backgroundColor: `rgba(245, 184, 34, ${0.08 + intensidad * 0.92})` }}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
