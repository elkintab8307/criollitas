import { describe, expect, it } from "vitest";
import { tokenValido } from "../src/autenticacion";

describe("tokenValido", () => {
  it("acepta cuando el token coincide exactamente", () => {
    expect(tokenValido("abc123", "abc123")).toBe(true);
  });

  it("rechaza cuando el token no coincide", () => {
    expect(tokenValido("otro-token", "abc123")).toBe(false);
  });

  it("rechaza cuando no se envía token (undefined)", () => {
    expect(tokenValido(undefined, "abc123")).toBe(false);
  });

  it("rechaza un token vacío aunque el esperado también esté vacío (config incompleta)", () => {
    expect(tokenValido("", "")).toBe(false);
  });
});
