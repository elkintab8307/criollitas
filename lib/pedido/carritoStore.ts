"use client";

import { create } from "zustand";

export interface ModificadorSeleccionado {
  modificadorId: string;
  nombre: string;
  precioDeltaPesos: number;
}

export interface ItemCarrito {
  clave: string;
  productoId: string;
  nombre: string;
  precioUnitPesos: number;
  cantidad: number;
  modificadores: ModificadorSeleccionado[];
  nota: string;
}

interface CarritoState {
  items: ItemCarrito[];
  agregar: (item: Omit<ItemCarrito, "clave">) => void;
  quitar: (clave: string) => void;
  cambiarCantidad: (clave: string, cantidad: number) => void;
  cambiarNota: (clave: string, nota: string) => void;
  vaciar: () => void;
}

/** Carrito de pedido en curso: estado UI local del cliente (CLAUDE.md §3),
 *  nunca la fuente de verdad de precios — se recalculan siempre en el
 *  servidor al confirmar. */
export const useCarritoStore = create<CarritoState>((set) => ({
  items: [],
  agregar: (item) =>
    set((state) => ({ items: [...state.items, { ...item, clave: crypto.randomUUID() }] })),
  quitar: (clave) => set((state) => ({ items: state.items.filter((i) => i.clave !== clave) })),
  cambiarCantidad: (clave, cantidad) =>
    set((state) => ({
      items: state.items.map((i) => (i.clave === clave ? { ...i, cantidad } : i)),
    })),
  cambiarNota: (clave, nota) =>
    set((state) => ({ items: state.items.map((i) => (i.clave === clave ? { ...i, nota } : i)) })),
  vaciar: () => set({ items: [] }),
}));
