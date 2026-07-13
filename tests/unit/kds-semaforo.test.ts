import { describe, expect, it } from "vitest";
import { calcularColorSemaforo } from "@/lib/kds/semaforo";

const ahora = new Date("2026-07-13T12:00:00.000Z");

function hace(minutos: number): Date {
  return new Date(ahora.getTime() - minutos * 60_000);
}

describe("calcularColorSemaforo", () => {
  it("verde justo al enviarse (0 min)", () => {
    expect(calcularColorSemaforo(hace(0), ahora)).toBe("verde");
  });
  it("verde a los 4.9 min", () => {
    expect(calcularColorSemaforo(hace(4.9), ahora)).toBe("verde");
  });
  it("amarillo exactamente a los 5 min (borde)", () => {
    expect(calcularColorSemaforo(hace(5), ahora)).toBe("amarillo");
  });
  it("amarillo a los 9.9 min", () => {
    expect(calcularColorSemaforo(hace(9.9), ahora)).toBe("amarillo");
  });
  it("rojo exactamente a los 10 min (borde)", () => {
    expect(calcularColorSemaforo(hace(10), ahora)).toBe("rojo");
  });
  it("rojo a los 25 min", () => {
    expect(calcularColorSemaforo(hace(25), ahora)).toBe("rojo");
  });
});
