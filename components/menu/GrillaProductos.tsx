"use client";

import { formatearCOP } from "@/lib/money";
import { ClayBadge } from "@/components/ui/ClayBadge";
import { ClayButton } from "@/components/ui/ClayButton";
import { cn } from "@/lib/cn";
import type { CategoriaFila, ProductoFila } from "@/components/menu/types";

interface GrillaProductosProps {
  productos: ProductoFila[];
  categoriaSeleccionada: CategoriaFila | null;
  onSeleccionarProducto: (producto: ProductoFila) => void;
  onNuevoProducto: () => void;
}

/** Baldosas de ~160px con imagen, nombre y precio; densidad admin (CLAUDE.md §8.4). */
export function GrillaProductos({
  productos,
  categoriaSeleccionada,
  onSeleccionarProducto,
  onNuevoProducto,
}: GrillaProductosProps) {
  return (
    <section className="flex flex-col gap-4" aria-label="Productos de la categoría">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-xl font-semibold text-brand-crema">
          {categoriaSeleccionada ? categoriaSeleccionada.nombre : "Productos"}
        </h2>
        <ClayButton
          type="button"
          variant="primary"
          size="sm"
          disabled={!categoriaSeleccionada}
          onClick={onNuevoProducto}
        >
          + Nuevo producto
        </ClayButton>
      </div>

      {productos.length === 0 ? (
        <p className="rounded-clay-md bg-brand-chocolate-2 p-6 text-center text-sm text-brand-crema/70">
          Aún no hay productos en esta categoría.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
          {productos.map((producto) => (
            <button
              key={producto.id}
              type="button"
              onClick={() => onSeleccionarProducto(producto)}
              className={cn(
                "flex w-full flex-col gap-2 rounded-clay-md bg-brand-crema p-3 text-left shadow-clay-sm",
                "transition-all duration-150 hover:shadow-clay-md active:shadow-clay-pressed active:translate-y-px",
                "focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2",
                !producto.activo && "opacity-80",
              )}
            >
              <div className="flex h-[92px] items-center justify-center overflow-hidden rounded-clay-sm bg-surface-sunken">
                {producto.imagen_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- imagen dinámica de Storage, sin dominio fijo para next/image
                  <img
                    src={producto.imagen_url}
                    alt={producto.nombre}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-text-secondary">Sin imagen</span>
                )}
              </div>
              <span className="font-display text-sm font-semibold text-text-primary">
                {producto.nombre}
              </span>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm text-text-primary">
                  {formatearCOP(BigInt(producto.precio_cop))}
                </span>
                {!producto.activo ? <ClayBadge variant="alerta">Inactivo</ClayBadge> : null}
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
