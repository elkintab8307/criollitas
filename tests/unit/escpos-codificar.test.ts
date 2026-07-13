import { describe, expect, it } from "vitest";
import { codificarEscPos } from "@/lib/escpos/codificar";

describe("codificarEscPos", () => {
  it("devuelve una cadena base64 válida", () => {
    const resultado = codificarEscPos(["Línea 1", "Línea 2"]);
    expect(() => Buffer.from(resultado, "base64")).not.toThrow();
  });

  it("el payload decodificado empieza con el reset de impresora (ESC @)", () => {
    const resultado = codificarEscPos(["Hola"]);
    const bytes = Buffer.from(resultado, "base64");
    expect(bytes[0]).toBe(0x1b);
    expect(bytes[1]).toBe(0x40);
  });

  it("el payload decodificado contiene el texto de cada línea", () => {
    const resultado = codificarEscPos(["Pedido #42", "Total: $ 10.000"]);
    const texto = Buffer.from(resultado, "base64").toString("binary");
    expect(texto).toContain("Pedido #42");
    expect(texto).toContain("Total: $ 10.000");
  });

  it("el payload decodificado termina con el corte de papel (GS V 0)", () => {
    const resultado = codificarEscPos(["Hola"]);
    const bytes = Buffer.from(resultado, "base64");
    const ultimos3 = bytes.subarray(bytes.length - 3);
    expect(ultimos3[0]).toBe(0x1d);
    expect(ultimos3[1]).toBe(0x56);
    expect(ultimos3[2]).toBe(0x00);
  });

  it("un carácter fuera de Latin-1 (em dash, U+2014) se corrompería en la codificación binary — nunca debe llegar aquí desde construirLineasTicket", () => {
    // Documenta el límite real de esta función: codificarEscPos usa Buffer
    // "binary" (latin1, 1 byte por carácter) porque así hablan las
    // impresoras térmicas. Tildes/¡/@ (≤ U+00FF) sobreviven; un em dash
    // (U+2014) no — se trunca a un byte basura (0x14). La responsabilidad
    // de no producir esos caracteres es de quien arma las líneas
    // (construirLineasTicket ya evita el em dash por esto mismo).
    const resultado = codificarEscPos(["Criollitas — Arepas"]);
    const texto = Buffer.from(resultado, "base64").toString("binary");
    expect(texto).not.toContain("Criollitas — Arepas");
  });
});
