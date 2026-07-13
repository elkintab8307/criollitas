export type ColorSemaforo = "verde" | "amarillo" | "rojo";

/** Semáforo de tiempo del KDS (CLAUDE.md §2.5): verde <5min, amarillo
 *  5-10min, rojo >10min desde que el pedido llegó a cocina por primera vez
 *  (pedidos.enviado_cocina_en), no desde que se creó. */
export function calcularColorSemaforo(enviadoCocinaEn: Date, ahora: Date): ColorSemaforo {
  const minutos = (ahora.getTime() - enviadoCocinaEn.getTime()) / 60_000;
  if (minutos < 5) return "verde";
  if (minutos < 10) return "amarillo";
  return "rojo";
}
