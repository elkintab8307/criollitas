import { describe, expect, it } from "vitest";
import { fusionarColaCobro } from "@/lib/offline/colaCobroLocal";
import type { PedidoLocal } from "@/lib/offline/db";
import type { PedidoColaVista } from "@/components/caja/tipos";

const servidor: PedidoColaVista[] = [
  {
    id: "srv-1",
    numeroCorto: 7,
    canal: "mesa",
    estado: "listo",
    mesaNumero: 2,
    clienteNombre: null,
    totalCop: 1500000,
  },
];

function pedidoLocal(id: string, estado: PedidoLocal["estado"]): PedidoLocal {
  return {
    pedidoId: id,
    origen: { canal: "mesa", mesaId: "m-401" },
    items: [
      { productoId: "p1", nombre: "Gaseosa", cantidad: 2, precioUnitCop: 400000, modificadores: [], nota: null },
    ],
    estado,
    sedeId: "s1",
    vendedoraId: "v1",
    creadoEn: "2026-07-16T12:00:00.000Z",
  };
}

const mesas = [{ id: "m-401", numero: 4 }];

describe("fusionarColaCobro", () => {
  it("agrega los pedidos locales abiertos a la cola con total calculado y número 0", () => {
    const cola = fusionarColaCobro(servidor, [pedidoLocal("loc-1", "abierto")], mesas);
    expect(cola).toHaveLength(2);
    const local = cola.find((p) => p.id === "loc-1")!;
    expect(local.numeroCorto).toBe(0);
    expect(local.totalCop).toBe(800000);
    expect(local.mesaNumero).toBe(4);
    expect(local.estado).toBe("listo");
  });

  it("excluye los pedidos locales ya cobrados", () => {
    const cola = fusionarColaCobro(servidor, [pedidoLocal("loc-1", "cobrado")], mesas);
    expect(cola).toHaveLength(1);
    expect(cola[0]?.id).toBe("srv-1");
  });

  it("si el mismo id está en el servidor y en la copia local, gana el servidor (sin duplicados)", () => {
    const cola = fusionarColaCobro(servidor, [pedidoLocal("srv-1", "abierto")], mesas);
    expect(cola).toHaveLength(1);
    expect(cola[0]?.numeroCorto).toBe(7);
  });

  it("sin pedidos locales devuelve la lista del servidor tal cual", () => {
    expect(fusionarColaCobro(servidor, [], mesas)).toEqual(servidor);
  });
});
