import { describe, expect, it } from "vitest";
import { calcularEsperado, calcularDiferencia } from "@/lib/caja/arqueo";

describe("calcularEsperado", () => {
  it("solo efectivo inicial, sin movimientos", () => {
    expect(
      calcularEsperado({
        efectivoInicialCop: 100000n,
        pagosEfectivoCop: [],
        retirosCop: [],
        gastosCop: [],
        ingresosExtraCop: [],
      }),
    ).toBe(100000n);
  });

  it("suma pagos en efectivo", () => {
    expect(
      calcularEsperado({
        efectivoInicialCop: 100000n,
        pagosEfectivoCop: [50000n, 30000n],
        retirosCop: [],
        gastosCop: [],
        ingresosExtraCop: [],
      }),
    ).toBe(180000n);
  });

  it("resta retiros y gastos", () => {
    expect(
      calcularEsperado({
        efectivoInicialCop: 100000n,
        pagosEfectivoCop: [50000n],
        retirosCop: [20000n],
        gastosCop: [10000n],
        ingresosExtraCop: [],
      }),
    ).toBe(120000n);
  });

  it("suma ingresos extra", () => {
    expect(
      calcularEsperado({
        efectivoInicialCop: 100000n,
        pagosEfectivoCop: [],
        retirosCop: [],
        gastosCop: [],
        ingresosExtraCop: [15000n],
      }),
    ).toBe(115000n);
  });

  it("combina todo", () => {
    expect(
      calcularEsperado({
        efectivoInicialCop: 100000n,
        pagosEfectivoCop: [50000n, 30000n],
        retirosCop: [20000n],
        gastosCop: [5000n],
        ingresosExtraCop: [10000n],
      }),
    ).toBe(165000n);
  });
});

describe("calcularDiferencia", () => {
  it("cero cuando el declarado coincide con el esperado", () => {
    expect(calcularDiferencia(100000n, 100000n)).toBe(0n);
  });
  it("positiva cuando hay más efectivo del esperado", () => {
    expect(calcularDiferencia(105000n, 100000n)).toBe(5000n);
  });
  it("negativa cuando falta efectivo", () => {
    expect(calcularDiferencia(95000n, 100000n)).toBe(-5000n);
  });
});
