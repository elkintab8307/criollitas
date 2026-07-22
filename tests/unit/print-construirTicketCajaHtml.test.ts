import { describe, expect, it } from "vitest";
import { construirTicketAperturaCajonHtml, construirTicketArqueoHtml } from "@/lib/print/construirTicketCajaHtml";
import type { DatosAperturaCajon, DatosArqueo } from "@/lib/print/contenidoCaja";

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
  efectivoInicialCop: 10000000n,
  esperadoCop: 15000000n,
  efectivoDeclaradoCop: 14800000n,
  diferenciaCop: -200000n,
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
});
