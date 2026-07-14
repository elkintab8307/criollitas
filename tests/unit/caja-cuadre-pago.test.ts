import { describe, expect, it } from "vitest";
import { calcularVuelto, pagosCuadranConTotal } from "@/lib/caja/cuadrePago";

describe("pagosCuadranConTotal", () => {
  it("un solo pago que coincide exacto", () => {
    expect(pagosCuadranConTotal([50000n], 50000n)).toBe(true);
  });
  it("pago mixto que suma exacto", () => {
    expect(pagosCuadranConTotal([30000n, 20000n], 50000n)).toBe(true);
  });
  it("suma menor al total: no cuadra", () => {
    expect(pagosCuadranConTotal([30000n], 50000n)).toBe(false);
  });
  it("suma mayor al total: no cuadra", () => {
    expect(pagosCuadranConTotal([60000n], 50000n)).toBe(false);
  });
  it("sin pagos: no cuadra salvo total cero", () => {
    expect(pagosCuadranConTotal([], 50000n)).toBe(false);
    expect(pagosCuadranConTotal([], 0n)).toBe(true);
  });
});

describe("calcularVuelto", () => {
  it("entregado menor al restante: cubre todo lo entregado, sin vuelto", () => {
    expect(calcularVuelto(20000n, 37000n)).toEqual({ cubreCop: 20000n, vueltoCop: 0n });
  });
  it("entregado igual al restante: cubre todo, sin vuelto", () => {
    expect(calcularVuelto(37000n, 37000n)).toEqual({ cubreCop: 37000n, vueltoCop: 0n });
  });
  it("entregado mayor al restante: cubre solo el restante, el resto es vuelto", () => {
    expect(calcularVuelto(50000n, 37000n)).toEqual({ cubreCop: 37000n, vueltoCop: 13000n });
  });
  it("restante cero: no cubre nada, todo es vuelto", () => {
    expect(calcularVuelto(20000n, 0n)).toEqual({ cubreCop: 0n, vueltoCop: 20000n });
  });
  it("entregado cero: no cubre nada, sin vuelto", () => {
    expect(calcularVuelto(0n, 37000n)).toEqual({ cubreCop: 0n, vueltoCop: 0n });
  });
});
