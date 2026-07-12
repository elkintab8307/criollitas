import { describe, expect, it } from "vitest";
import { mesaSchema } from "@/lib/validations/mesas";

describe("mesaSchema", () => {
  it("acepta una mesa válida", () => {
    expect(mesaSchema.safeParse({ numero: 3, nombre: "Terraza", capacidad: 6, activa: true }).success).toBe(true);
  });
  it("acepta sin nombre (opcional)", () => {
    expect(mesaSchema.safeParse({ numero: 3, capacidad: 4, activa: true }).success).toBe(true);
  });
  it("rechaza número 0, negativo o decimal", () => {
    for (const numero of [0, -1, 2.5]) {
      expect(mesaSchema.safeParse({ numero, capacidad: 4, activa: true }).success).toBe(false);
    }
  });
  it("rechaza capacidad fuera de 1..20", () => {
    expect(mesaSchema.safeParse({ numero: 1, capacidad: 0, activa: true }).success).toBe(false);
    expect(mesaSchema.safeParse({ numero: 1, capacidad: 21, activa: true }).success).toBe(false);
  });
});
