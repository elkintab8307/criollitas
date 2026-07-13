import { multiplicar, sumar, type MontoCOP } from "@/lib/money";

export interface ItemParaTotal {
  precioUnitCop: MontoCOP;
  cantidad: number;
  modificadoresDeltaCop: MontoCOP[];
}

export function calcularSubtotalItem(item: ItemParaTotal): MontoCOP {
  const precioConMods = sumar(item.precioUnitCop, ...item.modificadoresDeltaCop);
  return multiplicar(precioConMods, item.cantidad);
}

export function calcularTotalesPedido(
  items: ItemParaTotal[],
): { subtotalCop: MontoCOP; totalCop: MontoCOP } {
  const subtotalCop = sumar(...items.map(calcularSubtotalItem));
  return { subtotalCop, totalCop: subtotalCop };
}
