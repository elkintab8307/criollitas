"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ClayCard } from "@/components/ui/ClayCard";
import { formatearCOP } from "@/lib/money";
import { listarPedidosLocales } from "@/lib/offline/pedidosLocales";
import { leerDelCatalogo } from "@/lib/offline/catalogo";
import { fusionarColaCobro } from "@/lib/offline/colaCobroLocal";
import { refrescarPedidosLocales } from "@/lib/offline/catalogoRefresh";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import type { MesaCacheada } from "@/lib/offline/pedidoLocalVista";
import type { PedidoColaVista } from "@/components/caja/tipos";
import type { Database } from "@/lib/supabase/types";

type PedidoFila = Database["public"]["Tables"]["pedidos"]["Row"];

const ESTADOS_VISIBLES = new Set(["listo", "entregado"]);

interface ColaCobroProps {
  pedidosIniciales: PedidoColaVista[];
  sedeId: string;
}

function etiquetaOrigen(pedido: PedidoColaVista): string {
  if (pedido.canal === "mesa") return pedido.mesaNumero ? `Mesa ${pedido.mesaNumero}` : "Mesa";
  if (pedido.canal === "domicilio") return pedido.clienteNombre ?? "Domicilio";
  return pedido.clienteNombre ? `Para llevar — ${pedido.clienteNombre}` : "Para llevar";
}

async function cargarPedidoColaCompleto(
  supabase: ReturnType<typeof createClient>,
  pedidoId: string,
): Promise<PedidoColaVista | null> {
  const { data: pedidoFila } = await supabase
    .from("pedidos")
    .select("id, numero_corto, canal, estado, mesa_id, cliente_id, total_cop")
    .eq("id", pedidoId)
    .single();
  if (!pedidoFila) return null;

  let mesaNumero: number | null = null;
  if (pedidoFila.mesa_id) {
    const { data: mesaFila } = await supabase.from("mesas").select("numero").eq("id", pedidoFila.mesa_id).single();
    mesaNumero = mesaFila?.numero ?? null;
  }
  let clienteNombre: string | null = null;
  if (pedidoFila.cliente_id) {
    const { data: clienteFila } = await supabase
      .from("clientes_domicilio")
      .select("nombre")
      .eq("id", pedidoFila.cliente_id)
      .single();
    clienteNombre = clienteFila?.nombre ?? null;
  }

  return {
    id: pedidoFila.id,
    numeroCorto: pedidoFila.numero_corto,
    canal: pedidoFila.canal as PedidoColaVista["canal"],
    estado: pedidoFila.estado as PedidoColaVista["estado"],
    mesaNumero,
    clienteNombre,
    totalCop: pedidoFila.total_cop,
  };
}

/** Cola de pedidos por cobrar. Realtime sobre `pedidos` filtrado por sede —
 *  mismo patrón de 2 casos (patch in place / fetch completo al entrar) que
 *  `TableroKDS` del Bloque 6, sin canal de ítems porque esta cola no los
 *  necesita. */
export function ColaCobro({ pedidosIniciales, sedeId }: ColaCobroProps) {
  const [pedidos, setPedidos] = useState<PedidoColaVista[]>(pedidosIniciales);
  const pedidosRef = useRef(pedidos);
  pedidosRef.current = pedidos;

  useEffect(() => {
    setPedidos(pedidosIniciales);
  }, [pedidosIniciales]);

  // Fusiona las copias locales de pedidos (IndexedDB, Bloques J3d/J3f) con
  // la lista del servidor: sin conexión, la lista server-rendered viene de
  // la copia precargada (posiblemente vieja) y los pedidos creados offline
  // solo existen localmente. La fusión es pura y está testeada
  // (lib/offline/colaCobroLocal.ts); ante el mismo id gana el servidor.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const [locales, mesasCache] = await Promise.all([listarPedidosLocales(), leerDelCatalogo("mesas")]);
      if (cancelado || locales.length === 0) return;
      const mesas = (mesasCache?.datos as MesaCacheada[] | undefined) ?? [];
      setPedidos((actual) => fusionarColaCobro(actual, locales, mesas));
    })();
    return () => {
      cancelado = true;
    };
  }, [pedidosIniciales]);

  // Cada visita online a esta pantalla refresca el caché local de pedidos
  // por cobrar (ver refrescarPedidosLocales) -- la cajera pasa por aquí
  // tras cada cobro, así que la copia local se mantiene al día por si el
  // internet se corta antes del próximo cobro.
  useEffect(() => {
    if (useConectividadStore.getState().estado === "offline") return;
    refrescarPedidosLocales(createClient()).catch(() => {
      // Sin conexión real pese a la señal: el próximo disparo lo reintenta.
    });
  }, [pedidosIniciales]);

  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel(`cola_cobro:sede_${sedeId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pedidos", filter: `sede_id=eq.${sedeId}` },
        (payload: { new: Partial<PedidoFila> }) => {
          const fila = payload.new;
          if (!fila.id) return;
          const visible = fila.estado ? ESTADOS_VISIBLES.has(fila.estado) : false;
          const yaEstaba = pedidosRef.current.some((p) => p.id === fila.id);

          if (!visible) {
            if (yaEstaba) setPedidos((actual) => actual.filter((p) => p.id !== fila.id));
            return;
          }
          if (yaEstaba) {
            setPedidos((actual) =>
              actual.map((p) => (p.id === fila.id ? { ...p, estado: fila.estado as PedidoColaVista["estado"] } : p)),
            );
            return;
          }
          void cargarPedidoColaCompleto(supabase, fila.id).then((pedidoCompleto) => {
            if (!pedidoCompleto) return;
            setPedidos((actual) => (actual.some((p) => p.id === pedidoCompleto.id) ? actual : [...actual, pedidoCompleto]));
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [sedeId]);

  if (pedidos.length === 0) {
    return (
      <p className="rounded-clay-md bg-brand-chocolate-2 p-6 text-center text-xl text-brand-crema/70">
        No hay pedidos por cobrar.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
      {pedidos.map((pedido) => (
        <Link key={pedido.id} href={`/cobrar/${pedido.id}`}>
          <ClayCard variant="elevated" className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-2xl font-bold text-text-primary">
                {pedido.numeroCorto > 0 ? `#${pedido.numeroCorto}` : "Sin número"}
              </span>
              <span className="text-sm text-text-secondary">{etiquetaOrigen(pedido)}</span>
            </div>
            <span className="font-mono text-lg text-text-primary">{formatearCOP(BigInt(pedido.totalCop))}</span>
          </ClayCard>
        </Link>
      ))}
    </div>
  );
}
