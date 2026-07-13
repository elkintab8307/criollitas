export type EstadoItemAccionable = "pendiente" | "en_preparacion" | "listo";
export type EstadoAgregadoPedido = "enviado_cocina" | "en_preparacion" | "listo";

/** Documenta y prueba en TypeScript la MISMA regla que implementa el RPC
 *  `actualizar_estado_item_pedido` en SQL (supabase/migrations/20260713100000_kds_base.sql) —
 *  el RPC es la fuente de verdad ejecutada (atómica, evita condiciones de
 *  carrera entre dos toques simultáneos), esta función existe para que la
 *  regla de negocio tenga cobertura de TDD (CLAUDE.md §4.1) y quede
 *  documentada en un solo lugar legible. Si se cambia una, cambiar la otra. */
export function calcularEstadoAgregado(estadosItem: EstadoItemAccionable[]): EstadoAgregadoPedido {
  if (estadosItem.length === 0) return "enviado_cocina";
  if (estadosItem.every((estado) => estado === "listo")) return "listo";
  if (estadosItem.some((estado) => estado === "en_preparacion" || estado === "listo")) {
    return "en_preparacion";
  }
  return "enviado_cocina";
}
