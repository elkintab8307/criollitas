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

/** Rutas accesibles sin sesión y sin PIN validado. */
export const RUTAS_PUBLICAS = ["/login", "/pin", "/design"];

/** Tabla de prefijos de ruta restringidos a ciertos roles (CLAUDE.md §9). */
export const PREFIJOS_POR_ROL: Array<{ prefijo: string; roles: Rol[] }> = [
  { prefijo: "/dashboard", roles: ["admin"] },
  { prefijo: "/menu", roles: ["admin"] },
  { prefijo: "/usuarios", roles: ["admin"] },
  { prefijo: "/sedes", roles: ["admin"] },
  { prefijo: "/reportes", roles: ["admin"] },
  { prefijo: "/auditoria", roles: ["admin"] },
  { prefijo: "/pedidos", roles: ["cajera"] },
  { prefijo: "/cobrar", roles: ["cajera"] },
  { prefijo: "/turno", roles: ["cajera"] },
  { prefijo: "/mi-turno", roles: ["cajera"] },
  { prefijo: "/inicio", roles: ["vendedora"] },
  { prefijo: "/pedido", roles: ["vendedora"] },
  { prefijo: "/mesas", roles: ["vendedora"] },
  { prefijo: "/kds", roles: ["cocina", "admin"] },
];

function coincidePrefijo(pathname: string, prefijo: string): boolean {
  return pathname === prefijo || pathname.startsWith(`${prefijo}/`);
}

/** True si la ruta es pública (no requiere sesión ni PIN validado). */
export function esRutaPublica(pathname: string): boolean {
  return RUTAS_PUBLICAS.some((publica) => coincidePrefijo(pathname, publica));
}

/** Devuelve la regla de prefijo (si existe) que aplica a esta ruta. */
export function reglaDePrefijo(
  pathname: string,
): { prefijo: string; roles: Rol[] } | undefined {
  return PREFIJOS_POR_ROL.find((regla) => coincidePrefijo(pathname, regla.prefijo));
}

/**
 * True si el rol puede acceder a la ruta. Rutas sin regla de prefijo
 * definida no están restringidas por rol.
 */
export function rutaPermitida(rol: Rol, pathname: string): boolean {
  const regla = reglaDePrefijo(pathname);
  return !regla || regla.roles.includes(rol);
}
