"use client";

import { useEffect } from "react";
import { registrarManejador } from "@/lib/offline/sync";
import { confirmarItemsPedido, crearPedidoConItems, type OrigenPedido } from "@/app/(vendedora)/pedido/actions";
import type { EnviarPedidoInput } from "@/lib/validations/pedido";

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
  }, []);

  return null;
}
