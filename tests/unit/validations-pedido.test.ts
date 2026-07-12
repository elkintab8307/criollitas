import { describe, expect, it } from "vitest";
import { clienteDomicilioSchema, enviarPedidoSchema, itemPedidoEnvioSchema } from "@/lib/validations/pedido";

const productoId = "00000000-0000-4000-8000-000000000301";

describe("clienteDomicilioSchema", () => {
  it("acepta datos válidos sin referencia", () => {
    expect(
      clienteDomicilioSchema.safeParse({
        nombre: "María Pérez",
        telefono: "3211234567",
        direccion: "Cra 14 # 8-28",
      }).success,
    ).toBe(true);
  });
  it("rechaza nombre, teléfono o dirección demasiado cortos", () => {
    expect(
      clienteDomicilioSchema.safeParse({ nombre: "M", telefono: "3211234567", direccion: "Cra 14 # 8-28" })
        .success,
    ).toBe(false);
    expect(
      clienteDomicilioSchema.safeParse({ nombre: "María", telefono: "123", direccion: "Cra 14 # 8-28" }).success,
    ).toBe(false);
    expect(
      clienteDomicilioSchema.safeParse({ nombre: "María", telefono: "3211234567", direccion: "Cra" }).success,
    ).toBe(false);
  });
});

describe("itemPedidoEnvioSchema", () => {
  it("acepta un ítem válido con modificadores", () => {
    expect(
      itemPedidoEnvioSchema.safeParse({
        productoId,
        cantidad: 2,
        modificadorIds: [productoId],
        nota: "sin cebolla",
      }).success,
    ).toBe(true);
  });
  it("acepta sin modificadores ni nota (usa el default)", () => {
    const resultado = itemPedidoEnvioSchema.safeParse({ productoId, cantidad: 1 });
    expect(resultado.success).toBe(true);
    if (resultado.success) expect(resultado.data.modificadorIds).toEqual([]);
  });
  it("rechaza cantidad 0, negativa o mayor a 50", () => {
    for (const cantidad of [0, -1, 51]) {
      expect(itemPedidoEnvioSchema.safeParse({ productoId, cantidad }).success).toBe(false);
    }
  });
});

describe("enviarPedidoSchema", () => {
  it("rechaza un carrito vacío", () => {
    expect(enviarPedidoSchema.safeParse({ items: [] }).success).toBe(false);
  });
  it("acepta al menos un ítem", () => {
    expect(enviarPedidoSchema.safeParse({ items: [{ productoId, cantidad: 1 }] }).success).toBe(true);
  });
});
