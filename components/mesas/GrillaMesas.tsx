"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ClayButton } from "@/components/ui/ClayButton";
import { MesaTile } from "@/components/ui/MesaTile";
import { EditorMesa } from "@/components/mesas/EditorMesa";
import type { MesaVista } from "@/components/mesas/tipos";
import type { Database } from "@/lib/supabase/types";

type MesaFila = Database["public"]["Tables"]["mesas"]["Row"];

interface GrillaMesasProps {
  mesasIniciales: MesaVista[];
  sedeId: string;
  puedeEditar: boolean;
}

function ordenarPorNumero(mesas: MesaVista[]): MesaVista[] {
  return [...mesas].sort((a, b) => a.numero - b.numero);
}

function filaAMesaVista(fila: MesaFila): MesaVista {
  return {
    id: fila.id,
    numero: fila.numero,
    nombre: fila.nombre,
    capacidad: fila.capacidad,
    estado: fila.estado,
    activa: fila.activa,
  };
}

/** Parrilla de mesas con actualización en vivo (Supabase Realtime). */
export function GrillaMesas({ mesasIniciales, sedeId, puedeEditar }: GrillaMesasProps) {
  const [mesas, setMesas] = useState<MesaVista[]>(() => ordenarPorNumero(mesasIniciales));
  const [editorAbierto, setEditorAbierto] = useState(false);
  const [mesaSeleccionada, setMesaSeleccionada] = useState<MesaVista | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel(`mesas:sede_${sedeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mesas", filter: `sede_id=eq.${sedeId}` },
        (payload: { eventType: string; new: Partial<MesaFila>; old: Partial<MesaFila> }) => {
          // DELETE nunca ocurre en operación normal (soft delete vía `activa`),
          // pero se ignora por seguridad: `payload.old` puede no traer todas las
          // columnas y no hay nada útil que insertar/actualizar.
          if (payload.eventType === "DELETE") return;
          const fila = payload.new;
          if (!fila.id || fila.numero === undefined || fila.nombre === undefined) return;
          const vista = filaAMesaVista(fila as MesaFila);
          setMesas((actual) =>
            ordenarPorNumero([...actual.filter((mesa) => mesa.id !== vista.id), vista]),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [sedeId]);

  function abrirNueva() {
    setMesaSeleccionada(null);
    setEditorAbierto(true);
  }

  function abrirExistente(mesa: MesaVista) {
    setMesaSeleccionada(mesa);
    setEditorAbierto(true);
  }

  function cerrarEditor() {
    setEditorAbierto(false);
    setMesaSeleccionada(null);
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Mesas de la sede">
      {puedeEditar ? (
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-xl font-semibold text-brand-crema">Mesas</h2>
          <ClayButton type="button" variant="primary" size="sm" onClick={abrirNueva}>
            + Nueva mesa
          </ClayButton>
        </div>
      ) : null}

      {mesas.length === 0 ? (
        <p className="rounded-clay-md bg-brand-chocolate-2 p-6 text-center text-sm text-brand-crema/70">
          Aún no hay mesas registradas.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
          {mesas.map((mesa) => (
            <MesaTile
              key={mesa.id}
              numero={mesa.numero}
              nombre={mesa.nombre}
              capacidad={mesa.capacidad}
              estado={mesa.estado}
              activa={mesa.activa}
              onClick={puedeEditar ? () => abrirExistente(mesa) : undefined}
            />
          ))}
        </div>
      )}

      {puedeEditar && editorAbierto ? (
        <EditorMesa
          key={mesaSeleccionada?.id ?? "nueva"}
          mesa={mesaSeleccionada}
          abierto={editorAbierto}
          onCerrar={cerrarEditor}
        />
      ) : null}
    </section>
  );
}
