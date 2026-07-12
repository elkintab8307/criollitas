import { describe, expect, it } from "vitest";
import {
  rutaPorRol,
  RUTA_BASE_POR_ROL,
  SEDE_DEFAULT_ID,
  RUTAS_PUBLICAS,
  PREFIJOS_POR_ROL,
  esRutaPublica,
  reglaDePrefijo,
  rutaPermitida,
  resolverAccesoRuta,
  normalizarRol,
  type Rol,
} from "@/lib/auth/roles";

describe("rutaPorRol", () => {
  it("mapea cada rol a su ruta base", () => {
    const roles: Rol[] = ["admin", "cajera", "vendedora", "cocina"];
    for (const rol of roles) {
      expect(rutaPorRol(rol)).toBe(RUTA_BASE_POR_ROL[rol]);
    }
  });

  it("admin va a /dashboard", () => {
    expect(rutaPorRol("admin")).toBe("/dashboard");
  });

  it("cajera va a /pedidos", () => {
    expect(rutaPorRol("cajera")).toBe("/pedidos");
  });

  it("vendedora va a /inicio", () => {
    expect(rutaPorRol("vendedora")).toBe("/inicio");
  });

  it("cocina va a /kds", () => {
    expect(rutaPorRol("cocina")).toBe("/kds");
  });

  it("SEDE_DEFAULT_ID es un UUID de sede fija para el seed", () => {
    expect(SEDE_DEFAULT_ID).toBe("00000000-0000-4000-8000-000000000001");
  });
});

describe("esRutaPublica", () => {
  it("reconoce /login, /pin y /design como públicas", () => {
    for (const ruta of RUTAS_PUBLICAS) {
      expect(esRutaPublica(ruta)).toBe(true);
    }
  });

  it("reconoce subrutas de una ruta pública", () => {
    expect(esRutaPublica("/login/algo")).toBe(true);
    expect(esRutaPublica("/design/botones")).toBe(true);
  });

  it("no marca como pública una ruta privada", () => {
    expect(esRutaPublica("/dashboard")).toBe(false);
    expect(esRutaPublica("/pedidos")).toBe(false);
  });

  it("no confunde un prefijo parcial con la ruta pública", () => {
    expect(esRutaPublica("/logina")).toBe(false);
    expect(esRutaPublica("/pines")).toBe(false);
  });
});

describe("reglaDePrefijo", () => {
  it("encuentra la regla exacta para cada prefijo definido", () => {
    for (const regla of PREFIJOS_POR_ROL) {
      expect(reglaDePrefijo(regla.prefijo)).toEqual(regla);
    }
  });

  it("encuentra la regla para subrutas del prefijo", () => {
    expect(reglaDePrefijo("/dashboard/reportes")).toEqual({
      prefijo: "/dashboard",
      roles: ["admin"],
    });
  });

  it("retorna undefined si la ruta no tiene regla", () => {
    expect(reglaDePrefijo("/design")).toBeUndefined();
    expect(reglaDePrefijo("/login")).toBeUndefined();
  });

  it("no confunde un prefijo parcial con la regla", () => {
    expect(reglaDePrefijo("/pedido-especial")).toBeUndefined();
  });

  it("/kds admite tanto cocina como admin", () => {
    expect(reglaDePrefijo("/kds")).toEqual({ prefijo: "/kds", roles: ["cocina", "admin"] });
  });

  it("no confunde /pedidos (cajera) con /pedido (vendedora): /pedidos/queue cae en la regla de cajera", () => {
    expect(reglaDePrefijo("/pedidos/queue")).toEqual({ prefijo: "/pedidos", roles: ["cajera"] });
  });

  it("no confunde /pedido (vendedora) con /pedidos (cajera): /pedido/123 cae en la regla de vendedora", () => {
    expect(reglaDePrefijo("/pedido/123")).toEqual({ prefijo: "/pedido", roles: ["vendedora"] });
  });
});

describe("rutaPermitida", () => {
  it("permite a admin entrar a rutas de administración", () => {
    expect(rutaPermitida("admin", "/dashboard")).toBe(true);
    expect(rutaPermitida("admin", "/reportes/ventas")).toBe(true);
  });

  it("bloquea a admin en rutas de otro rol", () => {
    expect(rutaPermitida("admin", "/pedidos")).toBe(false);
    expect(rutaPermitida("admin", "/inicio")).toBe(false);
  });

  it("permite a cajera solo sus rutas", () => {
    expect(rutaPermitida("cajera", "/pedidos")).toBe(true);
    expect(rutaPermitida("cajera", "/cobrar/123")).toBe(true);
    expect(rutaPermitida("cajera", "/dashboard")).toBe(false);
  });

  it("permite a vendedora solo sus rutas", () => {
    expect(rutaPermitida("vendedora", "/inicio")).toBe(true);
    expect(rutaPermitida("vendedora", "/pedido/abc")).toBe(true);
    expect(rutaPermitida("vendedora", "/mesas")).toBe(false);
    expect(rutaPermitida("vendedora", "/turno/abrir")).toBe(false);
  });

  it("permite a admin gestionar /mesas (bloque 4: mesas pasa a ser del admin)", () => {
    expect(rutaPermitida("admin", "/mesas")).toBe(true);
    expect(rutaPermitida("cajera", "/mesas")).toBe(false);
  });

  it("permite tanto a cocina como a admin entrar a /kds", () => {
    expect(rutaPermitida("cocina", "/kds")).toBe(true);
    expect(rutaPermitida("admin", "/kds")).toBe(true);
    expect(rutaPermitida("cajera", "/kds")).toBe(false);
  });

  it("permite cualquier rol en rutas sin regla definida (no restringidas por prefijo)", () => {
    expect(rutaPermitida("admin", "/design")).toBe(true);
    expect(rutaPermitida("cajera", "/algo-sin-regla")).toBe(true);
  });

  it("no confunde /pedido y /pedidos entre cajera y vendedora en ninguna dirección", () => {
    expect(rutaPermitida("cajera", "/pedido/123")).toBe(false);
    expect(rutaPermitida("vendedora", "/pedidos/queue")).toBe(false);
    expect(rutaPermitida("cajera", "/pedidos/queue")).toBe(true);
    expect(rutaPermitida("vendedora", "/pedido/123")).toBe(true);
  });
});

describe("resolverAccesoRuta", () => {
  it("permite el acceso cuando el rol conocido está en la regla de la ruta", () => {
    expect(resolverAccesoRuta("admin", "/dashboard")).toEqual({ tipo: "permitido" });
    expect(resolverAccesoRuta("vendedora", "/pedido/123")).toEqual({ tipo: "permitido" });
  });

  it("redirige a la ruta base del rol cuando un rol conocido no está autorizado en la regla", () => {
    expect(resolverAccesoRuta("cajera", "/dashboard")).toEqual({
      tipo: "redirigir",
      destino: "/pedidos",
    });
    expect(resolverAccesoRuta("admin", "/pedidos")).toEqual({
      tipo: "redirigir",
      destino: "/dashboard",
    });
  });

  it("redirige a /login cuando no hay rol (sesión rota) y la ruta tiene regla de prefijo", () => {
    expect(resolverAccesoRuta(null, "/dashboard")).toEqual({ tipo: "redirigir", destino: "/login" });
    expect(resolverAccesoRuta(null, "/pedido/123")).toEqual({ tipo: "redirigir", destino: "/login" });
    expect(resolverAccesoRuta(null, "/kds")).toEqual({ tipo: "redirigir", destino: "/login" });
  });

  it("permite el paso sin rol en rutas sin regla de prefijo (comportamiento sin cambios)", () => {
    expect(resolverAccesoRuta(null, "/design")).toEqual({ tipo: "permitido" });
    expect(resolverAccesoRuta(null, "/algo-sin-regla")).toEqual({ tipo: "permitido" });
  });

  it("distingue /pedido de /pedidos también con rol nulo", () => {
    expect(resolverAccesoRuta(null, "/pedidos/queue")).toEqual({
      tipo: "redirigir",
      destino: "/login",
    });
    expect(resolverAccesoRuta(null, "/pedido/123")).toEqual({
      tipo: "redirigir",
      destino: "/login",
    });
  });
});

describe("normalizarRol", () => {
  it("acepta cada rol válido del dominio", () => {
    const roles: Rol[] = ["admin", "cajera", "vendedora", "cocina"];
    for (const rol of roles) {
      expect(normalizarRol(rol)).toBe(rol);
    }
  });

  it("retorna null para un string que no es un rol del dominio (JWT corrupto o rol legado)", () => {
    expect(normalizarRol("gerente")).toBeNull();
  });

  it("retorna null para undefined, null, string vacío y valores no-string", () => {
    expect(normalizarRol(undefined)).toBeNull();
    expect(normalizarRol(null)).toBeNull();
    expect(normalizarRol("")).toBeNull();
    expect(normalizarRol(42)).toBeNull();
    expect(normalizarRol({})).toBeNull();
  });
});
