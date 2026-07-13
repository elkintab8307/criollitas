import { describe, expect, it } from "vitest";
import { siguienteEstadoTrasEnvio } from "@/lib/pedido/transicionEstado";

describe("siguienteEstadoTrasEnvio", () => {
  it("pasa de abierto a enviado_cocina", () => {
    expect(siguienteEstadoTrasEnvio("abierto")).toBe("enviado_cocina");
  });
  it("no transiciona si ya está enviado_cocina", () => {
    expect(siguienteEstadoTrasEnvio("enviado_cocina")).toBeNull();
  });
  it("no transiciona si está en_preparacion", () => {
    expect(siguienteEstadoTrasEnvio("en_preparacion")).toBeNull();
  });
  it("no transiciona si está listo", () => {
    expect(siguienteEstadoTrasEnvio("listo")).toBeNull();
  });
  it("no transiciona si está entregado", () => {
    expect(siguienteEstadoTrasEnvio("entregado")).toBeNull();
  });
});
