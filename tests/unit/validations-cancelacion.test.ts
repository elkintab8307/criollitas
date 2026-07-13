import { describe, expect, it } from "vitest";
import { motivoCancelacionSchema } from "@/lib/validations/cancelacion";

describe("motivoCancelacionSchema", () => {
  it("acepta un motivo válido", () => {
    expect(motivoCancelacionSchema.safeParse({ motivo: "Cliente se retiró" }).success).toBe(true);
  });

  it("rechaza un motivo de menos de 5 caracteres", () => {
    expect(motivoCancelacionSchema.safeParse({ motivo: "Hola" }).success).toBe(false);
  });

  it("rechaza un motivo vacío", () => {
    expect(motivoCancelacionSchema.safeParse({ motivo: "" }).success).toBe(false);
  });

  it("rechaza un motivo de más de 500 caracteres", () => {
    expect(motivoCancelacionSchema.safeParse({ motivo: "a".repeat(501) }).success).toBe(false);
  });

  it("acepta exactamente 5 y exactamente 500 caracteres", () => {
    expect(motivoCancelacionSchema.safeParse({ motivo: "a".repeat(5) }).success).toBe(true);
    expect(motivoCancelacionSchema.safeParse({ motivo: "a".repeat(500) }).success).toBe(true);
  });
});
