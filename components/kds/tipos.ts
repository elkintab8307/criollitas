export type EstadoItemKDS = "pendiente" | "en_preparacion" | "listo" | "entregado";
export type EstadoPedidoKDS = "enviado_cocina" | "en_preparacion" | "listo";
export type CanalPedidoKDS = "mesa" | "domicilio" | "llevar";

export interface ModificadorItemVista {
  nombre: string;
}

export interface ItemKDSVista {
  id: string;
  productoNombre: string;
  cantidad: number;
  notas: string | null;
  estadoItem: EstadoItemKDS;
  modificadores: ModificadorItemVista[];
}

export interface PedidoKDSVista {
  id: string;
  numeroCorto: number;
  canal: CanalPedidoKDS;
  estado: EstadoPedidoKDS;
  mesaNumero: number | null;
  clienteNombre: string | null;
  /** ISO timestamp. Nunca null en la vista — page.tsx y TableroKDS filtran
   *  cualquier pedido sin enviado_cocina_en fijado (no debería ocurrir: la
   *  RLS de cocina ya exige estado in (enviado_cocina, en_preparacion,
   *  listo), y el RPC de la Task 1 siempre fija esta columna en la primera
   *  transición a esos estados). */
  enviadoCocinaEn: string;
  items: ItemKDSVista[];
}
