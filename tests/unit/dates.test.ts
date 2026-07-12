import { describe, expect, it } from "vitest";
import { formatearFecha, formatearHora, TZ_BOGOTA } from "@/lib/dates";

describe("dates", () => {
  // 2026-07-09T20:30:00Z === 15:30 en Bogotá (UTC-5)
  const instante = new Date("2026-07-09T20:30:00Z");

  it("expone la zona fija", () => {
    expect(TZ_BOGOTA).toBe("America/Bogota");
  });
  it("formatea en zona Bogotá sin importar la TZ de la máquina", () => {
    expect(formatearHora(instante)).toBe("3:30 PM");
  });
  it("formatea fecha larga en español", () => {
    expect(formatearFecha(instante)).toBe("9 de julio de 2026, 3:30 PM");
  });
});
