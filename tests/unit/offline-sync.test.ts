import { describe, expect, it } from "vitest";
import { decidirAccionSync } from "@/lib/offline/sync";

describe("decidirAccionSync", () => {
  it("sin manejador registrado -> fallida", () => {
    expect(decidirAccionSync(false, undefined)).toEqual({
      tipo: "fallida",
      mensaje: "No hay un manejador registrado para este tipo de operación.",
    });
  });

  it("manejador exitoso -> sincronizada", () => {
    expect(decidirAccionSync(true, { ok: true })).toEqual({ tipo: "sincronizada" });
  });

  it("manejador fallido -> fallida con el mensaje del manejador", () => {
    expect(decidirAccionSync(true, { ok: false, mensaje: "cupo insuficiente" })).toEqual({
      tipo: "fallida",
      mensaje: "cupo insuficiente",
    });
  });

  it("manejador existe pero sin resultado -> fallida con mensaje genérico", () => {
    expect(decidirAccionSync(true, undefined)).toEqual({
      tipo: "fallida",
      mensaje: "Error desconocido.",
    });
  });
});
