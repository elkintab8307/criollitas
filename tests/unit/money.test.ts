import { describe, expect, it } from "vitest";
import { formatearCOP, montoDesdePesos, multiplicar, parsearCOP, sumar } from "@/lib/money";

describe("money", () => {
  it("crea montos desde pesos enteros", () => {
    expect(montoDesdePesos(12500)).toBe(1250000n);
  });
  it("rechaza pesos no enteros", () => {
    expect(() => montoDesdePesos(12.5)).toThrow();
  });
  it("suma montos", () => {
    expect(sumar(1250000n, 350000n)).toBe(1600000n);
  });
  it("multiplica por cantidad entera", () => {
    expect(multiplicar(1250000n, 3)).toBe(3750000n);
  });
  it("rechaza cantidad no entera", () => {
    expect(() => multiplicar(1250000n, 1.5)).toThrow();
  });
  it("formatea es-CO sin decimales con miles de punto", () => {
    expect(formatearCOP(1250000n)).toBe("$ 12.500");
    expect(formatearCOP(0n)).toBe("$ 0");
  });
  it("formatea montos grandes", () => {
    expect(formatearCOP(999999999900n)).toBe("$ 9.999.999.999");
  });
  it("formatea negativos (reversiones)", () => {
    expect(formatearCOP(-1250000n)).toBe("-$ 12.500");
  });
  it("parsea el formato de vuelta", () => {
    expect(parsearCOP("$ 12.500")).toBe(1250000n);
    expect(parsearCOP("12.500")).toBe(1250000n);
    expect(parsearCOP("abc")).toBeNull();
  });
});
