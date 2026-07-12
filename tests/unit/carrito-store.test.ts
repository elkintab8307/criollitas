import { beforeEach, describe, expect, it } from "vitest";
import { useCarritoStore } from "@/lib/pedido/carritoStore";

const itemBase = {
  productoId: "p1",
  nombre: "Arepa",
  precioUnitPesos: 15000,
  cantidad: 1,
  modificadores: [],
  nota: "",
};

describe("useCarritoStore", () => {
  beforeEach(() => {
    useCarritoStore.setState({ items: [] });
  });

  it("agrega un ítem con una clave generada", () => {
    useCarritoStore.getState().agregar(itemBase);
    const items = useCarritoStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]?.nombre).toBe("Arepa");
    expect(typeof items[0]?.clave).toBe("string");
  });

  it("quita un ítem por clave", () => {
    useCarritoStore.getState().agregar(itemBase);
    const clave = useCarritoStore.getState().items[0]!.clave;
    useCarritoStore.getState().quitar(clave);
    expect(useCarritoStore.getState().items).toHaveLength(0);
  });

  it("cambia la cantidad de un ítem", () => {
    useCarritoStore.getState().agregar(itemBase);
    const clave = useCarritoStore.getState().items[0]!.clave;
    useCarritoStore.getState().cambiarCantidad(clave, 3);
    expect(useCarritoStore.getState().items[0]?.cantidad).toBe(3);
  });

  it("cambia la nota de un ítem", () => {
    useCarritoStore.getState().agregar(itemBase);
    const clave = useCarritoStore.getState().items[0]!.clave;
    useCarritoStore.getState().cambiarNota(clave, "sin cebolla");
    expect(useCarritoStore.getState().items[0]?.nota).toBe("sin cebolla");
  });

  it("vacía el carrito", () => {
    useCarritoStore.getState().agregar(itemBase);
    useCarritoStore.getState().vaciar();
    expect(useCarritoStore.getState().items).toHaveLength(0);
  });
});
