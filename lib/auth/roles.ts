export type Rol = "admin" | "cajera" | "vendedora" | "cocina";

const ROLES_VALIDOS: readonly string[] = ["admin", "cajera", "vendedora", "cocina"];

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
  { prefijo: "/anular", roles: ["admin"] },
  { prefijo: "/pedidos", roles: ["cajera"] },
  { prefijo: "/pedidos-en-curso", roles: ["cajera"] },
  { prefijo: "/cobrar", roles: ["cajera"] },
  { prefijo: "/turno", roles: ["cajera"] },
  { prefijo: "/mi-turno", roles: ["cajera"] },
  { prefijo: "/inicio", roles: ["vendedora"] },
  { prefijo: "/pedido", roles: ["vendedora"] },
  { prefijo: "/mis-pedidos", roles: ["vendedora"] },
  { prefijo: "/mesas", roles: ["admin"] },
  { prefijo: "/kds", roles: ["cocina", "admin"] },
];

/**
 * Normaliza el claim `rol` crudo de `app_metadata` (JWT) a un `Rol` válido
 * del dominio, o `null` si no lo es. Cualquier valor que no sea exactamente
 * uno de los roles conocidos (typo, rol legado, no-string, ausente) se trata
 * como sesión sin rol en vez de dejarlo llegar a `resolverAccesoRuta`.
 */
export function normalizarRol(rolCrudo: unknown): Rol | null {
  return typeof rolCrudo === "string" && ROLES_VALIDOS.includes(rolCrudo)
    ? (rolCrudo as Rol)
    : null;
}

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

/** Resultado de evaluar si una sesión autenticada puede seguir hacia una ruta. */
export type DecisionAcceso =
  | { tipo: "permitido" }
  | { tipo: "redirigir"; destino: string };

/**
 * Decide si una sesión autenticada y con PIN validado puede acceder a una
 * ruta ya sabida no-pública, y a dónde redirigir si no.
 *
 * - Ruta sin regla de prefijo: permitido para cualquier rol, incluso sin rol
 *   (comportamiento sin cambios — no está restringida por rol).
 * - Ruta con regla de prefijo y rol desconocido/nulo (sesión rota, sin claim
 *   de rol en el JWT): redirige a `/login`. No hay `rutaPorRol` a dónde
 *   mandarla, y dejarla pasar sería abierto-por-defecto.
 * - Ruta con regla de prefijo y rol conocido no incluido en la regla:
 *   redirige a `rutaPorRol(rol)`.
 * - Ruta con regla de prefijo y rol conocido incluido en la regla: permitido.
 */
export function resolverAccesoRuta(rol: Rol | null, pathname: string): DecisionAcceso {
  const regla = reglaDePrefijo(pathname);
  if (!regla) return { tipo: "permitido" };
  if (!rol) return { tipo: "redirigir", destino: "/login" };
  if (!regla.roles.includes(rol)) return { tipo: "redirigir", destino: rutaPorRol(rol) };
  return { tipo: "permitido" };
}
