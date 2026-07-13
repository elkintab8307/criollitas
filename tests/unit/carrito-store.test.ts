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
    useCarritoStore.setState({ items: [], pedidoId: null });
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

  it("asegurarPedido no toca el carrito si es el mismo pedido", () => {
    useCarritoStore.getState().asegurarPedido("pedido-1");
    useCarritoStore.getState().agregar(itemBase);
    useCarritoStore.getState().asegurarPedido("pedido-1");
    expect(useCarritoStore.getState().items).toHaveLength(1);
  });

  it("asegurarPedido vacía el carrito si el pedido cambió", () => {
    useCarritoStore.getState().asegurarPedido("pedido-1");
    useCarritoStore.getState().agregar(itemBase);
    useCarritoStore.getState().asegurarPedido("pedido-2");
    expect(useCarritoStore.getState().items).toHaveLength(0);
    expect(useCarritoStore.getState().pedidoId).toBe("pedido-2");
  });

  it("asegurarPedido primera vez (pedidoId null) no vacía innecesariamente pero fija el pedido", () => {
    useCarritoStore.getState().asegurarPedido("pedido-1");
    expect(useCarritoStore.getState().pedidoId).toBe("pedido-1");
    expect(useCarritoStore.getState().items).toHaveLength(0);
  });
});
