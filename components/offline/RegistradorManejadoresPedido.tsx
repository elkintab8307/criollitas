"use client";

import { useEffect } from "react";
import { registrarManejador } from "@/lib/offline/sync";
import {
  cancelarPedido,
  confirmarItemsPedido,
  crearPedidoConItems,
  type OrigenPedido,
} from "@/app/(vendedora)/pedido/actions";
import { sincronizarCobroOffline } from "@/app/(cajera)/cobrar/actions";
import { eliminarPedidoLocal } from "@/lib/offline/pedidosLocales";
import type { EnviarPedidoInput } from "@/lib/validations/pedido";
import type { CobrarPedidoInput } from "@/lib/validations/cobro";

/** Registra en el motor de sincronización (Bloque J3a) cómo reproducir
 *  contra Supabase cada operación de pedido encolada offline. A
 *  diferencia de los manejadores de turno (Bloque J3b), que insertan
 *  directo porque no hay cálculo de negocio que proteger, este llama a
 *  la Server Action real (`crearPedidoConItems`) -- la sincronización
 *  corre ya reconectado, así que la misma lógica de recálculo de
 *  precios en el servidor que protege el camino online aplica igual
 *  aquí, sin duplicarla. Sin test unitario (efectos de navegador/
 *  Server Action). */
export function RegistradorManejadoresPedido() {
  useEffect(() => {
    registrarManejador("crear_pedido_con_items", async (payload) => {
      const resultado = await crearPedidoConItems(
        payload.origen as OrigenPedido,
        { items: payload.items as EnviarPedidoInput["items"] },
        payload.pedidoId as string,
      );
      if (!resultado.ok) return { ok: false, mensaje: resultado.error.mensaje };
      return { ok: true };
    });

    // Ítems agregados a un pedido local ya creado (Bloque J3e). La cola es
    // FIFO (lib/offline/cola.ts ordena por creadaEn), así que el
    // crear_pedido_con_items del mismo pedido siempre corre antes que esto.
    registrarManejador("agregar_items_pedido", async (payload) => {
      const resultado = await confirmarItemsPedido(payload.pedidoId as string, {
        items: payload.items as EnviarPedidoInput["items"],
      });
      if (!resultado.ok) return { ok: false, mensaje: resultado.error.mensaje };
      return { ok: true };
    });

    // Cobro hecho offline (Bloque J3f). Tras registrarlo en el servidor,
    // la copia local del pedido ya no aporta nada: se elimina para que no
    // reaparezca como fantasma en la cola de cobro offline.
    registrarManejador("cobrar_pedido", async (payload) => {
      const resultado = await sincronizarCobroOffline(
        payload.pedidoId as string,
        { pagos: payload.pagos as CobrarPedidoInput["pagos"] },
        {
          html: payload.contenidoHtml as string,
          exito: payload.impresionExito as boolean,
          error: (payload.impresionError as string | null) ?? null,
        },
      );
      if (!resultado.ok) return { ok: false, mensaje: resultado.error.mensaje };
      await eliminarPedidoLocal(payload.pedidoId as string);
      return { ok: true };
    });

    // Cancelación hecha sin conexión (mesa, domicilio o para llevar, Bloque
    // B/C) -- mismo RPC que el camino online (cancelarPedido acepta tanto
    // vendedora como cajera, y el propio RPC decide si es dueña del pedido
    // o cajera de la sede cancelando uno ajeno). Igual que cobrar_pedido,
    // la copia local ya no aporta nada tras sincronizar.
    registrarManejador("cancelar_pedido", async (payload) => {
      const resultado = await cancelarPedido(payload.pedidoId as string, { motivo: payload.motivo as string });
      if (!resultado.ok) return { ok: false, mensaje: resultado.error.mensaje };
      await eliminarPedidoLocal(payload.pedidoId as string);
      return { ok: true };
    });
  }, []);

  return null;
}
