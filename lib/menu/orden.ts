export function moverCategoria(
  ordenActual: readonly string[],
  id: string,
  direccion: "arriba" | "abajo",
): string[] {
  const orden = [...ordenActual];
  const desde = orden.indexOf(id);
  const hasta = direccion === "arriba" ? desde - 1 : desde + 1;
  if (desde === -1 || hasta < 0 || hasta >= orden.length) return orden;
  const [item] = orden.splice(desde, 1);
  orden.splice(hasta, 0, item!);
  return orden;
}
