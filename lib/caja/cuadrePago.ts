import { sumar, type MontoCOP } from "@/lib/money";

/** ¿La suma de los pagos cuadra exactamente con el total del pedido?
 *  CLAUDE.md §2.3: la suma debe cuadrar con el total, sin margen — un pago
 *  mixto que deja diferencia a favor de la casa o del cliente no se acepta.
 *  Documenta/prueba la misma regla que valida el RPC cobrar_pedido en SQL. */
export function pagosCuadranConTotal(montosPagoCop: MontoCOP[], totalCop: MontoCOP): boolean {
  return sumar(...montosPagoCop) === totalCop;
}

/** Cuánto de lo entregado cubre lo que falta del total, y cuánto vuelto
 *  corresponde devolver. Capa de ayuda visual para la cajera -- nunca
 *  cambia qué se envía al backend (siempre el campo "Monto", nunca el
 *  monto bruto entregado); el invariante de pagosCuadranConTotal no se
 *  toca. `restantePorCubrirCop` es el total menos lo ya cubierto por las
 *  filas anteriores en un pago mixto -- con una sola fila, es el total
 *  completo del pedido. */
export function calcularVuelto(
  entregadoCop: MontoCOP,
  restantePorCubrirCop: MontoCOP,
): { cubreCop: MontoCOP; vueltoCop: MontoCOP } {
  const cubreCop = entregadoCop < restantePorCubrirCop ? entregadoCop : restantePorCubrirCop;
  const vueltoCop = entregadoCop - cubreCop;
  return { cubreCop, vueltoCop };
}
