import { describe, expect, it } from "vitest";
import { parsearEnv } from "../src/config";

describe("parsearEnv", () => {
  it("lee pares CLAVE=valor", () => {
    const resultado = parsearEnv("PRINT_BRIDGE_TOKEN=abc123\nPRINTER_IP=192.168.1.50\n");
    expect(resultado).toEqual({ PRINT_BRIDGE_TOKEN: "abc123", PRINTER_IP: "192.168.1.50" });
  });

  it("ignora líneas vacías y comentarios", () => {
    const resultado = parsearEnv("# comentario\n\nPUERTO=7070\n");
    expect(resultado).toEqual({ PUERTO: "7070" });
  });

  it("recorta espacios alrededor de clave y valor", () => {
    const resultado = parsearEnv("  PUERTO = 7070  \n");
    expect(resultado).toEqual({ PUERTO: "7070" });
  });

  it("conserva el signo = dentro del valor (solo el primero separa clave de valor)", () => {
    const resultado = parsearEnv("PRINTER_IP=192.168.1.50=x\n");
    expect(resultado).toEqual({ PRINTER_IP: "192.168.1.50=x" });
  });

  it("retorna vacío para contenido vacío", () => {
    expect(parsearEnv("")).toEqual({});
  });
});
