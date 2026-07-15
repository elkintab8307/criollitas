import { describe, expect, it } from "vitest";
import { evaluarConectividad } from "@/lib/offline/conectividad";

describe("evaluarConectividad", () => {
  it("sin señal de red es offline, sin importar el ping", () => {
    expect(evaluarConectividad(false, null)).toBe("offline");
    expect(evaluarConectividad(false, { exito: true, enMs: 50 })).toBe("offline");
  });

  it("con señal de red y sin ping todavía, es online (optimista)", () => {
    expect(evaluarConectividad(true, null)).toBe("online");
  });

  it("con señal de red y último ping exitoso, es online", () => {
    expect(evaluarConectividad(true, { exito: true, enMs: 80 })).toBe("online");
  });

  it("con señal de red pero último ping fallido, es offline", () => {
    expect(evaluarConectividad(true, { exito: false, enMs: 3000 })).toBe("offline");
  });
});
