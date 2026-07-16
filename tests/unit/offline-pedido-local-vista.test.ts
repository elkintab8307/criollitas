import { describe, expect, it } from "vitest";
import { construirVistaPedidoLocal } from "@/lib/offline/pedidoLocalVista";
import type { PedidoLocal } from "@/lib/offline/db";

const pedidoBase: PedidoLocal = {
  pedidoId: "11111111-1111-4111-8111-111111111111",
  origen: { canal: "mesa", mesaId: "00000000-0000-4000-8000-000000000401" },
  items: [
    {
      productoId: "p1",
      nombre: "Super Criollita",
      cantidad: 2,
      precioUnitCop: 1700000,
      modificadores: [{ modificadorId: "m1", nombre: "Extra queso", precioDeltaCop: 200000 }],
      nota: null,
    },
    {
      productoId: "p2",
      nombre: "Gaseosa",
      cantidad: 1,
      precioUnitCop: 400000,
      modificadores: [],
      nota: "sin hielo",
    },
  ],
  estado: "abierto",
  sedeId: "00000000-0000-4000-8000-000000000001",
  vendedoraId: "v1",
  creadoEn: "2026-07-16T12:00:00.000Z",
};

const mesasCache = [
  { id: "00000000-0000-4000-8000-000000000401", numero: 1 },
  { id: "00000000-0000-4000-8000-000000000402", numero: 2 },
];

describe("construirVistaPedidoLocal", () => {
  it("calcula subtotales por ítem y total del pedido (unit + modificadores) * cantidad", () => {
    const { pedido, itemsConfirmados } = construirVistaPedidoLocal(pedidoBase, mesasCache);
    // (17.000 + 2.000) * 2 = 38.000 ; 4.000 * 1 = 4.000 ; total 42.000
    expect(itemsConfirmados[0]?.subtotalCop).toBe(3800000);
    expect(itemsConfirmados[1]?.subtotalCop).toBe(400000);
    expect(pedido.subtotalCop).toBe(4200000);
    expect(pedido.totalCop).toBe(4200000);
  });

  it("resuelve el número de mesa desde el catálogo cacheado", () => {
    const { pedido } = construirVistaPedidoLocal(pedidoBase, mesasCache);
    expect(pedido.canal).toBe("mesa");
    expect(pedido.mesaNumero).toBe(1);
  });

  it("mesa no encontrada en el catálogo -> mesaNumero null (no revienta)", () => {
    const { pedido } = construirVistaPedidoLocal(
      { ...pedidoBase, origen: { canal: "mesa", mesaId: "otra-mesa" } },
      mesasCache,
    );
    expect(pedido.mesaNumero).toBeNull();
  });

  it("canal llevar y domicilio no llevan mesa; domicilio sin nombre de cliente local", () => {
    const llevar = construirVistaPedidoLocal({ ...pedidoBase, origen: { canal: "llevar" } }, mesasCache);
    expect(llevar.pedido.canal).toBe("llevar");
    expect(llevar.pedido.mesaNumero).toBeNull();

    const domicilio = construirVistaPedidoLocal(
      { ...pedidoBase, origen: { canal: "domicilio", clienteId: "c1" } },
      mesasCache,
    );
    expect(domicilio.pedido.canal).toBe("domicilio");
    expect(domicilio.pedido.clienteNombre).toBeNull();
  });

  it("estado local abierto -> vista 'listo' (los ítems ya nacen listos con usa_cocina=false), cobrado -> 'cobrado'", () => {
    const abierto = construirVistaPedidoLocal(pedidoBase, mesasCache);
    expect(abierto.pedido.estado).toBe("listo");
    expect(abierto.itemsConfirmados.every((i) => i.estadoItem === "listo")).toBe(true);

    const cobrado = construirVistaPedidoLocal({ ...pedidoBase, estado: "cobrado" }, mesasCache);
    expect(cobrado.pedido.estado).toBe("cobrado");
  });

  it("un pedido local no tiene número corto todavía (lo asigna el servidor al sincronizar) -> 0", () => {
    const { pedido } = construirVistaPedidoLocal(pedidoBase, mesasCache);
    expect(pedido.numeroCorto).toBe(0);
  });

  it("conserva nombres, notas y modificadores de cada ítem", () => {
    const { itemsConfirmados } = construirVistaPedidoLocal(pedidoBase, mesasCache);
    expect(itemsConfirmados[0]?.productoNombre).toBe("Super Criollita");
    expect(itemsConfirmados[0]?.modificadores).toEqual([{ nombre: "Extra queso", precioDeltaCop: 200000 }]);
    expect(itemsConfirmados[1]?.notas).toBe("sin hielo");
  });
});
