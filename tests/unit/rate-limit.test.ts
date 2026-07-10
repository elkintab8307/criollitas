import { describe, expect, it } from "vitest";
import { evaluarRateLimit } from "@/lib/auth/pin";

const ahora = new Date("2026-07-09T15:00:00Z");
const hace = (seg: number) => new Date(ahora.getTime() - seg * 1000);

describe("evaluarRateLimit", () => {
  it("sin fallos no bloquea", () => {
    expect(evaluarRateLimit([], ahora)).toEqual({ bloqueado: false, segundosRestantes: 0 });
  });
  it("4 fallos recientes no bloquean", () => {
    const fallos = [hace(10), hace(20), hace(30), hace(40)];
    expect(evaluarRateLimit(fallos, ahora).bloqueado).toBe(false);
  });
  it("5 fallos dentro de 5 minutos bloquean", () => {
    const fallos = [hace(10), hace(60), hace(120), hace(180), hace(240)];
    const r = evaluarRateLimit(fallos, ahora);
    expect(r.bloqueado).toBe(true);
    expect(r.segundosRestantes).toBe(60); // el más antiguo (240s) sale de la ventana en 60s
  });
  it("fallos viejos fuera de la ventana no cuentan", () => {
    const fallos = [hace(301), hace(400), hace(500), hace(600), hace(700)];
    expect(evaluarRateLimit(fallos, ahora).bloqueado).toBe(false);
  });
});
