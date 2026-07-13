import { describe, expect, it } from "vitest";
import { siguienteEstadoItem } from "@/lib/kds/transicionItem";

describe("siguienteEstadoItem", () => {
  it("pendiente pasa a en_preparacion al tocarlo", () => {
    expect(siguienteEstadoItem("pendiente")).toBe("en_preparacion");
  });
  it("en_preparacion pasa a listo al tocarlo", () => {
    expect(siguienteEstadoItem("en_preparacion")).toBe("listo");
  });
  it("listo se destoca a en_preparacion (corrección de error)", () => {
    expect(siguienteEstadoItem("listo")).toBe("en_preparacion");
  });
});
