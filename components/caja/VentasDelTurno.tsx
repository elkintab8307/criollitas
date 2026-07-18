import { ClayCard } from "@/components/ui/ClayCard";
import { formatearCOP } from "@/lib/money";
import { formatearHora } from "@/lib/dates";

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  nequi: "Nequi",
  daviplata: "Daviplata",
  bancolombia_qr: "Bancolombia QR",
  datafono: "Datáfono",
  otro: "Otro",
};

const ETIQUETA_CANAL: Record<string, string> = {
  mesa: "Mesa",
  domicilio: "Domicilio",
  llevar: "Para llevar",
};

/** Un pedido ya cobrado dentro del turno actual, agregado desde sus filas
 *  de `pagos` (un pago mixto son varias filas del mismo pedido). */
export interface PedidoCobradoVista {
  pedidoId: string;
  numeroCorto: number;
  canal: string;
  totalCop: number;
  metodos: string[];
  cobradoEn: string;
}

interface VentasDelTurnoProps {
  cobrados: PedidoCobradoVista[];
  totalVentasCop: number;
}

/** Cuadro de control de ventas del turno: los pedidos ya cobrados en el
 *  turno abierto de la cajera y el total acumulado, para seguimiento sin
 *  salir de la pantalla de cobro. Solo lectura -- el detalle financiero
 *  completo (efectivo vs. otros métodos, movimientos) vive en /mi-turno. */
export function VentasDelTurno({ cobrados, totalVentasCop }: VentasDelTurnoProps) {
  return (
    <section aria-label="Ventas del turno">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl text-brand-mostaza">Ventas del turno</h2>
        <p className="font-display text-lg text-brand-crema">
          {cobrados.length === 1 ? "1 pedido cobrado" : `${cobrados.length} pedidos cobrados`} ·{" "}
          <span className="font-mono font-semibold text-brand-mostaza">{formatearCOP(BigInt(totalVentasCop))}</span>
        </p>
      </div>
      {cobrados.length === 0 ? (
        <p className="mt-4 rounded-clay-md bg-brand-chocolate-2 p-6 text-center text-xl text-brand-crema/70">
          Aún no hay ventas en este turno.
        </p>
      ) : (
        <ClayCard className="mt-4 p-0">
          <ul className="divide-y divide-(--border-soft)">
            {cobrados.map((pedido) => (
              <li key={pedido.pedidoId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 py-3">
                <div className="flex items-baseline gap-3">
                  <span className="font-display text-lg font-bold text-text-primary">
                    {pedido.numeroCorto > 0 ? `#${pedido.numeroCorto}` : "Sin número"}
                  </span>
                  <span className="text-sm text-text-secondary">
                    {ETIQUETA_CANAL[pedido.canal] ?? pedido.canal} ·{" "}
                    {pedido.metodos.map((m) => ETIQUETA_METODO[m] ?? m).join(" + ")}
                  </span>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="text-sm text-text-secondary">{formatearHora(new Date(pedido.cobradoEn))}</span>
                  <span className="font-mono text-lg text-text-primary">{formatearCOP(BigInt(pedido.totalCop))}</span>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline justify-between border-t-2 border-(--border-strong) px-6 py-4">
            <span className="font-display text-lg font-bold text-text-primary">Total en ventas</span>
            <span className="font-mono text-xl font-bold text-text-primary">{formatearCOP(BigInt(totalVentasCop))}</span>
          </div>
        </ClayCard>
      )}
    </section>
  );
}
