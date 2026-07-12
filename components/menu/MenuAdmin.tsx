"use client";

import { useState } from "react";
import { BarraCategorias } from "@/components/menu/BarraCategorias";
import { GrillaProductos } from "@/components/menu/GrillaProductos";
import { EditorProducto } from "@/components/menu/EditorProducto";
import type { CategoriaFila, ModificadorFila, ProductoFila } from "@/components/menu/types";

interface MenuAdminProps {
  categorias: CategoriaFila[];
  productos: ProductoFila[];
  modificadores: ModificadorFila[];
}

/**
 * Orquesta la pantalla `/menu`: pestañas de categoría, grilla de productos y
 * el modal de edición. `categorias`/`productos`/`modificadores` son siempre
 * los datos vigentes del servidor (Server Component `page.tsx`) — el estado
 * local solo guarda decisiones de UI (pestaña activa, modal abierto), nunca
 * una copia de los datos, para que `router.refresh()` los mantenga al día
 * sin necesidad de sincronizar estado manualmente.
 */
export function MenuAdmin({ categorias, productos, modificadores }: MenuAdminProps) {
  const [categoriaSeleccionadaId, setCategoriaSeleccionadaId] = useState<string | null>(null);
  const [productoAbiertoId, setProductoAbiertoId] = useState<string | "nuevo" | null>(null);

  const categoriaActiva =
    categorias.find((categoria) => categoria.id === categoriaSeleccionadaId) ??
    categorias[0] ??
    null;
  const categoriaActivaId = categoriaActiva?.id ?? null;

  const productosDeCategoria = productos.filter(
    (producto) => producto.categoria_id === categoriaActivaId,
  );

  const productoAbierto =
    productoAbiertoId === "nuevo"
      ? "nuevo"
      : productoAbiertoId
        ? (productos.find((producto) => producto.id === productoAbiertoId) ?? null)
        : null;

  return (
    <div className="mt-8 flex flex-col gap-6">
      <BarraCategorias
        categorias={categorias}
        categoriaActivaId={categoriaActivaId}
        onSeleccionar={setCategoriaSeleccionadaId}
      />
      <GrillaProductos
        productos={productosDeCategoria}
        categoriaSeleccionada={categoriaActiva}
        onSeleccionarProducto={(producto) => setProductoAbiertoId(producto.id)}
        onNuevoProducto={() => setProductoAbiertoId("nuevo")}
      />
      {productoAbierto ? (
        <EditorProducto
          key={productoAbierto === "nuevo" ? "nuevo" : productoAbierto.id}
          producto={productoAbierto === "nuevo" ? null : productoAbierto}
          categorias={categorias}
          categoriaSugeridaId={categoriaActivaId}
          modificadores={
            productoAbierto === "nuevo"
              ? []
              : modificadores.filter((modificador) => modificador.producto_id === productoAbierto.id)
          }
          onCerrar={() => setProductoAbiertoId(null)}
        />
      ) : null}
    </div>
  );
}
