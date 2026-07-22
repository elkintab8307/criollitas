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
  esperadoCop: MontoCOP;
  efectivoDeclaradoCop: MontoCOP;
  diferenciaCop: MontoCOP;
}
