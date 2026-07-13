"use client";

import { useState } from "react";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayModal } from "@/components/ui/ClayModal";
import { ClayInput } from "@/components/ui/ClayInput";
import { formatearCOP } from "@/lib/money";
import { cn } from "@/lib/cn";
import { useCarritoStore } from "@/lib/pedido/carritoStore";
import type { ModificadorFila, ProductoFila } from "@/components/menu/types";

interface SelectorModificadoresProps {
  producto: ProductoFila;
  modificadores: ModificadorFila[];
  onCerrar: () => void;
}

const SIN_GRUPO = "__individual";

/** Agrupa modificadores por `grupo`: si todos los de un grupo son
 *  obligatorios, es de selección única (radio, elige 1); si no, es de
 *  selección múltiple (checkbox), respetando el `max_seleccion` de cada
 *  grupo (CLAUDE.md §7). Sin grupo: checkbox individual. */
export function SelectorModificadores({ producto, modificadores, onCerrar }: SelectorModificadoresProps) {
  const agregar = useCarritoStore((estado) => estado.agregar);
  const [seleccionUnica, setSeleccionUnica] = useState<Record<string, string>>({});
  const [seleccionMultiple, setSeleccionMultiple] = useState<Set<string>>(new Set());
  const [cantidad, setCantidad] = useState(1);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);

  const grupos = new Map<string, ModificadorFila[]>();
  for (const mod of modificadores) {
    const clave = mod.grupo ?? SIN_GRUPO;
    grupos.set(clave, [...(grupos.get(clave) ?? []), mod]);
  }
  const gruposRequeridos = [...grupos.entries()].filter(
    ([clave, items]) => clave !== SIN_GRUPO && items.every((m) => m.obligatorio),
  );
  const gruposOpcionales = [...grupos.entries()].filter(
    ([clave, items]) => clave === SIN_GRUPO || !items.every((m) => m.obligatorio),
  );

  /** Cuántas opciones de este grupo pueden marcarse a la vez. Si el grupo
   *  tiene valores de `max_seleccion` inconsistentes entre sus opciones, se
   *  usa el más restrictivo. */
  function maxDelGrupo(items: ModificadorFila[]): number {
    return Math.min(...items.map((m) => m.max_seleccion));
  }

  function contarSeleccionadosEnGrupo(clave: string): number {
    return modificadores.filter(
      (m) => (m.grupo ?? SIN_GRUPO) === clave && seleccionMultiple.has(m.id),
    ).length;
  }

  function alternarMultiple(mod: ModificadorFila, clave: string, limite: number) {
    setSeleccionMultiple((actual) => {
      const copia = new Set(actual);
      if (copia.has(mod.id)) {
        copia.delete(mod.id);
        return copia;
      }
      const seleccionadosEnGrupo = modificadores.filter(
        (m) => (m.grupo ?? SIN_GRUPO) === clave && copia.has(m.id),
      ).length;
      if (seleccionadosEnGrupo >= limite) {
        // Límite del grupo alcanzado (max_seleccion): no se agrega más.
        return copia;
      }
      copia.add(mod.id);
      return copia;
    });
  }

  function confirmar() {
    const faltante = gruposRequeridos.find(([clave]) => !seleccionUnica[clave]);
    if (faltante) {
      setError(`Elige una opción de "${faltante[0]}"`);
      return;
    }
    const idsElegidos = [...Object.values(seleccionUnica), ...seleccionMultiple];
    const modsElegidos = modificadores
      .filter((m) => idsElegidos.includes(m.id))
      .map((m) => ({
        modificadorId: m.id,
        nombre: m.nombre,
        precioDeltaPesos: Math.round(m.precio_delta_cop / 100),
      }));
    agregar({
      productoId: producto.id,
      nombre: producto.nombre,
      precioUnitPesos: Math.round(producto.precio_cop / 100),
      cantidad,
      modificadores: modsElegidos,
      nota: nota.trim(),
    });
    onCerrar();
  }

  return (
    <ClayModal abierto titulo={producto.nombre} onCerrar={onCerrar}>
      <div className="flex flex-col gap-4">
        {[...gruposRequeridos, ...gruposOpcionales].map(([clave, items]) => {
          const esRadio = gruposRequeridos.some(([c]) => c === clave);
          const limite = maxDelGrupo(items);
          const seleccionadosEnGrupo = contarSeleccionadosEnGrupo(clave);
          return (
            <fieldset key={clave} className="flex flex-col gap-2">
              <legend className="font-display text-sm font-medium text-text-primary">
                {clave === SIN_GRUPO ? "Adicionales" : clave}
                {esRadio ? " (elige 1)" : limite > 1 ? ` (máx. ${limite})` : ""}
              </legend>
              {items.map((mod) => {
                const marcado = esRadio ? seleccionUnica[clave] === mod.id : seleccionMultiple.has(mod.id);
                const limiteAlcanzado = !esRadio && !marcado && seleccionadosEnGrupo >= limite;
                return (
                  <label
                    key={mod.id}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-clay-sm bg-surface-sunken px-3 py-2 text-sm text-text-primary",
                      limiteAlcanzado && "opacity-50",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type={esRadio ? "radio" : "checkbox"}
                        name={esRadio ? clave : undefined}
                        checked={marcado}
                        disabled={limiteAlcanzado}
                        onChange={() =>
                          esRadio
                            ? setSeleccionUnica((actual) => ({ ...actual, [clave]: mod.id }))
                            : alternarMultiple(mod, clave, limite)
                        }
                        className="size-4 accent-brand-mostaza"
                      />
                      {mod.nombre}
                    </span>
                    {mod.precio_delta_cop > 0 ? (
                      <span className="font-mono text-xs text-text-secondary">
                        +{formatearCOP(BigInt(mod.precio_delta_cop))}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </fieldset>
          );
        })}

        <ClayInput
          label="Cantidad"
          type="number"
          inputMode="numeric"
          min={1}
          max={50}
          value={cantidad}
          onChange={(evento) => setCantidad(Math.max(1, Number(evento.target.value) || 1))}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="nota-producto" className="font-display text-sm font-medium text-text-primary">
            Nota (opcional)
          </label>
          <textarea
            id="nota-producto"
            rows={2}
            placeholder="Ej: sin cebolla"
            value={nota}
            onChange={(evento) => setNota(evento.target.value)}
            className="resize-none rounded-clay-md bg-surface-sunken px-4 py-3 text-base text-text-primary shadow-clay-pressed placeholder:text-text-secondary/60 focus-visible:outline-3 focus-visible:outline-brand-mostaza"
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-brand-tomate-2">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-3">
          <ClayButton
            type="button"
            variant="ghost"
            className="text-text-primary hover:bg-brand-crema-2"
            onClick={onCerrar}
          >
            Cancelar
          </ClayButton>
          <ClayButton type="button" variant="primary" onClick={confirmar}>
            Agregar al carrito
          </ClayButton>
        </div>
      </div>
    </ClayModal>
  );
}
