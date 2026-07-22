import { describe, expect, it } from "vitest";
import {
  agruparProductosVendidos,
  calcularEsperado,
  calcularDiferencia,
  desglosarPagosPorMetodo,
} from "@/lib/caja/arqueo";

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

describe("desglosarPagosPorMetodo", () => {
  it("suma los montos de cada método distinto de efectivo", () => {
    expect(
      desglosarPagosPorMetodo([
        { metodo: "nequi", montoCop: 500000n },
        { metodo: "datafono", montoCop: 300000n },
        { metodo: "nequi", montoCop: 200000n },
      ]),
    ).toEqual([
      { metodo: "nequi", montoCop: 700000n },
      { metodo: "datafono", montoCop: 300000n },
    ]);
  });

  it("excluye el efectivo -- ese cuadre ya se muestra aparte", () => {
    expect(
      desglosarPagosPorMetodo([
        { metodo: "efectivo", montoCop: 1000000n },
        { metodo: "nequi", montoCop: 500000n },
      ]),
    ).toEqual([{ metodo: "nequi", montoCop: 500000n }]);
  });

  it("devuelve vacío sin pagos por otro medio", () => {
    expect(desglosarPagosPorMetodo([{ metodo: "efectivo", montoCop: 1000000n }])).toEqual([]);
  });
});

describe("agruparProductosVendidos", () => {
  it("suma cantidad y total de un mismo producto en distintos pedidos", () => {
    expect(
      agruparProductosVendidos([
        { productoId: "p1", nombre: "Arepa de Choclo", cantidad: 2, subtotalCop: 1600000n },
        { productoId: "p2", nombre: "Gaseosa", cantidad: 1, subtotalCop: 300000n },
        { productoId: "p1", nombre: "Arepa de Choclo", cantidad: 3, subtotalCop: 2400000n },
      ]),
    ).toEqual([
      { nombre: "Arepa de Choclo", cantidad: 5, totalCop: 4000000n },
      { nombre: "Gaseosa", cantidad: 1, totalCop: 300000n },
    ]);
  });

  it("ordena de mayor a menor ingreso", () => {
    const resultado = agruparProductosVendidos([
      { productoId: "p1", nombre: "Barato", cantidad: 1, subtotalCop: 100000n },
      { productoId: "p2", nombre: "Caro", cantidad: 1, subtotalCop: 900000n },
    ]);
    expect(resultado.map((r) => r.nombre)).toEqual(["Caro", "Barato"]);
  });

  it("devuelve vacío sin ítems", () => {
    expect(agruparProductosVendidos([])).toEqual([]);
  });
});
