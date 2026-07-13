export type CanalPedidoCaja = "mesa" | "domicilio" | "llevar";
export type EstadoPedidoCaja = "listo" | "entregado";

export interface PedidoColaVista {
  id: string;
  numeroCorto: number;
  canal: CanalPedidoCaja;
  estado: EstadoPedidoCaja;
  mesaNumero: number | null;
  clienteNombre: string | null;
  totalCop: number;
}
