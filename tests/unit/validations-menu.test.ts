import { describe, expect, it } from "vitest";
import { categoriaSchema, modificadorSchema, productoSchema } from "@/lib/validations/menu";

const categoriaId = "00000000-0000-4000-8000-000000000201";
const productoId = "00000000-0000-4000-8000-000000000301";

describe("productoSchema", () => {
  it("acepta un producto válido", () => {
    expect(
      productoSchema.safeParse({ nombre: "Criollita con Res", categoriaId, precioPesos: 15000, activo: true })
        .success,
    ).toBe(true);
  });
  it("rechaza precio 0, negativo o con decimales", () => {
    for (const precioPesos of [0, -100, 15000.5]) {
      expect(productoSchema.safeParse({ nombre: "X arepa", categoriaId, precioPesos, activo: true }).success).toBe(false);
    }
  });
  it("rechaza nombre vacío", () => {
    expect(productoSchema.safeParse({ nombre: "", categoriaId, precioPesos: 1000, activo: true }).success).toBe(false);
  });
});

describe("modificadorSchema", () => {
  const base = { productoId, nombre: "Queso campesino", deltaPesos: 0, obligatorio: false, maxSeleccion: 1 };
  it("acepta modificador opcional sin grupo", () => {
    expect(modificadorSchema.safeParse(base).success).toBe(true);
  });
  it("exige grupo cuando es obligatorio", () => {
    const r = modificadorSchema.safeParse({ ...base, obligatorio: true });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe("Los modificadores obligatorios necesitan un grupo");
    }
  });
  it("acepta obligatorio con grupo", () => {
    expect(modificadorSchema.safeParse({ ...base, obligatorio: true, grupo: "Queso" }).success).toBe(true);
  });
  it("rechaza maxSeleccion 0 y delta negativo", () => {
    expect(modificadorSchema.safeParse({ ...base, maxSeleccion: 0 }).success).toBe(false);
    expect(modificadorSchema.safeParse({ ...base, deltaPesos: -100 }).success).toBe(false);
  });
});

describe("categoriaSchema", () => {
  it("acepta nombre válido y rechaza vacío", () => {
    expect(categoriaSchema.safeParse({ nombre: "Bebidas" }).success).toBe(true);
    expect(categoriaSchema.safeParse({ nombre: "" }).success).toBe(false);
  });
});
