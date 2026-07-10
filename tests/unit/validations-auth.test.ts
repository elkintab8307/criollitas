import { describe, expect, it } from "vitest";
import { loginSchema, pinSchema } from "@/lib/validations/auth";

describe("loginSchema", () => {
  it("acepta credenciales válidas", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "secreta123" }).success).toBe(true);
  });
  it("rechaza email inválido con mensaje en español", () => {
    const r = loginSchema.safeParse({ email: "no-es-email", password: "secreta123" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("Ingresa un correo válido");
  });
  it("rechaza password corta", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "123" }).success).toBe(false);
  });
});

describe("pinSchema", () => {
  const usuarioId = "3f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b";
  it("acepta PIN de 4 a 6 dígitos", () => {
    expect(pinSchema.safeParse({ usuarioId, pin: "2468" }).success).toBe(true);
    expect(pinSchema.safeParse({ usuarioId, pin: "246810" }).success).toBe(true);
  });
  it("rechaza PIN con letras, corto o largo", () => {
    expect(pinSchema.safeParse({ usuarioId, pin: "24a8" }).success).toBe(false);
    expect(pinSchema.safeParse({ usuarioId, pin: "123" }).success).toBe(false);
    expect(pinSchema.safeParse({ usuarioId, pin: "1234567" }).success).toBe(false);
  });
  it("rechaza usuarioId que no es uuid", () => {
    expect(pinSchema.safeParse({ usuarioId: "1", pin: "2468" }).success).toBe(false);
  });
});
