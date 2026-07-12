import { describe, expect, it } from "vitest";
import { err, ok } from "@/lib/result";

describe("Result", () => {
  it("ok envuelve el valor", () => {
    expect(ok(5)).toEqual({ ok: true, valor: 5 });
  });
  it("err envuelve el error de dominio", () => {
    expect(err({ codigo: "VALIDACION", mensaje: "x" })).toEqual({
      ok: false,
      error: { codigo: "VALIDACION", mensaje: "x" },
    });
  });
});
