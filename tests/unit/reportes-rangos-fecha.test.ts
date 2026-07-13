import { describe, expect, it } from "vitest";
import { resolverRangoPreset, rangoAnterior } from "@/lib/reportes/rangosFecha";

describe("resolverRangoPreset", () => {
  it("dia: devuelve el dia calendario completo en hora Bogota", () => {
    const referencia = new Date("2026-07-15T18:00:00.000Z");
    const { desde, hasta } = resolverRangoPreset("dia", referencia);
    expect(desde.toISOString()).toBe("2026-07-15T05:00:00.000Z");
    expect(hasta.toISOString()).toBe("2026-07-16T05:00:00.000Z");
  });

  it("semana: devuelve lunes a domingo de la semana de la fecha de referencia", () => {
    const referencia = new Date("2026-07-15T18:00:00.000Z");
    const { desde, hasta } = resolverRangoPreset("semana", referencia);
    expect(desde.toISOString()).toBe("2026-07-13T05:00:00.000Z");
    expect(hasta.toISOString()).toBe("2026-07-20T05:00:00.000Z");
  });

  it("mes: devuelve el mes calendario completo", () => {
    const referencia = new Date("2026-07-15T18:00:00.000Z");
    const { desde, hasta } = resolverRangoPreset("mes", referencia);
    expect(desde.toISOString()).toBe("2026-07-01T05:00:00.000Z");
    expect(hasta.toISOString()).toBe("2026-08-01T05:00:00.000Z");
  });

  it("anio: devuelve el año calendario completo", () => {
    const referencia = new Date("2026-07-15T18:00:00.000Z");
    const { desde, hasta } = resolverRangoPreset("anio", referencia);
    expect(desde.toISOString()).toBe("2026-01-01T05:00:00.000Z");
    expect(hasta.toISOString()).toBe("2027-01-01T05:00:00.000Z");
  });
});

describe("rangoAnterior", () => {
  it("devuelve un rango de la misma duracion inmediatamente antes", () => {
    const rango = {
      desde: new Date("2026-07-13T05:00:00.000Z"),
      hasta: new Date("2026-07-20T05:00:00.000Z"),
    };
    const anterior = rangoAnterior(rango);
    expect(anterior.desde.toISOString()).toBe("2026-07-06T05:00:00.000Z");
    expect(anterior.hasta.toISOString()).toBe("2026-07-13T05:00:00.000Z");
  });
});
