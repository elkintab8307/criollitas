import type { MontoCOP } from "@/lib/money";

export interface DatosAperturaCajon {
  sedeNombre: string;
  cajeraNombre: string;
  fecha: Date;
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
  /** Suma de gastos + retiros del turno -- "cuánto dinero se sacó". */
  salidasCop: MontoCOP;
  /** Suma de ingresos extra del turno -- "cuánto dinero extra se ingresó". */
  entradasExtraCop: MontoCOP;
  esperadoCop: MontoCOP;
  efectivoDeclaradoCop: MontoCOP;
  diferenciaCop: MontoCOP;
}

export type TipoMovimientoCaja = "retiro" | "gasto" | "ingreso_extra";

export interface DatosMovimiento {
  sedeNombre: string;
  cajeraNombre: string;
  fecha: Date;
  tipo: TipoMovimientoCaja;
  concepto: string;
  montoCop: MontoCOP;
}
