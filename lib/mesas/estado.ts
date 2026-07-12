export type EstadoMesa = "libre" | "ocupada" | "reservada";

interface MetaEstado {
  etiqueta: string;
  claseFondo: string;
  claseTexto: string;
}

const META: Record<EstadoMesa, MetaEstado> = {
  libre: { etiqueta: "Libre", claseFondo: "bg-brand-verde/25", claseTexto: "text-brand-chocolate" },
  ocupada: { etiqueta: "Ocupada", claseFondo: "bg-brand-mostaza/30", claseTexto: "text-brand-chocolate" },
  reservada: { etiqueta: "Reservada", claseFondo: "bg-brand-tomate/25", claseTexto: "text-brand-chocolate" },
};

export function metaEstadoMesa(estado: EstadoMesa): MetaEstado {
  return META[estado] ?? META.libre;
}
