import { describe, expect, it } from "vitest";
import { decidirRedireccionOffline } from "@/lib/offline/guardiaOffline";
import type { SesionOffline } from "@/lib/offline/sesionOfflineStore";

const sesionCajera: SesionOffline = { usuarioId: "u1", nombre: "Ana", rol: "cajera", sedeId: "s1" };
const sesionAdmin: SesionOffline = { usuarioId: "u2", nombre: "Beto", rol: "admin", sedeId: "s1" };

describe("decidirRedireccionOffline", () => {
  it("ruta pública siempre se queda, con o sin sesión", () => {
    expect(decidirRedireccionOffline("/pin", null)).toEqual({ tipo: "quedarse" });
    expect(decidirRedireccionOffline("/login", sesionCajera)).toEqual({ tipo: "quedarse" });
  });

  it("ruta protegida sin sesión offline -> redirige a /pin", () => {
    expect(decidirRedireccionOffline("/pedidos", null)).toEqual({ tipo: "redirigir", destino: "/pin" });
  });

  it("cajera en su propia ruta -> se queda", () => {
    expect(decidirRedireccionOffline("/pedidos", sesionCajera)).toEqual({ tipo: "quedarse" });
  });

  it("cajera intentando entrar a ruta de admin -> redirige a su ruta base", () => {
    expect(decidirRedireccionOffline("/reportes/ventas", sesionCajera)).toEqual({
      tipo: "redirigir",
      destino: "/pedidos",
    });
  });

  it("admin en su propia ruta -> se queda", () => {
    expect(decidirRedireccionOffline("/reportes/ventas", sesionAdmin)).toEqual({ tipo: "quedarse" });
  });
});
