"use client";

import { useState } from "react";
import { formatearCOP } from "@/lib/money";
import { cn } from "@/lib/cn";
import { useCarritoStore } from "@/lib/pedido/carritoStore";
import { SelectorModificadores } from "@/components/pedido/SelectorModificadores";
import type { CategoriaFila, ModificadorFila, ProductoFila } from "@/components/menu/types";

interface SelectorMenuProps {
  categorias: CategoriaFila[];
  productos: ProductoFila[];
  modificadores: ModificadorFila[];
}

/** Navegación de menú de solo lectura para la vendedora: elegir un producto
 *  lo agrega al carrito (directo, o vía el selector de modificadores). */
export function SelectorMenu({ categorias, productos, modificadores }: SelectorMenuProps) {
  const [categoriaSeleccionadaId, setCategoriaSeleccionadaId] = useState<string | null>(null);
  const [productoConModales, setProductoConModales] = useState<ProductoFila | null>(null);
  const agregar = useCarritoStore((estado) => estado.agregar);

  const categoriaActiva =
    categorias.find((categoria) => categoria.id === categoriaSeleccionadaId) ?? categorias[0] ?? null;
  const categoriaActivaId = categoriaActiva?.id ?? null;
  const productosDeCategoria = productos.filter((producto) => producto.categoria_id === categoriaActivaId);

  function alElegirProducto(producto: ProductoFila) {
    const modsDelProducto = modificadores.filter((m) => m.producto_id === producto.id);
    if (modsDelProducto.length === 0) {
      agregar({
        productoId: producto.id,
        nombre: producto.nombre,
        precioUnitPesos: Math.round(producto.precio_cop / 100),
        cantidad: 1,
        modificadores: [],
        nota: "",
      });
      return;
    }
    setProductoConModales(producto);
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Menú">
      <div className="flex flex-wrap gap-3" role="tablist" aria-label="Categorías">
        {categorias.map((categoria) => {
          const activa = categoria.id === categoriaActivaId;
          return (
            <button
              key={categoria.id}
              type="button"
              role="tab"
              aria-selected={activa}
              onClick={() => setCategoriaSeleccionadaId(categoria.id)}
              className={cn(
                "rounded-clay-md px-4 py-2 font-display text-sm font-semibold shadow-clay-sm",
                "transition-all duration-150",
                activa
                  ? "bg-brand-mostaza text-brand-chocolate"
                  : "bg-brand-crema text-brand-chocolate hover:bg-brand-crema-2",
              )}
            >
              {categoria.nombre}
            </button>
          );
        })}
      </div>

      {productosDeCategoria.length === 0 ? (
        <p className="rounded-clay-md bg-brand-chocolate-2 p-6 text-center text-sm text-brand-crema/70">
          Aún no hay productos en esta categoría.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
          {productosDeCategoria.map((producto) => (
            <button
              key={producto.id}
              type="button"
              onClick={() => alElegirProducto(producto)}
              className={cn(
                "flex min-h-12 w-full flex-col gap-2 rounded-clay-md bg-brand-crema p-3 text-left shadow-clay-sm",
                "transition-all duration-150 hover:shadow-clay-md active:shadow-clay-pressed active:translate-y-px",
                "focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2",
              )}
            >
              <div className="flex h-[92px] items-center justify-center overflow-hidden rounded-clay-sm bg-surface-sunken">
                {producto.imagen_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- imagen dinámica de Storage
                  <img
                    src={producto.imagen_url}
                    alt={producto.nombre}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-text-secondary">Sin imagen</span>
                )}
              </div>
              <span className="font-display text-sm font-semibold text-text-primary">{producto.nombre}</span>
              <span className="font-mono text-sm text-text-primary">
                {formatearCOP(BigInt(producto.precio_cop))}
              </span>
            </button>
          ))}
        </div>
      )}

      {productoConModales ? (
        <SelectorModificadores
          producto={productoConModales}
          modificadores={modificadores.filter((m) => m.producto_id === productoConModales.id)}
          onCerrar={() => setProductoConModales(null)}
        />
      ) : null}
    </section>
  );
}
