import { describe, expect, it } from "vitest";
import {
  construirTicketAperturaCajonHtml,
  construirTicketArqueoHtml,
  construirTicketMovimientoHtml,
} from "@/lib/print/construirTicketCajaHtml";
import type { DatosAperturaCajon, DatosArqueo, DatosMovimiento } from "@/lib/print/contenidoCaja";

const datosApertura: DatosAperturaCajon = {
  sedeNombre: "Criollitas Armenia",
  cajeraNombre: "María Pérez",
  fecha: new Date("2026-07-21T18:30:00.000Z"),
};

describe("construirTicketAperturaCajonHtml", () => {
  it("incluye la marca, la sede y la cajera", () => {
    const html = construirTicketAperturaCajonHtml(datosApertura);
    expect(html).toContain("Criollitas - Arepas Rellenas");
    expect(html).toContain("Criollitas Armenia");
    expect(html).toContain("María Pérez");
  });

  it("indica que es una apertura de caja para conteo, no un cobro", () => {
    const html = construirTicketAperturaCajonHtml(datosApertura);
    expect(html).toContain("Apertura de caja");
  });

  it("usa el mismo ancho imprimible que la tirilla de cobro", () => {
    const html = construirTicketAperturaCajonHtml(datosApertura);
    expect(html).toContain("72mm");
  });
});

const datosArqueoBase: DatosArqueo = {
  sedeNombre: "Criollitas Armenia",
  cajeraNombre: "María Pérez",
  fecha: new Date("2026-07-21T23:10:00.000Z"),
  abiertoEn: new Date("2026-07-21T13:05:00.000Z"),
  efectivoInicialCop: 10000000n,
  ventasEfectivoCop: 5500000n,
  ventasOtroMedioCop: 2000000n,
  desglosePagosOtroMedio: [
    { metodo: "nequi", montoCop: 1500000n },
    { metodo: "datafono", montoCop: 500000n },
  ],
  salidasCop: 800000n,
  entradasExtraCop: 300000n,
  esperadoCop: 15000000n,
  efectivoDeclaradoCop: 14800000n,
  diferenciaCop: -200000n,
  productosVendidos: [
    { nombre: "Arepa de Choclo", cantidad: 5, totalCop: 4000000n },
    { nombre: "Gaseosa", cantidad: 3, totalCop: 900000n },
  ],
  movimientos: [
    { tipo: "gasto", concepto: "Compra de bolsas", montoCop: 500000n },
    { tipo: "retiro", concepto: "Retiro para banco", montoCop: 300000n },
    { tipo: "ingreso_extra", concepto: "Vuelto de caja menor", montoCop: 300000n },
  ],
};

describe("construirTicketArqueoHtml", () => {
  it("incluye la marca, la sede y la cajera", () => {
    const html = construirTicketArqueoHtml(datosArqueoBase);
    expect(html).toContain("Criollitas - Arepas Rellenas");
    expect(html).toContain("Criollitas Armenia");
    expect(html).toContain("María Pérez");
  });

  it("incluye el efectivo inicial, el esperado y el declarado", () => {
    const html = construirTicketArqueoHtml(datosArqueoBase);
    expect(html).toContain("$ 100.000");
    expect(html).toContain("$ 150.000");
    expect(html).toContain("$ 148.000");
  });

  it("desglosa ventas, salidas y entradas extra antes del total en caja", () => {
    const html = construirTicketArqueoHtml(datosArqueoBase);
    expect(html).toContain("$ 55.000");
    expect(html).toContain("$ 8.000");
    expect(html).toContain("$ 3.000");
    expect(html).toContain("Total en caja");
    const posApertura = html.indexOf("Dinero con que se abrió");
    const posVentas = html.indexOf("Ventas");
    const posSalidas = html.indexOf("Salidas");
    const posEntradas = html.indexOf("Entradas extra");
    const posTotal = html.indexOf("Total en caja");
    expect(posApertura).toBeGreaterThan(-1);
    expect(posVentas).toBeGreaterThan(posApertura);
    expect(posSalidas).toBeGreaterThan(posVentas);
    expect(posEntradas).toBeGreaterThan(posSalidas);
    expect(posTotal).toBeGreaterThan(posEntradas);
  });

  it("muestra las ventas por otro medio de pago aparte, sin sumarlas al cuadre de efectivo", () => {
    const html = construirTicketArqueoHtml(datosArqueoBase);
    expect(html).toContain("$ 20.000");
    expect(html).toContain("Total por otro medio");
    // El total en caja (solo efectivo) debe seguir siendo $150.000, no
    // $170.000 -- los pagos virtuales nunca entran al cuadre físico.
    const posOtroMedio = html.indexOf("Total por otro medio");
    const posTotal = html.indexOf("Total en caja");
    expect(posOtroMedio).toBeGreaterThan(-1);
    expect(posTotal).toBeGreaterThan(-1);
  });

  it("muestra la diferencia negativa (faltante) con signo", () => {
    const html = construirTicketArqueoHtml(datosArqueoBase);
    expect(html).toContain("-$ 2.000");
    expect(html).toContain("Falta");
  });

  it("muestra la diferencia positiva (sobrante) con etiqueta distinta", () => {
    const html = construirTicketArqueoHtml({
      ...datosArqueoBase,
      efectivoDeclaradoCop: 15200000n,
      diferenciaCop: 200000n,
    });
    expect(html).toContain("$ 2.000");
    expect(html).toContain("Sobra");
  });

  it("muestra 'Exacto' cuando la diferencia es cero", () => {
    const html = construirTicketArqueoHtml({
      ...datosArqueoBase,
      efectivoDeclaradoCop: 15000000n,
      diferenciaCop: 0n,
    });
    expect(html).toContain("Exacto");
  });

  it("usa el mismo ancho imprimible que la tirilla de cobro", () => {
    const html = construirTicketArqueoHtml(datosArqueoBase);
    expect(html).toContain("72mm");
  });

  it("muestra la hora de apertura y de cierre del turno, en ese orden", () => {
    const html = construirTicketArqueoHtml(datosArqueoBase);
    expect(html).toContain("Apertura: 21 de julio de 2026, 8:05 AM");
    expect(html).toContain("Cierre: 21 de julio de 2026, 6:10 PM");
    const posApertura = html.indexOf("Apertura:");
    const posCierre = html.indexOf("Cierre:");
    expect(posApertura).toBeGreaterThan(-1);
    expect(posCierre).toBeGreaterThan(posApertura);
  });

  it("desglosa las ventas por otro medio de pago, método por método", () => {
    const html = construirTicketArqueoHtml(datosArqueoBase);
    expect(html).toContain("Nequi");
    expect(html).toContain("$ 15.000");
    expect(html).toContain("Datáfono");
    expect(html).toContain("$ 5.000");
  });

  it("lista los productos vendidos en el turno con cantidad y valor total", () => {
    const html = construirTicketArqueoHtml(datosArqueoBase);
    expect(html).toContain("Productos vendidos");
    expect(html).toContain("Arepa de Choclo");
    expect(html).toContain("5");
    expect(html).toContain("$ 40.000");
    expect(html).toContain("Gaseosa");
    expect(html).toContain("$ 9.000");
  });

  it("lista los movimientos de caja del turno con su concepto", () => {
    const html = construirTicketArqueoHtml(datosArqueoBase);
    expect(html).toContain("Movimientos de caja");
    expect(html).toContain("Compra de bolsas");
    expect(html).toContain("Retiro para banco");
    expect(html).toContain("Vuelto de caja menor");
  });

  it("no revienta con productos vendidos o movimientos vacíos", () => {
    const html = construirTicketArqueoHtml({ ...datosArqueoBase, productosVendidos: [], movimientos: [] });
    expect(html).toContain("Total en caja");
  });

  it("escapa nombres de producto y conceptos de movimiento con caracteres HTML especiales", () => {
    const html = construirTicketArqueoHtml({
      ...datosArqueoBase,
      productosVendidos: [{ nombre: '<script>alert("x")</script>', cantidad: 1, totalCop: 100000n }],
      movimientos: [{ tipo: "gasto", concepto: "<b>hack</b> & Cía", montoCop: 100000n }],
    });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp; Cía");
  });
});

const datosMovimientoBase: DatosMovimiento = {
  sedeNombre: "Criollitas Armenia",
  cajeraNombre: "María Pérez",
  fecha: new Date("2026-07-22T15:00:00.000Z"),
  tipo: "gasto",
  concepto: "Compra de bolsas",
  montoCop: 1500000n,
};

describe("construirTicketMovimientoHtml", () => {
  it("incluye la marca, la sede y la cajera", () => {
    const html = construirTicketMovimientoHtml(datosMovimientoBase);
    expect(html).toContain("Criollitas - Arepas Rellenas");
    expect(html).toContain("Criollitas Armenia");
    expect(html).toContain("María Pérez");
  });

  it("incluye el tipo, el concepto y el monto", () => {
    const html = construirTicketMovimientoHtml(datosMovimientoBase);
    expect(html).toContain("Gasto");
    expect(html).toContain("Compra de bolsas");
    expect(html).toContain("$ 15.000");
  });

  it("etiqueta un retiro como tal", () => {
    const html = construirTicketMovimientoHtml({ ...datosMovimientoBase, tipo: "retiro" });
    expect(html).toContain("Retiro");
  });

  it("etiqueta un ingreso extra como tal", () => {
    const html = construirTicketMovimientoHtml({ ...datosMovimientoBase, tipo: "ingreso_extra" });
    expect(html).toContain("Ingreso extra");
  });

  it("escapa el concepto con caracteres HTML especiales", () => {
    const html = construirTicketMovimientoHtml({
      ...datosMovimientoBase,
      concepto: '<script>alert("x")</script> & Cía',
    });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp; Cía");
  });

  it("usa el mismo ancho imprimible que la tirilla de cobro", () => {
    const html = construirTicketMovimientoHtml(datosMovimientoBase);
    expect(html).toContain("72mm");
  });
});
