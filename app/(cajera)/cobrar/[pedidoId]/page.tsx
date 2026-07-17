"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { leerPedidoLocal } from "@/lib/offline/pedidosLocales";
import { leerDelCatalogo } from "@/lib/offline/catalogo";
import { construirVistaPedidoLocal, type MesaCacheada } from "@/lib/offline/pedidoLocalVista";
import { FormularioCobro, type TicketOffline } from "@/components/caja/FormularioCobro";
import { BotonReimprimir } from "@/components/caja/BotonReimprimir";
import { formatearCOP } from "@/lib/money";

interface ItemCobroVista {
  id: string;
  cantidad: number;
  nombre: string;
  subtotalCop: number;
}

interface DatosCobro {
  pedidoId: string;
  numeroCorto: number;
  yaEstaCobrado: boolean;
  totalCop: number;
  items: ItemCobroVista[];
  ticketOffline: TicketOffline;
}

/** Client Component (era Server Component hasta el Bloque J3f): mismo
 *  patrón que /pedido/[pedidoId] -- el id se lee de window.location (el
 *  Service Worker puede servir esta pantalla desde la plantilla offline
 *  para un pedido sin copia exacta precargada). */
function pedidoIdDesdeUrl(): string {
  const segmentos = window.location.pathname.split("/").filter(Boolean);
  return segmentos[segmentos.length - 1] ?? "";
}

function etiquetaOrigen(canal: string, mesaNumero: number | null, clienteNombre: string | null): string {
  if (canal === "mesa") return mesaNumero ? `Mesa ${mesaNumero}` : "Mesa";
  if (canal === "domicilio") return clienteNombre ?? "Domicilio";
  return clienteNombre ? `Para llevar — ${clienteNombre}` : "Para llevar";
}

async function cargarOnline(pedidoId: string): Promise<DatosCobro | null> {
  const supabase = createClient();
  // Consultas en paralelo (mismo motivo que /pedido/[id]: secuenciales
  // dejaban la pantalla en blanco un par de segundos).
  const [resPedido, resItems, sedeCache] = await Promise.all([
    supabase
      .from("pedidos")
      .select("id, numero_corto, estado, canal, mesa_id, cliente_id, subtotal_cop, total_cop")
      .eq("id", pedidoId)
      .single(),
    supabase.from("pedido_items").select("id, producto_id, cantidad, subtotal_cop").eq("pedido_id", pedidoId),
    leerDelCatalogo("sede"),
  ]);
  const pedidoFila = resPedido.data;
  if (resPedido.error && resPedido.error.code !== "PGRST116") throw new Error("Sin conexión con el servidor");
  if (!pedidoFila || !["listo", "entregado", "cobrado"].includes(pedidoFila.estado)) return null;
  const itemsFilas = resItems.data;

  const productoIds = [...new Set((itemsFilas ?? []).map((i) => i.producto_id))];
  const [resMesa, resCliente, resProductos] = await Promise.all([
    pedidoFila.mesa_id
      ? supabase.from("mesas").select("numero").eq("id", pedidoFila.mesa_id).single()
      : Promise.resolve({ data: null }),
    pedidoFila.cliente_id
      ? supabase.from("clientes_domicilio").select("nombre").eq("id", pedidoFila.cliente_id).single()
      : Promise.resolve({ data: null }),
    productoIds.length
      ? supabase.from("productos").select("id, nombre").in("id", productoIds)
      : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
  ]);
  const mesaNumero = (resMesa.data as { numero: number } | null)?.numero ?? null;
  const clienteNombre = (resCliente.data as { nombre: string } | null)?.nombre ?? null;
  const nombrePorId = new Map((resProductos.data ?? []).map((p) => [p.id, p.nombre]));

  const sedeNombre = (sedeCache?.datos as { nombre?: string } | undefined)?.nombre ?? "Criollitas";

  const items: ItemCobroVista[] = (itemsFilas ?? []).map((i) => ({
    id: i.id,
    cantidad: i.cantidad,
    nombre: nombrePorId.get(i.producto_id) ?? "Producto",
    subtotalCop: i.subtotal_cop,
  }));

  return {
    pedidoId: pedidoFila.id,
    numeroCorto: pedidoFila.numero_corto,
    yaEstaCobrado: pedidoFila.estado === "cobrado",
    totalCop: pedidoFila.total_cop,
    items,
    ticketOffline: {
      numeroCorto: pedidoFila.numero_corto,
      sedeNombre,
      origen: etiquetaOrigen(pedidoFila.canal, mesaNumero, clienteNombre),
      items: items.map(({ cantidad, nombre, subtotalCop }) => ({ cantidad, nombre, subtotalCop })),
      subtotalCop: pedidoFila.subtotal_cop,
    },
  };
}

async function cargarOffline(pedidoId: string): Promise<DatosCobro | null> {
  const pedidoLocal = await leerPedidoLocal(pedidoId);
  if (!pedidoLocal) return null;
  const [mesasCache, sedeCache] = await Promise.all([leerDelCatalogo("mesas"), leerDelCatalogo("sede")]);
  const mesas = (mesasCache?.datos as MesaCacheada[] | undefined) ?? [];
  const sedeNombre = (sedeCache?.datos as { nombre?: string } | undefined)?.nombre ?? "Criollitas";
  const { pedido, itemsConfirmados } = construirVistaPedidoLocal(pedidoLocal, mesas);

  const items: ItemCobroVista[] = itemsConfirmados.map((i) => ({
    id: i.id,
    cantidad: i.cantidad,
    nombre: i.productoNombre,
    subtotalCop: i.subtotalCop,
  }));

  return {
    pedidoId: pedido.id,
    numeroCorto: pedido.numeroCorto,
    yaEstaCobrado: pedido.estado === "cobrado",
    totalCop: pedido.totalCop,
    items,
    ticketOffline: {
      numeroCorto: pedido.numeroCorto,
      sedeNombre,
      origen: etiquetaOrigen(pedido.canal, pedido.mesaNumero, pedido.clienteNombre),
      items: items.map(({ cantidad, nombre, subtotalCop }) => ({ cantidad, nombre, subtotalCop })),
      subtotalCop: pedido.subtotalCop,
    },
  };
}

export default function CobrarPedidoPage() {
  const [datos, setDatos] = useState<DatosCobro | null>(null);
  const [noEncontrado, setNoEncontrado] = useState(false);

  useEffect(() => {
    (async () => {
      const pedidoId = pedidoIdDesdeUrl();
      if (!pedidoId) {
        setNoEncontrado(true);
        return;
      }
      if (useConectividadStore.getState().estado === "offline") {
        const local = await cargarOffline(pedidoId);
        if (local) setDatos(local);
        else setNoEncontrado(true);
        return;
      }
      // Local-primero (mismo motivo que /pedido/[id]): la copia local se
      // muestra al instante y los datos frescos la reemplazan al llegar.
      const localInmediato = await cargarOffline(pedidoId);
      if (localInmediato) setDatos(localInmediato);
      try {
        const online = await cargarOnline(pedidoId);
        if (online) {
          setDatos(online);
          return;
        }
        if (!localInmediato) setNoEncontrado(true);
      } catch {
        if (!localInmediato) setNoEncontrado(true);
      }
    })();
  }, []);

  if (noEncontrado) {
    return (
      <main className="p-8">
        <p className="rounded-clay-md bg-brand-chocolate-2 p-6 text-center text-sm text-brand-crema/70">
          No encontramos este pedido en este equipo.
        </p>
      </main>
    );
  }
  if (!datos) {
    return (
      <main className="p-8">
        <p className="text-brand-crema/70">Cargando pedido…</p>
      </main>
    );
  }

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">
        {datos.numeroCorto > 0 ? `Pedido #${datos.numeroCorto}` : "Pedido (por sincronizar)"}
      </h1>
      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          {datos.items.map((item) => (
            <div key={item.id} className="rounded-clay-md bg-brand-crema-2 p-3 text-sm text-brand-chocolate">
              <p className="font-medium">
                {item.cantidad}× {item.nombre}
              </p>
              <p className="text-brand-chocolate/70">{formatearCOP(BigInt(item.subtotalCop))}</p>
            </div>
          ))}
          {/* Total grande justo debajo de los ítems: la cajera debe ver
              cuánto cobrar sin buscarlo dentro del formulario de pago
              (legible a 1m, CLAUDE.md §8.4). */}
          <div className="mt-2 flex items-center justify-between rounded-clay-md bg-brand-mostaza px-4 py-3 shadow-clay-sm">
            <span className="font-display text-lg font-semibold text-brand-chocolate">Total a cobrar</span>
            <span className="font-mono text-2xl font-bold text-brand-chocolate">
              {formatearCOP(BigInt(datos.totalCop))}
            </span>
          </div>
        </div>
        {datos.yaEstaCobrado ? (
          <div className="flex flex-col gap-4 rounded-clay-md bg-brand-chocolate-2 p-6 text-center">
            <p className="text-xl text-brand-crema/70">Este pedido ya fue cobrado.</p>
            <BotonReimprimir pedidoId={datos.pedidoId} />
          </div>
        ) : (
          <FormularioCobro pedidoId={datos.pedidoId} totalCop={BigInt(datos.totalCop)} ticketOffline={datos.ticketOffline} />
        )}
      </div>
    </main>
  );
}
