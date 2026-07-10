/** Montos en centavos de peso colombiano. Nunca usar number para dinero. */
export type MontoCOP = bigint;

export function montoDesdePesos(pesos: number): MontoCOP {
  if (!Number.isInteger(pesos)) {
    throw new RangeError("Los pesos deben ser un entero; usa centavos para fracciones");
  }
  return BigInt(pesos) * 100n;
}

export function sumar(...montos: MontoCOP[]): MontoCOP {
  return montos.reduce((acc, m) => acc + m, 0n);
}

export function multiplicar(monto: MontoCOP, cantidad: number): MontoCOP {
  if (!Number.isInteger(cantidad)) {
    throw new RangeError("La cantidad debe ser un entero");
  }
  return monto * BigInt(cantidad);
}

export function formatearCOP(monto: MontoCOP): string {
  const negativo = monto < 0n;
  const abs = negativo ? -monto : monto;
  const pesos = abs / 100n;
  const miles = pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negativo ? "-" : ""}$ ${miles}`;
}

export function parsearCOP(texto: string): MontoCOP | null {
  const limpio = texto.replace(/[$\s.]/g, "");
  if (!/^-?\d+$/.test(limpio)) return null;
  return BigInt(limpio) * 100n;
}
