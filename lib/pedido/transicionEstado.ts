/** Decide si `confirmarItemsPedido` debe llevar el pedido a `enviado_cocina`
 *  al agregar ítems. Pura y sin dependencia de Supabase para poder probarla
 *  con TDD (CLAUDE.md §4.1): la acción solo le pasa el estado ya leído de la
 *  base de datos y escribe lo que esta función devuelva.
 *
 *  `abierto` → `enviado_cocina`: primer envío.
 *  `entregado` → `enviado_cocina`: la política RLS de cocina
 *  (`pedidos_cocina_select`) solo expone `enviado_cocina`/`en_preparacion`/
 *  `listo` — un pedido `entregado` ya no aparece en el KDS, así que si la
 *  vendedora agrega un ítem tardío hay que "reabrirlo" o cocina nunca vería
 *  el ítem nuevo (los ítems ya entregados conservan su `estado_item`, solo
 *  cambia el estado agregado del pedido).
 *  `enviado_cocina`/`en_preparacion`/`listo`: el pedido ya es visible para
 *  cocina bajo esa policy, así que no hace falta tocar `estado`. */
export function siguienteEstadoTrasEnvio(estadoActual: string): "enviado_cocina" | null {
  return estadoActual === "abierto" || estadoActual === "entregado" ? "enviado_cocina" : null;
}
