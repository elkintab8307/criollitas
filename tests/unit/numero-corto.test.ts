import { describe, expect, it } from "vitest";
import { siguienteNumeroCorto } from "@/lib/pedido/numeroCorto";

describe("siguienteNumeroCorto", () => {
  it("devuelve 1 si no hay pedidos hoy", () => {
    expect(siguienteNumeroCorto([])).toBe(1);
  });
  it("devuelve el máximo más 1", () => {
    expect(siguienteNumeroCorto([1, 2, 3])).toBe(4);
  });
  it("no depende del orden del arreglo", () => {
    expect(siguienteNumeroCorto([5, 1, 3])).toBe(6);
  });
});
