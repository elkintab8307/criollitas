/** Filas serializables leídas desde Supabase; sin `bigint` (se convierte en el borde de UI). */

export interface CategoriaFila {
  id: string;
  nombre: string;
  orden: number;
  activa: boolean;
}

export interface ProductoFila {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio_cop: number;
  imagen_url: string | null;
  activo: boolean;
  categoria_id: string;
  tiempo_prep_min: number | null;
}

export interface ModificadorFila {
  id: string;
  producto_id: string;
  grupo: string | null;
  nombre: string;
  precio_delta_cop: number;
  obligatorio: boolean;
  max_seleccion: number;
  activo: boolean;
}
