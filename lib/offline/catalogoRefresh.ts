import { createClient } from "@/lib/supabase/client";
import { guardarEnCatalogo } from "@/lib/offline/catalogo";
import { reemplazarPedidosLocalesDelServidor } from "@/lib/offline/pedidosLocales";
import { listarPendientes } from "@/lib/offline/cola";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";
import type { ItemPedidoLocal, PedidoLocal } from "@/lib/offline/db";

/** Refresca la copia local del catálogo (menú y mesas) que los bloques
 *  offline de pedidos usarán para operar sin conexión. Se llama solo
 *  mientras hay internet -- ver components/offline/ActualizadorCatalogo.tsx
 *  para cuándo se dispara. Sin sesión no se hace nada (ni siquiera se
 *  intenta la consulta): `productos`/`categorias`/`modificadores`/`mesas`
 *  exigen RLS `to authenticated`, así que sin sesión Supabase devuelve 0
 *  filas (no un error) -- guardar eso sobrescribiría un catálogo bueno ya
 *  cacheado con uno vacío (bug real encontrado con verificación en
 *  navegador: este componente se monta en el layout raíz, así que corre
 *  también en /login, antes de que exista sesión). Sin test unitario
 *  dedicado (llamadas reales a Supabase desde el navegador). */
export async function refrescarCatalogo(): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const [{ data: categorias }, { data: productos }, { data: modificadores }, { data: mesas }] =
    await Promise.all([
      supabase
        .from("categorias")
        .select("id, nombre, orden, activa")
        .eq("activa", true)
        .order("orden", { ascending: true }),
      supabase
        .from("productos")
        .select("id, nombre, descripcion, precio_cop, imagen_url, activo, categoria_id, tiempo_prep_min")
        .eq("activo", true),
      supabase
        .from("modificadores")
        .select("id, producto_id, grupo, nombre, precio_delta_cop, obligatorio, max_seleccion, activo")
        .eq("activo", true),
      supabase
        .from("mesas")
        .select("id, numero, nombre, capacidad, estado, activa")
        .eq("activa", true)
        .order("numero", { ascending: true }),
    ]);

  await guardarEnCatalogo("categorias", categorias ?? []);
  await guardarEnCatalogo("productos", productos ?? []);
  await guardarEnCatalogo("modificadores", modificadores ?? []);
  await guardarEnCatalogo("mesas", mesas ?? []);

  const sedeId = (user.app_metadata?.sede_id as string | undefined) ?? SEDE_DEFAULT_ID;
  const { data: sede } = await supabase.from("sedes").select("id, nombre, usa_cocina").eq("id", sedeId).maybeSingle();
  if (sede) await guardarEnCatalogo("sede", sede);

  await refrescarPedidosLocales(supabase);
}

/** Cachea en pedidosLocales los pedidos del servidor que están por cobrar
 *  (listo/entregado, RLS ya filtra por sede) con sus ítems -- así la
 *  Cajera puede cobrar sin conexión también un pedido que se creó ONLINE
 *  antes del corte, no solo los creados offline (Bloque J3f, paridad
 *  completa pedida por el usuario). Los pedidos con operaciones pendientes
 *  en la cola de sincronización se preservan tal cual: su copia local es
 *  la única fuente hasta que el servidor los tenga. Además de dispararse
 *  con el resto del catálogo, ColaCobro.tsx la llama en cada visita online
 *  a /pedidos (la pantalla por la que la cajera pasa tras cada cobro) --
 *  sin eso, un pedido creado online DESPUÉS del último inicio de sesión no
 *  tendría copia local si el internet se corta antes de cobrarlo. */
export async function refrescarPedidosLocales(supabase: ReturnType<typeof createClient>): Promise<void> {
  const { data: pedidosFilas } = await supabase
    .from("pedidos")
    .select("id, canal, mesa_id, cliente_id, sede_id, vendedora_id, creado_en")
    .in("estado", ["listo", "entregado"]);

  const pedidoIds = (pedidosFilas ?? []).map((p) => p.id);
  const { data: itemsFilas } = pedidoIds.length
    ? await supabase
        .from("pedido_items")
        .select("id, pedido_id, producto_id, cantidad, precio_unit_cop, notas")
        .in("pedido_id", pedidoIds)
    : { data: [] as { id: string; pedido_id: string; producto_id: string; cantidad: number; precio_unit_cop: number; notas: string | null }[] };

  const itemIds = (itemsFilas ?? []).map((i) => i.id);
  const { data: modsFilas } = itemIds.length
    ? await supabase
        .from("pedido_item_mods")
        .select("pedido_item_id, modificador_id, precio_delta_cop")
        .in("pedido_item_id", itemIds)
    : { data: [] as { pedido_item_id: string; modificador_id: string; precio_delta_cop: number }[] };

  const productoIds = [...new Set((itemsFilas ?? []).map((i) => i.producto_id))];
  const { data: productosFilas } = productoIds.length
    ? await supabase.from("productos").select("id, nombre").in("id", productoIds)
    : { data: [] as { id: string; nombre: string }[] };
  const nombreProductoPorId = new Map((productosFilas ?? []).map((p) => [p.id, p.nombre]));

  const modificadorIds = [...new Set((modsFilas ?? []).map((m) => m.modificador_id))];
  const { data: modificadoresFilas } = modificadorIds.length
    ? await supabase.from("modificadores").select("id, nombre").in("id", modificadorIds)
    : { data: [] as { id: string; nombre: string }[] };
  const nombreModificadorPorId = new Map((modificadoresFilas ?? []).map((m) => [m.id, m.nombre]));

  const pedidosServidor: PedidoLocal[] = (pedidosFilas ?? []).map((p) => {
    const items: ItemPedidoLocal[] = (itemsFilas ?? [])
      .filter((i) => i.pedido_id === p.id)
      .map((i) => ({
        productoId: i.producto_id,
        nombre: nombreProductoPorId.get(i.producto_id) ?? "Producto",
        cantidad: i.cantidad,
        precioUnitCop: i.precio_unit_cop,
        modificadores: (modsFilas ?? [])
          .filter((m) => m.pedido_item_id === i.id)
          .map((m) => ({
            modificadorId: m.modificador_id,
            nombre: nombreModificadorPorId.get(m.modificador_id) ?? "Adicional",
            precioDeltaCop: m.precio_delta_cop,
          })),
        nota: i.notas,
      }));
    const origen: PedidoLocal["origen"] =
      p.canal === "mesa" && p.mesa_id
        ? { canal: "mesa", mesaId: p.mesa_id }
        : p.canal === "domicilio" && p.cliente_id
          ? { canal: "domicilio", clienteId: p.cliente_id }
          : { canal: "llevar" };
    return {
      pedidoId: p.id,
      origen,
      items,
      estado: "abierto",
      sedeId: p.sede_id,
      vendedoraId: p.vendedora_id,
      creadoEn: p.creado_en,
    };
  });

  const pendientes = await listarPendientes();
  const idsProtegidos = new Set(
    pendientes.map((op) => op.payload.pedidoId).filter((id): id is string => typeof id === "string"),
  );
  await reemplazarPedidosLocalesDelServidor(pedidosServidor, idsProtegidos);
}
