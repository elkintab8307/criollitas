"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cambiarActivoModificador, guardarModificador } from "@/app/(admin)/menu/actions";
import { modificadorSchema, type ModificadorInput } from "@/lib/validations/menu";
import { formatearCOP } from "@/lib/money";
import { ClayBadge } from "@/components/ui/ClayBadge";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayInput } from "@/components/ui/ClayInput";
import type { ModificadorFila } from "@/components/menu/types";

const SIN_GRUPO = "Opcionales";

interface EditorModificadoresProps {
  productoId: string;
  modificadores: ModificadorFila[];
}

/** Sección de modificadores dentro de EditorProducto: solo aplica a productos ya guardados. */
export function EditorModificadores({ productoId, modificadores }: EditorModificadoresProps) {
  const router = useRouter();
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);
  const [errorCambio, setErrorCambio] = useState<string | null>(null);
  const [modificadorEditando, setModificadorEditando] = useState<ModificadorFila | null>(null);

  const grupos = new Map<string, ModificadorFila[]>();
  for (const modificador of modificadores) {
    const clave = modificador.grupo ?? SIN_GRUPO;
    grupos.set(clave, [...(grupos.get(clave) ?? []), modificador]);
  }

  async function alternarActivo(modificador: ModificadorFila) {
    setErrorCambio(null);
    setCambiandoId(modificador.id);
    const resultado = await cambiarActivoModificador(modificador.id, !modificador.activo);
    setCambiandoId(null);
    if (!resultado.ok) {
      setErrorCambio(resultado.error.mensaje);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 rounded-clay-md bg-surface-sunken p-4">
      <h3 className="font-display text-base font-semibold text-text-primary">Modificadores</h3>

      {errorCambio ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {errorCambio}
        </p>
      ) : null}

      {modificadores.length === 0 ? (
        <p className="text-sm text-text-secondary">Este producto todavía no tiene modificadores.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {Array.from(grupos.entries()).map(([grupo, filas]) => (
            <div key={grupo} className="flex flex-col gap-2">
              <span className="font-display text-sm font-medium text-text-secondary">{grupo}</span>
              <ul className="flex flex-col gap-2">
                {filas.map((modificador) => (
                  <li
                    key={modificador.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-clay-sm bg-surface-elevated px-3 py-2 shadow-clay-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">{modificador.nombre}</span>
                      <span className="font-mono text-sm text-text-secondary">
                        {modificador.precio_delta_cop > 0
                          ? `+${formatearCOP(BigInt(modificador.precio_delta_cop))}`
                          : "sin costo"}
                      </span>
                      {modificador.obligatorio ? (
                        <ClayBadge variant="alerta">Obligatorio</ClayBadge>
                      ) : null}
                      {!modificador.activo ? <ClayBadge variant="peligro">Inactivo</ClayBadge> : null}
                    </div>
                    <div className="flex gap-2">
                      <ClayButton
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setModificadorEditando(modificador)}
                      >
                        Editar
                      </ClayButton>
                      <ClayButton
                        type="button"
                        variant={modificador.activo ? "destructive" : "success"}
                        size="sm"
                        disabled={cambiandoId === modificador.id}
                        onClick={() => alternarActivo(modificador)}
                      >
                        {modificador.activo ? "Desactivar" : "Reactivar"}
                      </ClayButton>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <FormularioModificador
        key={modificadorEditando?.id ?? productoId}
        productoId={productoId}
        modificador={modificadorEditando}
        onGuardado={() => {
          setModificadorEditando(null);
          router.refresh();
        }}
        onCancelarEdicion={modificadorEditando ? () => setModificadorEditando(null) : undefined}
      />
    </div>
  );
}

interface FormularioModificadorProps {
  productoId: string;
  /** Modificador a editar, o `null` para el formulario de alta. */
  modificador: ModificadorFila | null;
  onGuardado: () => void;
  onCancelarEdicion?: () => void;
}

function FormularioModificador({
  productoId,
  modificador,
  onGuardado,
  onCancelarEdicion,
}: FormularioModificadorProps) {
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ModificadorInput>({
    resolver: zodResolver(modificadorSchema),
    defaultValues: modificador
      ? {
          productoId,
          grupo: modificador.grupo ?? "",
          nombre: modificador.nombre,
          deltaPesos: modificador.precio_delta_cop,
          obligatorio: modificador.obligatorio,
          maxSeleccion: modificador.max_seleccion,
        }
      : {
          productoId,
          grupo: "",
          nombre: "",
          deltaPesos: 0,
          obligatorio: false,
          maxSeleccion: 1,
        },
  });

  const onSubmit = handleSubmit(async (datos) => {
    setErrorGeneral(null);
    // El modificador siempre se guarda contra su propio producto: en edición
    // se manda el id, pero productoId sale del campo oculto de este mismo
    // formulario (nunca del modificador previo, que podría no coincidir).
    const resultado = await guardarModificador(
      modificador ? { ...datos, id: modificador.id } : datos,
    );
    if (!resultado.ok) {
      setErrorGeneral(resultado.error.mensaje);
      return;
    }
    if (modificador) {
      onGuardado();
      return;
    }
    reset({
      productoId,
      grupo: "",
      nombre: "",
      deltaPesos: 0,
      obligatorio: false,
      maxSeleccion: 1,
    });
    onGuardado();
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 border-t border-(--border-soft) pt-4" noValidate>
      <input type="hidden" {...register("productoId")} />
      <span className="font-display text-sm font-medium text-text-primary">
        {modificador ? `Editar "${modificador.nombre}"` : "Agregar modificador"}
      </span>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ClayInput
          label="Nombre"
          placeholder="Ej: Extra queso"
          error={errors.nombre?.message}
          {...register("nombre")}
        />
        <ClayInput
          label="Grupo (opcional)"
          placeholder="Ej: Adicionales"
          error={errors.grupo?.message}
          {...register("grupo", {
            setValueAs: (v) => (typeof v === "string" && v.trim() === "" ? undefined : v?.trim()),
          })}
        />
        <ClayInput
          label="Valor adicional (COP)"
          type="number"
          inputMode="numeric"
          min={0}
          step={100}
          error={errors.deltaPesos?.message}
          {...register("deltaPesos", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
        />
        <ClayInput
          label="Máximo a seleccionar"
          type="number"
          inputMode="numeric"
          min={1}
          error={errors.maxSeleccion?.message}
          {...register("maxSeleccion", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-text-primary">
        <input
          type="checkbox"
          className="h-4 w-4 accent-brand-mostaza"
          {...register("obligatorio")}
        />
        Obligatorio
      </label>
      {errorGeneral ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {errorGeneral}
        </p>
      ) : null}
      <div className="flex gap-3">
        <ClayButton type="submit" variant="secondary" size="sm" disabled={isSubmitting} className="self-start">
          {isSubmitting
            ? "Guardando…"
            : modificador
              ? "Guardar cambios"
              : "Agregar modificador"}
        </ClayButton>
        {onCancelarEdicion ? (
          <ClayButton
            type="button"
            variant="ghost"
            size="sm"
            className="self-start text-text-primary hover:bg-brand-crema-2"
            onClick={onCancelarEdicion}
          >
            Cancelar
          </ClayButton>
        ) : null}
      </div>
    </form>
  );
}
