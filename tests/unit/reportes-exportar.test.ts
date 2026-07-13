import { describe, expect, it } from "vitest";
import { construirCSV } from "@/lib/reportes/exportar";

describe("construirCSV", () => {
  const columnas = [
    { clave: "dia", encabezado: "Día" },
    { clave: "total", encabezado: "Total" },
  ];

  it("incluye el encabezado con los nombres de columna", () => {
    const csv = construirCSV([], columnas);
    expect(csv).toBe("Día,Total");
  });

  it("incluye cada fila en el orden de las columnas", () => {
    const csv = construirCSV([{ dia: "2026-07-15", total: 50000 }], columnas);
    expect(csv).toBe("Día,Total\n2026-07-15,50000");
  });

  it("escapa valores que contienen comas envolviéndolos en comillas", () => {
    const csv = construirCSV([{ dia: "15 jul, 2026", total: 1000 }], columnas);
    expect(csv).toBe('Día,Total\n"15 jul, 2026",1000');
  });

  it("escapa comillas dobles duplicándolas", () => {
    const csv = construirCSV([{ dia: 'el "mejor" día', total: 1000 }], columnas);
    expect(csv).toBe('Día,Total\n"el ""mejor"" día",1000');
  });

  it("escapa saltos de línea envolviendo en comillas", () => {
    const csv = construirCSV([{ dia: "linea1\nlinea2", total: 1000 }], columnas);
    expect(csv).toBe('Día,Total\n"linea1\nlinea2",1000');
  });

  it("trata null y undefined como celda vacía", () => {
    const csv = construirCSV([{ dia: null, total: undefined }], columnas);
    expect(csv).toBe("Día,Total\n,");
  });
});
