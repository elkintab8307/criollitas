import { describe, expect, it } from "vitest";
import { decidirResultadoPin } from "@/lib/offline/pinLocal";
import type { IdentidadLocal } from "@/lib/offline/db";

const identidad: IdentidadLocal = {
  usuarioId: "u1",
  nombre: "Ana",
  rol: "cajera",
  sedeId: "s1",
  pinHash: "hash",
  refreshToken: "token",
  actualizadaEn: new Date().toISOString(),
};

describe("decidirResultadoPin", () => {
  it("sin identidad cacheada -> sin_credencial_local", () => {
    expect(decidirResultadoPin(undefined, true, { bloqueado: false, segundosRestantes: 0 })).toEqual({
      tipo: "sin_credencial_local",
    });
  });

  it("bloqueado por intentos -> bloqueado con segundos restantes", () => {
    expect(decidirResultadoPin(identidad, true, { bloqueado: true, segundosRestantes: 42 })).toEqual({
      tipo: "bloqueado",
      segundosRestantes: 42,
    });
  });

  it("hash no coincide -> incorrecto", () => {
    expect(decidirResultadoPin(identidad, false, { bloqueado: false, segundosRestantes: 0 })).toEqual({
      tipo: "incorrecto",
    });
  });

  it("hash coincide y sin bloqueo -> correcto con la identidad", () => {
    expect(decidirResultadoPin(identidad, true, { bloqueado: false, segundosRestantes: 0 })).toEqual({
      tipo: "correcto",
      identidad,
    });
  });
});
