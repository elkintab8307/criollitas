export type Rol = "admin" | "cajera" | "vendedora" | "cocina";

export const RUTA_BASE_POR_ROL: Record<Rol, string> = {
  admin: "/dashboard",
  cajera: "/pedidos",
  vendedora: "/inicio",
  cocina: "/kds",
};

export function rutaPorRol(rol: Rol): string {
  return RUTA_BASE_POR_ROL[rol];
}

export const SEDE_DEFAULT_ID = "00000000-0000-4000-8000-000000000001";
