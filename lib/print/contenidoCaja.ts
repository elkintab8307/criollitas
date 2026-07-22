import type { MontoCOP } from "@/lib/money";

export interface DatosAperturaCajon {
  sedeNombre: string;
  cajeraNombre: string;
  fecha: Date;
}

export type TipoMovimientoCaja = "retiro" | "gasto" | "ingreso_extra";

/** Un método de pago distinto de efectivo con su monto sumado en el
 *  turno -- ver `desglosarPagosPorMetodo` en lib/caja/arqueo.ts. */
export interface DesglosePagoArqueo {
  metodo: string;
  montoCop: MontoCOP;
}

/** Un producto vendido en el turno, agregado -- ver `agruparProductosVendidos`
 *  en lib/caja/arqueo.ts. */
export interface ProductoVendidoArqueo {
  nombre: string;
  cantidad: number;
  totalCop: MontoCOP;
}

/** Un movimiento de caja del turno con su concepto, para el detalle de la
 *  tirilla de cierre (el resumen ya suma salidas/entradas; esto dice CUÁLES
 *  fueron). */
export interface MovimientoArqueo {
  tipo: TipoMovimientoCaja;
  concepto: string;
  montoCop: MontoCOP;
}

export interface DatosArqueo {
  sedeNombre: string;
  cajeraNombre: string;
  fecha: Date;
  efectivoInicialCop: MontoCOP;
  /** Suma de pagos en efectivo del turno -- "cuánto dinero se hizo". */
  ventasEfectivoCop: MontoCOP;
  /** Suma de pagos por otro medio (Nequi, Daviplata, Bancolombia QR,
   *  datáfono, otro) -- informativo, NUNCA entra al cuadre de caja: son
   *  pagos virtuales, no billetes que la cajera pueda contar. */
  ventasOtroMedioCop: MontoCOP;
  /** Desglose de `ventasOtroMedioCop` método por método (pedido del
   *  usuario: que la tirilla especifique cuánto por cada medio, no un
   *  solo bulto). */
  desglosePagosOtroMedio: DesglosePagoArqueo[];
  /** Suma de gastos + retiros del turno -- "cuánto dinero se sacó". */
  salidasCop: MontoCOP;
  /** Suma de ingresos extra del turno -- "cuánto dinero extra se ingresó". */
  entradasExtraCop: MontoCOP;
  esperadoCop: MontoCOP;
  efectivoDeclaradoCop: MontoCOP;
  diferenciaCop: MontoCOP;
  /** Productos vendidos en el turno (pedido del usuario: la tirilla de
   *  cierre debe mostrar qué se vendió, cantidad y valor). */
  productosVendidos: ProductoVendidoArqueo[];
  /** Movimientos de caja del turno con su concepto (pedido del usuario). */
  movimientos: MovimientoArqueo[];
}

export interface DatosMovimiento {
  sedeNombre: string;
  cajeraNombre: string;
  fecha: Date;
  tipo: TipoMovimientoCaja;
  concepto: string;
  montoCop: MontoCOP;
}
