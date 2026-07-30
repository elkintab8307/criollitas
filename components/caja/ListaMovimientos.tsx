"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClayBadge } from "@/components/ui/ClayBadge";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayInput } from "@/components/ui/ClayInput";
import { ClayModal } from "@/components/ui/ClayModal";
import { formatearCOP } from "@/lib/money";
import { formatearHora } from "@/lib/dates";
import { movimientoSchema, type MovimientoInput } from "@/lib/validations/turno";
import { editarMovimiento, eliminarMovimiento } from "@/app/(cajera)/turno/actions";

const ETIQUETA_TIPO: Record<MovimientoInput["tipo"], string> = {
  retiro: "Retiro",
  gasto: "Gasto",
  ingreso_extra: "Ingreso extra",
};

export interface MovimientoVista {
  id: string;
  tipo: MovimientoInput["tipo"];
  concepto: string;
  montoCop: number;
  creadoEn: string;
}

interface FilaMovimientoProps {
  movimiento: MovimientoVista;
}

function FilaMovimiento({ movimiento }: FilaMovimientoProps) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [eliminarAbierto, setEliminarAbierto] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MovimientoInput>({
    resolver: zodResolver(movimientoSchema),
    defaultValues: {
      tipo: movimiento.tipo,
      concepto: movimiento.concepto,
      montoPesos: movimiento.montoCop / 100,
    },
  });

  const onSubmit = handleSubmit(async (datos) => {
    setErrorGeneral(null);
    const resultado = await editarMovimiento(movimiento.id, datos);
    if (!resultado.ok) {
      setErrorGeneral(resultado.error.mensaje);
      return;
    }
    setEditando(false);
    router.refresh();
  });

  async function confirmarEliminar() {
    setEliminando(true);
    setErrorGeneral(null);
    const resultado = await eliminarMovimiento(movimiento.id);
    setEliminando(false);
    if (!resultado.ok) {
      setErrorGeneral(resultado.error.mensaje);
      setEliminarAbierto(false);
      return;
    }
    setEliminarAbierto(false);
    router.refresh();
  }

  if (editando) {
    return (
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-3 rounded-clay-md bg-brand-crema-2 p-3 text-sm text-brand-chocolate"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`tipo-${movimiento.id}`} className="font-display text-xs font-medium text-text-primary">
            Tipo de movimiento
          </label>
          <select
            id={`tipo-${movimiento.id}`}
            className="h-10 rounded-clay-sm bg-surface-sunken px-3 text-sm text-text-primary shadow-clay-pressed"
            {...register("tipo")}
          >
            {(Object.keys(ETIQUETA_TIPO) as MovimientoInput["tipo"][]).map((tipo) => (
              <option key={tipo} value={tipo}>
                {ETIQUETA_TIPO[tipo]}
              </option>
            ))}
          </select>
        </div>
        <ClayInput label="Concepto" error={errors.concepto?.message} {...register("concepto")} />
        <ClayInput
          label="Monto (pesos)"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          error={errors.montoPesos?.message}
          {...register("montoPesos", { valueAsNumber: true })}
        />
        {errorGeneral ? (
          <p role="alert" className="text-sm text-brand-tomate-2">
            {errorGeneral}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <ClayButton type="button" variant="ghost" size="sm" onClick={() => setEditando(false)}>
            Cancelar
          </ClayButton>
          <ClayButton type="submit" variant="primary" size="sm" disabled={isSubmitting}>
            {isSubmitting ? "Guardando…" : "Guardar cambios"}
          </ClayButton>
        </div>
      </form>
    );
  }

  const esEntrada = movimiento.tipo === "ingreso_extra";
  return (
    <div className="flex flex-col gap-2 rounded-clay-md bg-brand-crema-2 p-3 text-sm text-brand-chocolate">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <ClayBadge variant={esEntrada ? "exito" : "peligro"}>{ETIQUETA_TIPO[movimiento.tipo]}</ClayBadge>
            <span className="text-xs text-brand-chocolate/60">{formatearHora(new Date(movimiento.creadoEn))}</span>
          </div>
          <p className="font-medium">{movimiento.concepto}</p>
        </div>
        <p className={`font-mono font-semibold ${esEntrada ? "text-brand-verde-2" : "text-brand-tomate-2"}`}>
          {esEntrada ? "+" : "-"}
          {formatearCOP(BigInt(movimiento.montoCop))}
        </p>
      </div>
      {errorGeneral ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {errorGeneral}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <ClayButton type="button" variant="ghost" size="sm" onClick={() => setEditando(true)}>
          Editar
        </ClayButton>
        <ClayButton type="button" variant="destructive" size="sm" onClick={() => setEliminarAbierto(true)}>
          Eliminar
        </ClayButton>
      </div>

      <ClayModal abierto={eliminarAbierto} titulo="Eliminar movimiento" onCerrar={() => setEliminarAbierto(false)}>
        <p className="text-sm text-text-secondary">
          Se eliminará el {ETIQUETA_TIPO[movimiento.tipo].toLowerCase()} de{" "}
          <span className="font-mono font-semibold">{formatearCOP(BigInt(movimiento.montoCop))}</span> (
          {movimiento.concepto}). Esta acción no se puede deshacer.
        </p>
        <div className="mt-4 flex justify-end gap-3">
          <ClayButton type="button" variant="ghost" onClick={() => setEliminarAbierto(false)}>
            Volver
          </ClayButton>
          <ClayButton type="button" variant="destructive" disabled={eliminando} onClick={confirmarEliminar}>
            {eliminando ? "Eliminando…" : "Eliminar"}
          </ClayButton>
        </div>
      </ClayModal>
    </div>
  );
}

interface ListaMovimientosProps {
  movimientos: MovimientoVista[];
}

/** Lista de movimientos de caja del turno con edición y eliminación en
 *  línea (pedido del usuario) -- solo posible mientras el turno sigue
 *  abierto; el servidor (RLS) es quien realmente lo exige, esta lista
 *  solo muestra el mensaje de error si igual se intenta tras cerrar. */
export function ListaMovimientos({ movimientos }: ListaMovimientosProps) {
  if (movimientos.length === 0) {
    return <p className="text-sm text-text-secondary">Sin movimientos en este turno todavía.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {movimientos.map((m) => (
        <FilaMovimiento key={m.id} movimiento={m} />
      ))}
    </div>
  );
}
