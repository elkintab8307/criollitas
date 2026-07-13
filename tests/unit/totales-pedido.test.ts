import { describe, expect, it } from "vitest";
import { calcularSubtotalItem, calcularTotalesPedido } from "@/lib/pedido/totales";

describe("calcularSubtotalItem", () => {
  it("multiplica precio por cantidad sin modificadores", () => {
    expect(calcularSubtotalItem({ precioUnitCop: 1500000n, cantidad: 2, modificadoresDeltaCop: [] })).toBe(
      3000000n,
    );
  });
  it("suma los modificadores antes de multiplicar", () => {
    expect(
      calcularSubtotalItem({ precioUnitCop: 1500000n, cantidad: 2, modificadoresDeltaCop: [350000n, 200000n] }),
    ).toBe(4100000n); // (1.500.000 + 350.000 + 200.000) * 2
  });
});

describe("calcularTotalesPedido", () => {
  it("suma el subtotal de varios ítems", () => {
    const { subtotalCop, totalCop } = calcularTotalesPedido([
      { precioUnitCop: 1500000n, cantidad: 1, modificadoresDeltaCop: [] },
      { precioUnitCop: 700000n, cantidad: 2, modificadoresDeltaCop: [] },
    ]);
    expect(subtotalCop).toBe(2900000n);
    expect(totalCop).toBe(2900000n);
  });
  it("da 0 con lista vacía", () => {
    const { subtotalCop, totalCop } = calcularTotalesPedido([]);
    expect(subtotalCop).toBe(0n);
    expect(totalCop).toBe(0n);
  });
});
