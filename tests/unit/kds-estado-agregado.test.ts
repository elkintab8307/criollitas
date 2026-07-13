import { describe, expect, it } from "vitest";
import { calcularEstadoAgregado } from "@/lib/kds/estadoAgregado";

describe("calcularEstadoAgregado", () => {
  it("todos pendiente -> enviado_cocina", () => {
    expect(calcularEstadoAgregado(["pendiente", "pendiente"])).toBe("enviado_cocina");
  });
  it("uno en_preparacion, resto pendiente -> en_preparacion", () => {
    expect(calcularEstadoAgregado(["pendiente", "en_preparacion"])).toBe("en_preparacion");
  });
  it("uno listo, resto pendiente -> en_preparacion (mezcla)", () => {
    expect(calcularEstadoAgregado(["pendiente", "listo"])).toBe("en_preparacion");
  });
  it("todos listo -> listo", () => {
    expect(calcularEstadoAgregado(["listo", "listo"])).toBe("listo");
  });
  it("un solo ítem listo -> listo", () => {
    expect(calcularEstadoAgregado(["listo"])).toBe("listo");
  });
  it("lista vacía -> enviado_cocina (caso defensivo, no debería ocurrir)", () => {
    expect(calcularEstadoAgregado([])).toBe("enviado_cocina");
  });
});
