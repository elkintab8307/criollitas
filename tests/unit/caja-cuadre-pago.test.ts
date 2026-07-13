import { describe, expect, it } from "vitest";
import { pagosCuadranConTotal } from "@/lib/caja/cuadrePago";

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
