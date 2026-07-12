export type EstadoMesa = "libre" | "ocupada" | "reservada";

interface MetaEstado {
  etiqueta: string;
  claseFondo: string;
  claseTexto: string;
}

// Los fondos son colores sólidos (no washes translúcidos) porque MesaTile no
// tiene una superficie clara propia debajo: un bg-*/alpha aquí compositaría
// directo contra el fondo chocolate de la página y el texto oscuro quedaría
// casi ilegible (~1.5:1). Los tonos -2/-3 ya son claros por diseño y dan
// contraste AA holgado contra text-brand-chocolate. Ver informe de contraste
// en .superpowers/sdd/b4-task-4-report.md.
const META: Record<EstadoMesa, MetaEstado> = {
  libre: { etiqueta: "Libre", claseFondo: "bg-brand-verde-2", claseTexto: "text-brand-chocolate" },
  ocupada: { etiqueta: "Ocupada", claseFondo: "bg-brand-mostaza-2", claseTexto: "text-brand-chocolate" },
  reservada: { etiqueta: "Reservada", claseFondo: "bg-brand-tomate-3", claseTexto: "text-brand-chocolate" },
};

export function metaEstadoMesa(estado: EstadoMesa): MetaEstado {
  return META[estado] ?? META.libre;
}
