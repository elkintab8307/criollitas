export type EstadoPedido =
  | "abierto"
  | "enviado_cocina"
  | "en_preparacion"
  | "listo"
  | "entregado"
  | "cobrado"
  | "cerrado"
  | "anulado"
  | "cancelado";
export type EstadoItemPedido = "pendiente" | "en_preparacion" | "listo" | "entregado";
export type CanalPedido = "mesa" | "domicilio" | "llevar";

export interface PedidoVista {
  id: string;
  numeroCorto: number;
  canal: CanalPedido;
  estado: EstadoPedido;
  mesaNumero: number | null;
  clienteNombre: string | null;
  subtotalCop: number;
  totalCop: number;
}

export interface ModificadorConfirmadoVista {
  nombre: string;
  precioDeltaCop: number;
}

export interface ItemConfirmadoVista {
  id: string;
  productoNombre: string;
  cantidad: number;
  precioUnitCop: number;
  subtotalCop: number;
  notas: string | null;
  estadoItem: EstadoItemPedido;
  modificadores: ModificadorConfirmadoVista[];
}
