import { sumar, type MontoCOP } from "@/lib/money";

/** ¿La suma de los pagos cuadra exactamente con el total del pedido?
 *  CLAUDE.md §2.3: la suma debe cuadrar con el total, sin margen — un pago
 *  mixto que deja diferencia a favor de la casa o del cliente no se acepta.
 *  Documenta/prueba la misma regla que valida el RPC cobrar_pedido en SQL. */
export function pagosCuadranConTotal(montosPagoCop: MontoCOP[], totalCop: MontoCOP): boolean {
  return sumar(...montosPagoCop) === totalCop;
}
