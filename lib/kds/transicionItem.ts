export type EstadoItemAccionable = "pendiente" | "en_preparacion" | "listo";

/** Determina a qué estado pasa un ítem cuando cocina lo toca, según su
 *  estado actual (CLAUDE.md §4.1: transición de estado, lógica de negocio).
 *  `listo` se destoca a `en_preparacion` en vez de avanzar más allá —
 *  `entregado` está fuera de alcance del Bloque 6: ningún toque de KDS lo
 *  produce, así que esta función nunca lo recibe ni lo devuelve. */
export function siguienteEstadoItem(actual: EstadoItemAccionable): EstadoItemAccionable {
  if (actual === "pendiente") return "en_preparacion";
  if (actual === "en_preparacion") return "listo";
  return "en_preparacion";
}
