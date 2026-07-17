"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { leerDelCatalogo } from "@/lib/offline/catalogo";
import { leerPedidoLocal } from "@/lib/offline/pedidosLocales";
import { construirVistaPedidoLocal, type MesaCacheada } from "@/lib/offline/pedidoLocalVista";
import { PedidoEditor } from "@/components/pedido/PedidoEditor";
import type { CategoriaFila, ModificadorFila, ProductoFila } from "@/components/menu/types";
import type { ItemConfirmadoVista, PedidoVista } from "@/components/pedido/tipos";

interface DatosPedido {
  pedido: PedidoVista;
  itemsConfirmados: ItemConfirmadoVista[];
  categorias: CategoriaFila[];
  productos: ProductoFila[];
  modificadores: ModificadorFila[];
  usaCocina: boolean;
}

/** Client Component (era Server Component hasta el Bloque J3e): el id del
 *  pedido se lee de window.location.pathname, NO de useParams -- cuando el
 *  Service Worker sirve la plantilla offline para un pedido nunca visitado
 *  (public/sw.js), el payload interno de Next trae la ruta de la plantilla,
 *  pero la URL real del navegador siempre es la verdadera. */
function pedidoIdDesdeUrl(): string {
  const segmentos = window.location.pathname.split("/").filter(Boolean);
  return segmentos[segmentos.length - 1] ?? "";
}

async function cargarOnline(pedidoId: string): Promise<DatosPedido | null> {
  const supabase = createClient();

  // Dos olas de consultas en paralelo (antes eran ~7 secuenciales y la
  // pantalla quedaba en blanco 1-2s tras confirmar un pedido -- reporte
  // real del usuario). Ola 1: todo lo que no depende de nada.
  const [resPedido, resItems, resCategorias, resProductos, resModificadores] = await Promise.all([
    supabase
      .from("pedidos")
      .select("id, numero_corto, canal, estado, subtotal_cop, total_cop, mesa_id, cliente_id, vendedora_id, sede_id")
      .eq("id", pedidoId)
      .single(),
    supabase
      .from("pedido_items")
      .select("id, producto_id, cantidad, precio_unit_cop, subtotal_cop, notas, estado_item")
      .eq("pedido_id", pedidoId),
    supabase.from("categorias").select("id, nombre, orden, activa").eq("activa", true).order("orden", { ascending: true }),
    supabase
      .from("productos")
      .select("id, nombre, descripcion, precio_cop, imagen_url, activo, categoria_id, tiempo_prep_min")
      .eq("activo", true),
    supabase
      .from("modificadores")
      .select("id, producto_id, grupo, nombre, precio_delta_cop, obligatorio, max_seleccion, activo")
      .eq("activo", true),
  ]);
  const pedidoFila = resPedido.data;
  // Distinguir "no existe" (null sin error de red) de "sin conexión"
  // (error de red): sin conexión debe intentarse el camino local, no
  // mostrar "no encontrado".
  if (resPedido.error && resPedido.error.code !== "PGRST116") throw new Error("Sin conexión con el servidor");
  if (!pedidoFila) return null;
  const itemsFilas = resItems.data;
  const categorias = resCategorias.data;
  const productos = resProductos.data;
  const modificadores = resModificadores.data;
  if (!categorias || !productos || !modificadores) throw new Error("Sin datos del servidor");

  // Ola 2: lo que depende de la ola 1. Los nombres de productos y
  // modificadores de los ítems salen del catálogo ya traído (activos); el
  // fallback a "Producto"/"Adicional" cubre el caso raro de un ítem cuyo
  // producto se desactivó después.
  const itemIds = (itemsFilas ?? []).map((i) => i.id);
  const [resMesa, resCliente, resSede, resMods] = await Promise.all([
    pedidoFila.mesa_id
      ? supabase.from("mesas").select("numero").eq("id", pedidoFila.mesa_id).single()
      : Promise.resolve({ data: null }),
    pedidoFila.cliente_id
      ? supabase.from("clientes_domicilio").select("nombre").eq("id", pedidoFila.cliente_id).single()
      : Promise.resolve({ data: null }),
    supabase.from("sedes").select("usa_cocina").eq("id", pedidoFila.sede_id).maybeSingle(),
    itemIds.length
      ? supabase
          .from("pedido_item_mods")
          .select("id, pedido_item_id, modificador_id, precio_delta_cop")
          .in("pedido_item_id", itemIds)
      : Promise.resolve({
          data: [] as { id: string; pedido_item_id: string; modificador_id: string; precio_delta_cop: number }[],
        }),
  ]);
  const mesaNumero = (resMesa.data as { numero: number } | null)?.numero ?? null;
  const clienteNombre = (resCliente.data as { nombre: string } | null)?.nombre ?? null;
  const sedeFila = resSede.data;
  const modsFilas = resMods.data;

  const nombreProductoPorId = new Map(productos.map((p) => [p.id, p.nombre]));
  const nombreModificadorPorId = new Map(modificadores.map((m) => [m.id, m.nombre]));

  const itemsConfirmados: ItemConfirmadoVista[] = (itemsFilas ?? []).map((fila) => ({
    id: fila.id,
    productoNombre: nombreProductoPorId.get(fila.producto_id) ?? "Producto",
    cantidad: fila.cantidad,
    precioUnitCop: fila.precio_unit_cop,
    subtotalCop: fila.subtotal_cop,
    notas: fila.notas,
    estadoItem: fila.estado_item,
    modificadores: (modsFilas ?? [])
      .filter((m) => m.pedido_item_id === fila.id)
      .map((m) => ({
        nombre: nombreModificadorPorId.get(m.modificador_id) ?? "Adicional",
        precioDeltaCop: m.precio_delta_cop,
      })),
  }));

  return {
    pedido: {
      id: pedidoFila.id,
      numeroCorto: pedidoFila.numero_corto,
      canal: pedidoFila.canal,
      estado: pedidoFila.estado,
      mesaNumero,
      clienteNombre,
      subtotalCop: pedidoFila.subtotal_cop,
      totalCop: pedidoFila.total_cop,
    },
    itemsConfirmados,
    categorias: categorias as CategoriaFila[],
    productos: productos as ProductoFila[],
    modificadores: modificadores as ModificadorFila[],
    usaCocina: sedeFila?.usa_cocina !== false,
  };
}

async function cargarOffline(pedidoId: string): Promise<DatosPedido | null> {
  const pedidoLocal = await leerPedidoLocal(pedidoId);
  if (!pedidoLocal) return null;

  const [categoriasCache, productosCache, modificadoresCache, mesasCache] = await Promise.all([
    leerDelCatalogo("categorias"),
    leerDelCatalogo("productos"),
    leerDelCatalogo("modificadores"),
    leerDelCatalogo("mesas"),
  ]);
  const mesas = (mesasCache?.datos as MesaCacheada[] | undefined) ?? [];
  const { pedido, itemsConfirmados } = construirVistaPedidoLocal(pedidoLocal, mesas);

  return {
    pedido,
    itemsConfirmados,
    categorias: (categoriasCache?.datos as CategoriaFila[] | undefined) ?? [],
    productos: (productosCache?.datos as ProductoFila[] | undefined) ?? [],
    modificadores: (modificadoresCache?.datos as ModificadorFila[] | undefined) ?? [],
    // usa_cocina real de la sede de Armenia (CLAUDE.md §2.5); solo afecta
    // el texto del botón, misma limitación aceptada que /pedido/nuevo.
    usaCocina: false,
  };
}

export default function PedidoPage() {
  const [datos, setDatos] = useState<DatosPedido | null>(null);
  const [noEncontrado, setNoEncontrado] = useState(false);

  const cargar = useCallback(async () => {
    const pedidoId = pedidoIdDesdeUrl();
    if (!pedidoId) {
      setNoEncontrado(true);
      return;
    }
    // Con el detector ya en "offline", ir directo a la copia local: no
    // tiene sentido esperar a que cada consulta al servidor falle (puede
    // tardar), y tras agregar ítems offline la vendedora necesita ver el
    // pedido actualizado de inmediato.
    if (useConectividadStore.getState().estado === "offline") {
      const local = await cargarOffline(pedidoId);
      if (local) setDatos(local);
      else setNoEncontrado(true);
      return;
    }
    // Local-primero: la copia local (IndexedDB, milisegundos) se muestra de
    // inmediato -- existe para todo pedido recién creado en este equipo,
    // online u offline (CarritoNuevo la escribe en ambos caminos). Los datos
    // frescos del servidor la reemplazan cuando llegan. Sin esto, la
    // pantalla quedaba en blanco 1-2s tras confirmar (reporte del usuario).
    const localInmediato = await cargarOffline(pedidoId);
    if (localInmediato) setDatos(localInmediato);
    try {
      const online = await cargarOnline(pedidoId);
      if (online) {
        setDatos(online);
        return;
      }
      // El servidor respondió pero el pedido no existe allá todavía --
      // puede ser un pedido creado offline aún sin sincronizar: la copia
      // local ya mostrada es la vista correcta; sin copia, no encontrado.
      if (!localInmediato) setNoEncontrado(true);
    } catch {
      // Sin conexión: la copia local ya mostrada (Bloque J3d) es todo lo
      // que hay.
      if (!localInmediato) setNoEncontrado(true);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

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
    // Nunca pantalla vacía: si la copia local aún no llegó (caso raro,
    // pedido de otro equipo), al menos se ve que algo está cargando.
    return (
      <main className="p-8">
        <p className="text-brand-crema/70">Cargando pedido…</p>
      </main>
    );
  }

  const { pedido } = datos;
  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">
        {pedido.numeroCorto > 0 ? `Pedido #${pedido.numeroCorto}` : "Pedido (por sincronizar)"}
        {pedido.mesaNumero ? ` — Mesa ${pedido.mesaNumero}` : null}
        {pedido.clienteNombre ? ` — ${pedido.clienteNombre}` : null}
        {pedido.canal === "llevar" ? " — Para llevar" : null}
        {pedido.canal === "domicilio" && !pedido.clienteNombre ? " — Domicilio" : null}
      </h1>
      <div className="mt-6">
        <PedidoEditor
          pedido={pedido}
          itemsConfirmados={datos.itemsConfirmados}
          categorias={datos.categorias}
          productos={datos.productos}
          modificadores={datos.modificadores}
          usaCocina={datos.usaCocina}
          onRecargar={cargar}
        />
      </div>
    </main>
  );
}
