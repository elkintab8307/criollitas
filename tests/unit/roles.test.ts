import { describe, expect, it } from "vitest";
import { rutaPorRol, RUTA_BASE_POR_ROL, SEDE_DEFAULT_ID, type Rol } from "@/lib/auth/roles";

describe("rutaPorRol", () => {
  it("mapea cada rol a su ruta base", () => {
    const roles: Rol[] = ["admin", "cajera", "vendedora", "cocina"];
    for (const rol of roles) {
      expect(rutaPorRol(rol)).toBe(RUTA_BASE_POR_ROL[rol]);
    }
  });

  it("admin va a /dashboard", () => {
    expect(rutaPorRol("admin")).toBe("/dashboard");
  });

  it("cajera va a /pedidos", () => {
    expect(rutaPorRol("cajera")).toBe("/pedidos");
  });

  it("vendedora va a /inicio", () => {
    expect(rutaPorRol("vendedora")).toBe("/inicio");
  });

  it("cocina va a /kds", () => {
    expect(rutaPorRol("cocina")).toBe("/kds");
  });

  it("SEDE_DEFAULT_ID es un UUID de sede fija para el seed", () => {
    expect(SEDE_DEFAULT_ID).toBe("00000000-0000-4000-8000-000000000001");
  });
});
