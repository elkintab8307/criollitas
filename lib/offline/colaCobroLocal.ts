import { construirVistaPedidoLocal, type MesaCacheada } from "@/lib/offline/pedidoLocalVista";
import type { PedidoLocal } from "@/lib/offline/db";
import type { PedidoColaVista } from "@/components/caja/tipos";

/** Fusiona la cola de cobro del servidor con las copias locales de
 *  pedidos (Bloque J3f): los locales aún no cobrados se agregan al final
 *  con su total recalculado y número 0 (el servidor lo asigna al
 *  sincronizar); los ya cobrados localmente se excluyen; ante el mismo id
 *  en ambas listas gana el servidor (la copia local es solo un respaldo
 *  para operar sin conexión, nunca la fuente de verdad estando online).
 *  Núcleo puro, testeado. */
export function fusionarColaCobro(
  servidor: PedidoColaVista[],
  locales: PedidoLocal[],
  mesasCache: MesaCacheada[],
): PedidoColaVista[] {
  const idsServidor = new Set(servidor.map((p) => p.id));
  const localesVisibles = locales.filter((p) => p.estado !== "cobrado" && !idsServidor.has(p.pedidoId));
  const vistasLocales: PedidoColaVista[] = localesVisibles.map((pedidoLocal) => {
    const { pedido } = construirVistaPedidoLocal(pedidoLocal, mesasCache);
    return {
      id: pedido.id,
      numeroCorto: pedido.numeroCorto,
      canal: pedido.canal,
      estado: "listo",
      mesaNumero: pedido.mesaNumero,
      clienteNombre: pedido.clienteNombre,
      totalCop: pedido.totalCop,
    };
  });
  return [...servidor, ...vistasLocales];
}
