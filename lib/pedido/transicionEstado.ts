/** Decide si `confirmarItemsPedido` debe mover el pedido de `abierto` a
 *  `enviado_cocina` al agregar ítems. Pura y sin dependencia de Supabase para
 *  poder probarla con TDD (CLAUDE.md §4.1): la acción solo le pasa el estado
 *  ya leído de la base de datos y escribe lo que esta función devuelva.
 *  Cualquier otro estado (`enviado_cocina`, `en_preparacion`, `listo`,
 *  `entregado`) significa que el pedido ya fue a cocina antes y solo se le
 *  están agregando ítems nuevos: no se toca `estado`. */
export function siguienteEstadoTrasEnvio(estadoActual: string): "enviado_cocina" | null {
  return estadoActual === "abierto" ? "enviado_cocina" : null;
}
