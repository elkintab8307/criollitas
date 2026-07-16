"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { leerDelCatalogo } from "@/lib/offline/catalogo";
import { PedidoNuevoEditor } from "@/components/pedido/PedidoNuevoEditor";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";
import type { CategoriaFila, ModificadorFila, ProductoFila } from "@/components/menu/types";
import type { OrigenPedido } from "@/app/(vendedora)/pedido/actions";

interface DatosPedidoNuevo {
  origen: OrigenPedido;
  tituloOrigen: string;
  categorias: CategoriaFila[];
  productos: ProductoFila[];
  modificadores: ModificadorFila[];
  usaCocina: boolean;
}

export default function PedidoNuevoPage() {
  // useSearchParams solo como disparador de reactividad (soft-navigation
  // online con otros parámetros); los VALORES se leen de
  // window.location.search dentro del efecto -- cuando el Service Worker
  // sirve el shell cacheado de /pedido/nuevo sin query para una URL con
  // query (ignoreSearch, public/sw.js), el payload embebido no trae los
  // parámetros reales, la URL del navegador sí.
  const searchParams = useSearchParams();
  const claveParams = searchParams.toString();
  const [datos, setDatos] = useState<DatosPedidoNuevo | null>(null);

  useEffect(() => {
    let cancelado = false;

    const params = new URLSearchParams(window.location.search);
    const mesaId = params.get("mesaId") ?? undefined;
    const canal = params.get("canal") ?? undefined;
    const clienteId = params.get("clienteId") ?? undefined;

    async function cargar() {
      let origen: OrigenPedido;
      let tituloOrigen = "Nuevo pedido";
      if (mesaId) {
        origen = { canal: "mesa", mesaId };
      } else if (canal === "domicilio" && clienteId) {
        origen = { canal: "domicilio", clienteId };
        tituloOrigen = "Domicilio";
      } else {
        origen = { canal: "llevar" };
        tituloOrigen = "Para llevar";
      }

      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const sedeId = (user?.app_metadata?.sede_id as string | undefined) ?? SEDE_DEFAULT_ID;

        const [{ data: categorias }, { data: productos }, { data: modificadores }, { data: sedeFila }] =
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
            supabase.from("sedes").select("usa_cocina").eq("id", sedeId).maybeSingle(),
          ]);
        if (!categorias || !productos || !modificadores) throw new Error("Sin datos del servidor");

        if (mesaId) {
          const { data: mesaFila } = await supabase.from("mesas").select("numero").eq("id", mesaId).single();
          tituloOrigen = mesaFila ? `Mesa ${mesaFila.numero}` : "Mesa";
        } else if (canal === "domicilio" && clienteId) {
          const { data: clienteFila } = await supabase
            .from("clientes_domicilio")
            .select("nombre")
            .eq("id", clienteId)
            .single();
          tituloOrigen = clienteFila ? clienteFila.nombre : "Domicilio";
        }

        if (!cancelado) {
          setDatos({
            origen,
            tituloOrigen,
            categorias: categorias as CategoriaFila[],
            productos: productos as ProductoFila[],
            modificadores: modificadores as ModificadorFila[],
            usaCocina: sedeFila?.usa_cocina !== false,
          });
        }
      } catch {
        // Sin conexión: usar el catálogo cacheado (Bloque J3c). usaCocina
        // se asume false -- es el valor real de la sede de Armenia hoy
        // (CLAUDE.md §2.5) y solo afecta el texto del botón de confirmar,
        // no ninguna regla de negocio real (esa vive en el servidor).
        const [categoriasCache, productosCache, modificadoresCache, mesasCache] = await Promise.all([
          leerDelCatalogo("categorias"),
          leerDelCatalogo("productos"),
          leerDelCatalogo("modificadores"),
          leerDelCatalogo("mesas"),
        ]);
        if (mesaId) {
          const mesas = (mesasCache?.datos as { id: string; numero: number }[] | undefined) ?? [];
          const mesa = mesas.find((m) => m.id === mesaId);
          tituloOrigen = mesa ? `Mesa ${mesa.numero}` : "Mesa";
        }
        if (!cancelado) {
          setDatos({
            origen,
            tituloOrigen,
            categorias: (categoriasCache?.datos as CategoriaFila[] | undefined) ?? [],
            productos: (productosCache?.datos as ProductoFila[] | undefined) ?? [],
            modificadores: (modificadoresCache?.datos as ModificadorFila[] | undefined) ?? [],
            usaCocina: false,
          });
        }
      }
    }
    cargar();
    return () => {
      cancelado = true;
    };
  }, [claveParams]);

  if (!datos) return null;

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Nuevo pedido — {datos.tituloOrigen}</h1>
      <div className="mt-6">
        <PedidoNuevoEditor
          origen={datos.origen}
          categorias={datos.categorias}
          productos={datos.productos}
          modificadores={datos.modificadores}
          usaCocina={datos.usaCocina}
        />
      </div>
    </main>
  );
}
