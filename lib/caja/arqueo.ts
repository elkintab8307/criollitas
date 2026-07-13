import { sumar, type MontoCOP } from "@/lib/money";

export interface DatosArqueo {
  efectivoInicialCop: MontoCOP;
  pagosEfectivoCop: MontoCOP[];
  retirosCop: MontoCOP[];
  gastosCop: MontoCOP[];
  ingresosExtraCop: MontoCOP[];
}

/** Documenta y prueba en TypeScript la MISMA fórmula que implementa el RPC
 *  cerrar_turno en SQL (supabase/migrations/20260714110000_rpcs_turno_cobro.sql)
 *  — el RPC es la fuente de verdad ejecutada al cerrar, esta función se usa
 *  para la vista previa antes de confirmar y para cobertura de TDD
 *  (CLAUDE.md §4.1). Si se cambia una, cambiar la otra. */
export function calcularEsperado(datos: DatosArqueo): MontoCOP {
  return sumar(
    datos.efectivoInicialCop,
    ...datos.pagosEfectivoCop,
    ...datos.retirosCop.map((m) => -m),
    ...datos.gastosCop.map((m) => -m),
    ...datos.ingresosExtraCop,
  );
}

export function calcularDiferencia(efectivoDeclaradoCop: MontoCOP, esperadoCop: MontoCOP): MontoCOP {
  return efectivoDeclaradoCop - esperadoCop;
}
