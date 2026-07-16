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

  const { data: pedidoFila, error } = await supabase
    .from("pedidos")
    .select("id, numero_corto, canal, estado, subtotal_cop, total_cop, mesa_id, cliente_id, vendedora_id, sede_id")
    .eq("id", pedidoId)
    .single();
  // Distinguir "no existe" (null sin error de red) de "sin conexión"
  // (error de red): sin conexión debe intentarse el camino local, no
  // mostrar "no encontrado".
  if (error && error.code !== "PGRST116") throw new Error("Sin conexión con el servidor");
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

  const { data: sedeFila } = await supabase
    .from("sedes")
    .select("usa_cocina")
    .eq("id", pedidoFila.sede_id)
    .maybeSingle();

  const { data: itemsFilas } = await supabase
    .from("pedido_items")
    .select("id, producto_id, cantidad, precio_unit_cop, subtotal_cop, notas, estado_item")
    .eq("pedido_id", pedidoId);

  const productoIdsUsados = [...new Set((itemsFilas ?? []).map((i) => i.producto_id))];
  const { data: productosUsados } = productoIdsUsados.length
    ? await supabase.from("productos").select("id, nombre").in("id", productoIdsUsados)
    : { data: [] as { id: string; nombre: string }[] };
  const nombreProductoPorId = new Map((productosUsados ?? []).map((p) => [p.id, p.nombre]));

  const itemIds = (itemsFilas ?? []).map((i) => i.id);
  const { data: modsFilas } = itemIds.length
    ? await supabase
        .from("pedido_item_mods")
        .select("id, pedido_item_id, modificador_id, precio_delta_cop")
        .in("pedido_item_id", itemIds)
    : {
        data: [] as { id: string; pedido_item_id: string; modificador_id: string; precio_delta_cop: number }[],
      };
  const modificadorIdsUsados = [...new Set((modsFilas ?? []).map((m) => m.modificador_id))];
  const { data: modificadoresUsados } = modificadorIdsUsados.length
    ? await supabase.from("modificadores").select("id, nombre").in("id", modificadorIdsUsados)
    : { data: [] as { id: string; nombre: string }[] };
  const nombreModificadorPorId = new Map((modificadoresUsados ?? []).map((m) => [m.id, m.nombre]));

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

  const [{ data: categorias }, { data: productos }, { data: modificadores }] = await Promise.all([
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
  if (!categorias || !productos || !modificadores) throw new Error("Sin datos del servidor");

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
    try {
      const online = await cargarOnline(pedidoId);
      if (online) {
        setDatos(online);
        return;
      }
      // El servidor respondió pero el pedido no existe allá todavía --
      // puede ser un pedido creado offline aún sin sincronizar: intentar
      // el camino local antes de dar "no encontrado".
      const local = await cargarOffline(pedidoId);
      if (local) setDatos(local);
      else setNoEncontrado(true);
    } catch {
      // Sin conexión: leer la copia local (Bloque J3d).
      const local = await cargarOffline(pedidoId);
      if (local) setDatos(local);
      else setNoEncontrado(true);
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
  if (!datos) return null;

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
