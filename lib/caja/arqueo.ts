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

export interface DesglosePago {
  metodo: string;
  montoCop: MontoCOP;
}

/** Agrupa pagos por método, excluyendo efectivo (que ya se muestra aparte
 *  como el cuadre físico) -- para que la cajera y el administrador vean
 *  cuánto entró exactamente por cada medio virtual (Nequi, Daviplata,
 *  etc.) en vez de un solo bulto "otro medio" (pedido del usuario).
 *  Preserva el orden de aparición del primer pago de cada método. */
export function desglosarPagosPorMetodo(pagos: { metodo: string; montoCop: MontoCOP }[]): DesglosePago[] {
  const acumulado = new Map<string, MontoCOP>();
  for (const pago of pagos) {
    if (pago.metodo === "efectivo") continue;
    acumulado.set(pago.metodo, (acumulado.get(pago.metodo) ?? 0n) + pago.montoCop);
  }
  return Array.from(acumulado.entries()).map(([metodo, montoCop]) => ({ metodo, montoCop }));
}

export interface ProductoVendido {
  nombre: string;
  cantidad: number;
  totalCop: MontoCOP;
}

/** Agrupa los ítems de los pedidos cobrados en el turno por producto --
 *  cantidad y valor total vendido de cada uno, de mayor a menor ingreso,
 *  para que el administrador vea de un vistazo qué se vendió más (pedido
 *  del usuario: la tirilla de cierre debe mostrar productos, cantidad y
 *  valor). */
export function agruparProductosVendidos(
  items: { productoId: string; nombre: string; cantidad: number; subtotalCop: MontoCOP }[],
): ProductoVendido[] {
  const acumulado = new Map<string, ProductoVendido>();
  for (const item of items) {
    const existente = acumulado.get(item.productoId);
    if (existente) {
      existente.cantidad += item.cantidad;
      existente.totalCop += item.subtotalCop;
    } else {
      acumulado.set(item.productoId, { nombre: item.nombre, cantidad: item.cantidad, totalCop: item.subtotalCop });
    }
  }
  return Array.from(acumulado.values()).sort((a, b) => (a.totalCop < b.totalCop ? 1 : a.totalCop > b.totalCop ? -1 : 0));
}
