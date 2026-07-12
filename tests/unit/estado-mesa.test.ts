import { describe, expect, it } from "vitest";
import { metaEstadoMesa } from "@/lib/mesas/estado";

describe("metaEstadoMesa", () => {
  it("mapea libre a verde", () => {
    const m = metaEstadoMesa("libre");
    expect(m.etiqueta).toBe("Libre");
    expect(m.claseFondo).toContain("verde");
  });
  it("mapea ocupada a mostaza", () => {
    const m = metaEstadoMesa("ocupada");
    expect(m.etiqueta).toBe("Ocupada");
    expect(m.claseFondo).toContain("mostaza");
  });
  it("mapea reservada a tomate", () => {
    const m = metaEstadoMesa("reservada");
    expect(m.etiqueta).toBe("Reservada");
    expect(m.claseFondo).toContain("tomate");
  });
  it("cae a un fallback seguro para un valor desconocido", () => {
    // @ts-expect-error probamos un valor fuera del enum a propósito
    const m = metaEstadoMesa("gris");
    expect(m.etiqueta).toBe("Libre");
    expect(typeof m.claseFondo).toBe("string");
  });
});
