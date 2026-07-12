import { describe, expect, it } from "vitest";
import { moverCategoria } from "@/lib/menu/orden";

describe("moverCategoria", () => {
  const orden = ["a", "b", "c"];
  it("sube un elemento", () => {
    expect(moverCategoria(orden, "b", "arriba")).toEqual(["b", "a", "c"]);
  });
  it("baja un elemento", () => {
    expect(moverCategoria(orden, "b", "abajo")).toEqual(["a", "c", "b"]);
  });
  it("no mueve en los extremos", () => {
    expect(moverCategoria(orden, "a", "arriba")).toEqual(orden);
    expect(moverCategoria(orden, "c", "abajo")).toEqual(orden);
  });
  it("ignora ids inexistentes", () => {
    expect(moverCategoria(orden, "z", "arriba")).toEqual(orden);
  });
  it("no muta el arreglo original", () => {
    moverCategoria(orden, "b", "arriba");
    expect(orden).toEqual(["a", "b", "c"]);
  });
});
