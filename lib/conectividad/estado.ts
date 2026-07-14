/**
 * Estado de conectividad a Supabase, en memoria del proceso Node (un único
 * servidor por sede — CLAUDE.md, decisión confirmada). Usa histéresis para
 * no parpadear entre en_linea/offline ante un solo fallo aislado.
 *
 * Se guarda en `globalThis` (no como variables de módulo top-level):
 * Next.js empaqueta cada ruta/entry point (instrumentation.ts, route
 * handlers, Server Actions) en grafos de módulos separados, así que un
 * singleton "normal" a nivel de módulo termina duplicado — cada bundle ve
 * su propia copia. `globalThis` es el único punto realmente compartido
 * dentro del mismo proceso Node (mismo patrón ya usado para el singleton
 * del cliente de Prisma en proyectos Next.js).
 */
export type EstadoConectividad = "en_linea" | "offline";

const FALLOS_PARA_DECLARAR_OFFLINE = 2;
const EXITOS_PARA_DECLARAR_EN_LINEA = 1;

type EstadoGlobal = {
  actual: EstadoConectividad;
  fallosConsecutivos: number;
  exitosConsecutivos: number;
};

const KEY = Symbol.for("criollitas.conectividad.estado");

function obtenerEstadoGlobal(): EstadoGlobal {
  const global = globalThis as unknown as Record<symbol, EstadoGlobal>;
  if (!global[KEY]) {
    global[KEY] = { actual: "en_linea", fallosConsecutivos: 0, exitosConsecutivos: 0 };
  }
  return global[KEY];
}

export function obtenerEstadoConectividad(): EstadoConectividad {
  return obtenerEstadoGlobal().actual;
}

/** Reporta un intento fallido de alcanzar Supabase por motivo de red. */
export function reportarFalloDeRed(): EstadoConectividad {
  const estado = obtenerEstadoGlobal();
  estado.fallosConsecutivos += 1;
  estado.exitosConsecutivos = 0;
  if (estado.fallosConsecutivos >= FALLOS_PARA_DECLARAR_OFFLINE) {
    estado.actual = "offline";
  }
  return estado.actual;
}

/** Reporta un intento exitoso de alcanzar Supabase. */
export function reportarExito(): EstadoConectividad {
  const estado = obtenerEstadoGlobal();
  estado.exitosConsecutivos += 1;
  estado.fallosConsecutivos = 0;
  if (estado.exitosConsecutivos >= EXITOS_PARA_DECLARAR_EN_LINEA) {
    estado.actual = "en_linea";
  }
  return estado.actual;
}

/** Solo para tests: reinicia el singleton a su estado inicial. */
export function _resetParaTests(): void {
  const global = globalThis as unknown as Record<symbol, EstadoGlobal>;
  global[KEY] = { actual: "en_linea", fallosConsecutivos: 0, exitosConsecutivos: 0 };
}
