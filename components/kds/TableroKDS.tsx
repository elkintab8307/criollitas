"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { actualizarEstadoItem } from "@/app/(cocina)/kds/actions";
import { TarjetaPedido } from "@/components/kds/TarjetaPedido";
import type { EstadoItemAccionable } from "@/lib/kds/transicionItem";
import type { ItemKDSVista, PedidoKDSVista } from "@/components/kds/tipos";
import type { Database } from "@/lib/supabase/types";

type PedidoFila = Database["public"]["Tables"]["pedidos"]["Row"];
type PedidoItemFila = Database["public"]["Tables"]["pedido_items"]["Row"];

const ESTADOS_VISIBLES = new Set(["enviado_cocina", "en_preparacion", "listo"]);

interface TableroKDSProps {
  pedidosIniciales: PedidoKDSVista[];
  sedeId: string;
}

/** Carga un pedido completo (mesa/cliente/items/modificadores) cuando entra
 *  al rango visible por Realtime y todavía no está en el tablero local —
 *  el payload de postgres_changes solo trae columnas crudas de `pedidos`,
 *  así que hace falta el mismo tipo de joins manuales que hace page.tsx en
 *  el fetch inicial (duplicación aceptada: un lado corre server-side con
 *  el cliente de servidor, el otro client-side con el cliente de
 *  navegador — no se puede compartir la misma función entre ambos). */
async function cargarPedidoCompleto(
  supabase: ReturnType<typeof createClient>,
  pedidoId: string,
): Promise<PedidoKDSVista | null> {
  const { data: pedidoFila } = await supabase
    .from("pedidos")
    .select("id, numero_corto, canal, estado, mesa_id, cliente_id, enviado_cocina_en")
    .eq("id", pedidoId)
    .single();
  if (!pedidoFila || !pedidoFila.enviado_cocina_en) return null;

  let mesaNumero: number | null = null;
  if (pedidoFila.mesa_id) {
    const { data: mesaFila } = await supabase
      .from("mesas")
      .select("numero")
      .eq("id", pedidoFila.mesa_id)
      .single();
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

  const { data: itemsFilas } = await supabase
    .from("pedido_items")
    .select("id, producto_id, cantidad, notas, estado_item")
    .eq("pedido_id", pedidoId);

  const productoIds = [...new Set((itemsFilas ?? []).map((i) => i.producto_id))];
  const { data: productosFilas } = productoIds.length
    ? await supabase.from("productos").select("id, nombre").in("id", productoIds)
    : { data: [] as { id: string; nombre: string }[] };
  const nombreProductoPorId = new Map((productosFilas ?? []).map((p) => [p.id, p.nombre]));

  const itemIds = (itemsFilas ?? []).map((i) => i.id);
  const { data: modsFilas } = itemIds.length
    ? await supabase
        .from("pedido_item_mods")
        .select("pedido_item_id, modificador_id")
        .in("pedido_item_id", itemIds)
    : { data: [] as { pedido_item_id: string; modificador_id: string }[] };
  const modificadorIds = [...new Set((modsFilas ?? []).map((m) => m.modificador_id))];
  const { data: modificadoresFilas } = modificadorIds.length
    ? await supabase.from("modificadores").select("id, nombre").in("id", modificadorIds)
    : { data: [] as { id: string; nombre: string }[] };
  const nombreModificadorPorId = new Map((modificadoresFilas ?? []).map((m) => [m.id, m.nombre]));

  const items: ItemKDSVista[] = (itemsFilas ?? []).map((fila) => ({
    id: fila.id,
    productoNombre: nombreProductoPorId.get(fila.producto_id) ?? "Producto",
    cantidad: fila.cantidad,
    notas: fila.notas,
    estadoItem: fila.estado_item as ItemKDSVista["estadoItem"],
    modificadores: (modsFilas ?? [])
      .filter((m) => m.pedido_item_id === fila.id)
      .map((m) => ({ nombre: nombreModificadorPorId.get(m.modificador_id) ?? "Adicional" })),
  }));

  return {
    id: pedidoFila.id,
    numeroCorto: pedidoFila.numero_corto,
    canal: pedidoFila.canal as PedidoKDSVista["canal"],
    estado: pedidoFila.estado as PedidoKDSVista["estado"],
    mesaNumero,
    clienteNombre,
    enviadoCocinaEn: pedidoFila.enviado_cocina_en,
    items,
  };
}

/** Orquesta `/kds`: 2 canales Realtime (pedidos, pedido_items), estado
 *  local parchado incrementalmente, grid de TarjetaPedido. */
export function TableroKDS({ pedidosIniciales, sedeId }: TableroKDSProps) {
  const [pedidos, setPedidos] = useState<PedidoKDSVista[]>(pedidosIniciales);
  const [error, setError] = useState<string | null>(null);
  const pedidosRef = useRef(pedidos);
  pedidosRef.current = pedidos;

  useEffect(() => {
    setPedidos(pedidosIniciales);
  }, [pedidosIniciales]);

  useEffect(() => {
    const supabase = createClient();

    const canalPedidos = supabase
      .channel(`kds_pedidos:sede_${sedeId}`)
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
              actual.map((p) =>
                p.id === fila.id ? { ...p, estado: fila.estado as PedidoKDSVista["estado"] } : p,
              ),
            );
            return;
          }
          void cargarPedidoCompleto(supabase, fila.id).then((pedidoCompleto) => {
            if (!pedidoCompleto) return;
            setPedidos((actual) =>
              actual.some((p) => p.id === pedidoCompleto.id) ? actual : [...actual, pedidoCompleto],
            );
          });
        },
      )
      .subscribe();

    const canalItems = supabase
      .channel(`kds_items:sede_${sedeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedido_items" },
        (payload: {
          eventType: string;
          new: Partial<PedidoItemFila>;
          old: Partial<PedidoItemFila>;
        }) => {
          const fila = payload.new;
          if (!fila.pedido_id) return;
          const pedidoActual = pedidosRef.current.find((p) => p.id === fila.pedido_id);
          if (!pedidoActual) return; // pedido de otra sede o aún no cargado en este tablero

          if (payload.eventType === "UPDATE" && fila.id && fila.estado_item) {
            const estadoItem = fila.estado_item;
            setPedidos((actual) =>
              actual.map((p) =>
                p.id !== fila.pedido_id
                  ? p
                  : {
                      ...p,
                      items: p.items.map((it) =>
                        it.id === fila.id
                          ? { ...it, estadoItem: estadoItem as ItemKDSVista["estadoItem"] }
                          : it,
                      ),
                    },
              ),
            );
            return;
          }

          if (payload.eventType === "INSERT" && fila.id) {
            const itemId = fila.id;
            const productoId = fila.producto_id;
            void (async () => {
              const { data: productoFila } = productoId
                ? await supabase.from("productos").select("nombre").eq("id", productoId).single()
                : { data: null as { nombre: string } | null };
              const { data: modsFilas } = await supabase
                .from("pedido_item_mods")
                .select("modificador_id")
                .eq("pedido_item_id", itemId);
              const modificadorIds = (modsFilas ?? []).map((m) => m.modificador_id);
              const { data: modificadoresFilas } = modificadorIds.length
                ? await supabase.from("modificadores").select("id, nombre").in("id", modificadorIds)
                : { data: [] as { id: string; nombre: string }[] };
              const nombrePorId = new Map((modificadoresFilas ?? []).map((m) => [m.id, m.nombre]));

              const nuevoItem: ItemKDSVista = {
                id: itemId,
                productoNombre: productoFila?.nombre ?? "Producto",
                cantidad: fila.cantidad ?? 1,
                notas: fila.notas ?? null,
                estadoItem: (fila.estado_item as ItemKDSVista["estadoItem"]) ?? "pendiente",
                modificadores: modificadorIds.map((id) => ({ nombre: nombrePorId.get(id) ?? "Adicional" })),
              };
              setPedidos((actual) =>
                actual.map((p) =>
                  p.id === fila.pedido_id && !p.items.some((it) => it.id === itemId)
                    ? { ...p, items: [...p.items, nuevoItem] }
                    : p,
                ),
              );
            })();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalPedidos);
      supabase.removeChannel(canalItems);
    };
  }, [sedeId]);

  function alTocarItem(pedidoItemId: string, nuevoEstado: EstadoItemAccionable) {
    setError(null);
    void actualizarEstadoItem(pedidoItemId, nuevoEstado).then((resultado) => {
      // Éxito: no se toca el estado local aquí — la tarjeta se actualiza
      // cuando llega el eco por Realtime del canal pedido_items. Solo se
      // maneja el camino de error: sin esto, un fallo (red, sesión vencida,
      // pedido que cambió de estado) es indistinguible de un toque que
      // simplemente no hizo nada.
      if (!resultado.ok) {
        setError(resultado.error.mensaje);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="rounded-clay-md bg-brand-tomate p-4 text-center text-xl text-brand-crema">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
        {pedidos.length === 0 ? (
          <p className="col-span-full rounded-clay-md bg-brand-chocolate-2 p-6 text-center text-xl text-brand-crema/70">
            No hay pedidos activos en cocina.
          </p>
        ) : (
          pedidos.map((pedido) => (
            <TarjetaPedido key={pedido.id} pedido={pedido} onTocarItem={alTocarItem} />
          ))
        )}
      </div>
    </div>
  );
}
