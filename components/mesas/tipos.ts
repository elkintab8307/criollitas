import type { EstadoMesa } from "@/lib/mesas/estado";

/** Fila de mesa tal como la consume la UI (grilla y editor). */
export type MesaVista = {
  id: string;
  numero: number;
  nombre: string;
  capacidad: number;
  estado: EstadoMesa;
  activa: boolean;
};
