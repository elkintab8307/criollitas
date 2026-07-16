import { describe, expect, it } from "vitest";
import { construirLineasTicket, type DatosTicket } from "@/lib/escpos/contenido";

const datosBase: DatosTicket = {
  sedeNombre: "Criollitas Armenia",
  numeroCorto: 42,
  fecha: new Date("2026-07-14T18:30:00.000Z"),
  origen: "Mesa 3",
  items: [
    { cantidad: 2, nombre: "Arepa de Chicharrón", subtotalCop: 3000000n },
    { cantidad: 1, nombre: "Jugo de Mora", subtotalCop: 700000n },
  ],
  subtotalCop: 3700000n,
  totalCop: 3700000n,
  pagos: [{ metodo: "efectivo", montoCop: 3700000n }],
};

describe("construirLineasTicket", () => {
  it("incluye el nombre de la marca y la sede", () => {
    const lineas = construirLineasTicket(datosBase);
    expect(lineas).toContain("Criollitas - Arepas Rellenas");
    expect(lineas).toContain("Criollitas Armenia");
  });

  it("incluye el número de pedido y el origen", () => {
    const lineas = construirLineasTicket(datosBase);
    expect(lineas.some((l) => l.includes("#42"))).toBe(true);
    expect(lineas).toContain("Mesa 3");
  });

  it("incluye cada ítem con cantidad y nombre", () => {
    const lineas = construirLineasTicket(datosBase);
    expect(lineas.some((l) => l.includes("2x Arepa de Chicharrón"))).toBe(true);
    expect(lineas.some((l) => l.includes("1x Jugo de Mora"))).toBe(true);
  });

  it("incluye el total formateado", () => {
    const lineas = construirLineasTicket(datosBase);
    expect(lineas.some((l) => l.includes("TOTAL") && l.includes("$ 37.000"))).toBe(true);
  });

  it("incluye cada método de pago con su monto", () => {
    const lineas = construirLineasTicket({
      ...datosBase,
      pagos: [
        { metodo: "efectivo", montoCop: 2000000n },
        { metodo: "nequi", montoCop: 1700000n },
      ],
    });
    expect(lineas.some((l) => l.includes("Efectivo") && l.includes("$ 20.000"))).toBe(true);
    expect(lineas.some((l) => l.includes("Nequi") && l.includes("$ 17.000"))).toBe(true);
  });

  it("origen domicilio se muestra tal cual", () => {
    const lineas = construirLineasTicket({ ...datosBase, origen: "Domicilio" });
    expect(lineas).toContain("Domicilio");
  });

  it("numeroCorto 0 (pedido cobrado offline, sin número asignado aún) -> línea alternativa sin #0", () => {
    const lineas = construirLineasTicket({ ...datosBase, numeroCorto: 0 });
    expect(lineas.some((l) => l.includes("#0"))).toBe(false);
    expect(lineas).toContain("Pedido (por sincronizar)");
  });
});
