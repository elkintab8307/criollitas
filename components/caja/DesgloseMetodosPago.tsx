import { formatearCOP } from "@/lib/money";
import type { DesglosePago } from "@/lib/caja/arqueo";

// Mismas etiquetas que en FormularioCobro.tsx/VentasDelTurno.tsx -- duplicado
// por método, no por descuido (tabla pequeña y estable, mismo criterio ya
// usado varias veces en el proyecto).
const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  nequi: "Nequi",
  daviplata: "Daviplata",
  bancolombia_qr: "Bancolombia QR",
  datafono: "Datáfono",
  otro: "Otro",
};

interface DesgloseMetodosPagoProps {
  desglose: DesglosePago[];
}

/** Lista, uno por línea, cuánto entró por cada medio de pago virtual
 *  (Nequi, Daviplata, etc.) -- reutilizado en /mi-turno y /turno/cerrar
 *  para que la cajera vea el detalle, no solo el total de "otro medio"
 *  (pedido del usuario). */
export function DesgloseMetodosPago({ desglose }: DesgloseMetodosPagoProps) {
  if (desglose.length === 0) {
    return <p className="text-xs text-brand-chocolate/60">Sin pagos por otro medio en este turno.</p>;
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {desglose.map((d) => (
        <li key={d.metodo} className="flex justify-between text-sm text-brand-chocolate/70">
          <span>{ETIQUETA_METODO[d.metodo] ?? d.metodo}</span>
          <span className="font-mono font-semibold">{formatearCOP(d.montoCop)}</span>
        </li>
      ))}
    </ul>
  );
}
