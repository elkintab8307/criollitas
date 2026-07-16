import { describe, expect, it } from "vitest";
import { construirPaqueteImpresion } from "../src/paqueteImpresion";

const BASE64_HOLA = "aG9sYQ=="; // Buffer.from("hola").toString("base64")

describe("construirPaqueteImpresion", () => {
  it("arma el paquete con ip, puerto y los bytes decodificados", () => {
    const resultado = construirPaqueteImpresion(BASE64_HOLA, "192.168.1.50", 9100);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.valor.ip).toBe("192.168.1.50");
    expect(resultado.valor.puerto).toBe(9100);
    expect(resultado.valor.bytes.toString()).toBe("hola");
  });

  it("rechaza base64 inválido", () => {
    const resultado = construirPaqueteImpresion("esto no es base64 !!", "192.168.1.50", 9100);
    expect(resultado.ok).toBe(false);
  });

  it("rechaza contenido vacío", () => {
    const resultado = construirPaqueteImpresion("", "192.168.1.50", 9100);
    expect(resultado.ok).toBe(false);
  });

  it("rechaza cuando falta la IP", () => {
    const resultado = construirPaqueteImpresion(BASE64_HOLA, "", 9100);
    expect(resultado.ok).toBe(false);
  });

  it("rechaza un puerto fuera de rango", () => {
    const resultado = construirPaqueteImpresion(BASE64_HOLA, "192.168.1.50", 0);
    expect(resultado.ok).toBe(false);
  });

  it("rechaza un puerto no entero", () => {
    const resultado = construirPaqueteImpresion(BASE64_HOLA, "192.168.1.50", 9100.5);
    expect(resultado.ok).toBe(false);
  });
});
