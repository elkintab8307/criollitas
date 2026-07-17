import { describe, expect, it } from "vitest";
import { construirTicketHtml } from "@/lib/print/construirTicketHtml";
import type { DatosTicket } from "@/lib/escpos/contenido";

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

describe("construirTicketHtml", () => {
  it("incluye el nombre de la marca y la sede", () => {
    const html = construirTicketHtml(datosBase);
    expect(html).toContain("Criollitas - Arepas Rellenas");
    expect(html).toContain("Criollitas Armenia");
  });

  it("incluye el número de pedido y el origen", () => {
    const html = construirTicketHtml(datosBase);
    expect(html).toContain("Pedido #42");
    expect(html).toContain("Mesa 3");
  });

  it("incluye cada ítem con cantidad, nombre y subtotal formateado", () => {
    const html = construirTicketHtml(datosBase);
    expect(html).toContain("2x Arepa de Chicharrón");
    expect(html).toContain("1x Jugo de Mora");
    expect(html).toContain("$ 30.000");
    expect(html).toContain("$ 7.000");
  });

  it("incluye el total formateado", () => {
    const html = construirTicketHtml(datosBase);
    expect(html).toContain("TOTAL");
    expect(html).toContain("$ 37.000");
  });

  it("incluye cada método de pago con su monto", () => {
    const html = construirTicketHtml({
      ...datosBase,
      pagos: [
        { metodo: "efectivo", montoCop: 2000000n },
        { metodo: "nequi", montoCop: 1700000n },
      ],
    });
    expect(html).toContain("Efectivo");
    expect(html).toContain("$ 20.000");
    expect(html).toContain("Nequi");
    expect(html).toContain("$ 17.000");
  });

  it("numeroCorto 0 (pedido cobrado offline) -> línea alternativa sin #0", () => {
    const html = construirTicketHtml({ ...datosBase, numeroCorto: 0 });
    // "Pedido #0" y no "#0" a secas: los colores del CSS embebido (#000)
    // contienen "#0" y daban falso positivo.
    expect(html).not.toContain("Pedido #0");
    expect(html).toContain("Pedido (por sincronizar)");
  });

  it("escapa nombres de producto con caracteres HTML especiales", () => {
    const html = construirTicketHtml({
      ...datosBase,
      items: [{ cantidad: 1, nombre: '<script>alert("x")</script> & Cía', subtotalCop: 100000n }],
    });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp; Cía");
  });

  it("incluye reglas @page para papel de 80mm", () => {
    const html = construirTicketHtml(datosBase);
    expect(html).toContain("@page");
    expect(html).toContain("80mm");
  });
});
