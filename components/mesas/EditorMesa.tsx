"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { cambiarActivaMesa, crearMesa, editarMesa } from "@/app/(admin)/mesas/actions";
import { mesaSchema, type MesaInput } from "@/lib/validations/mesas";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayInput } from "@/components/ui/ClayInput";
import { ClayModal } from "@/components/ui/ClayModal";
import type { MesaVista } from "@/components/mesas/tipos";

// `activa` tiene `.default(true)` en el schema: el tipo de entrada (antes de
// parsear) lo trata como opcional, pero `MesaInput` (z.infer, tipo de salida)
// lo exige siempre presente. useForm necesita el tipo de entrada para los
// campos del formulario y el de salida para lo que recibe onSubmit.
type MesaFormValues = z.input<typeof mesaSchema>;

interface EditorMesaProps {
  mesa: MesaVista | null;
  abierto: boolean;
  onCerrar: () => void;
}

/** Modal de alta/edición de mesa: número, nombre, capacidad y activar/desactivar. */
export function EditorMesa({ mesa, abierto, onCerrar }: EditorMesaProps) {
  const router = useRouter();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [confirmandoDesactivar, setConfirmandoDesactivar] = useState(false);
  const [cambiandoActiva, setCambiandoActiva] = useState(false);
  const [errorActiva, setErrorActiva] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MesaFormValues, unknown, MesaInput>({
    resolver: zodResolver(mesaSchema),
    defaultValues: {
      numero: mesa?.numero ?? undefined,
      nombre: mesa?.nombre ?? "",
      capacidad: mesa?.capacidad ?? undefined,
      activa: mesa?.activa ?? true,
    },
  });

  const onSubmit = handleSubmit(async (datos) => {
    setErrorGeneral(null);
    const resultado = mesa ? await editarMesa(mesa.id, datos) : await crearMesa(datos);
    if (!resultado.ok) {
      setErrorGeneral(resultado.error.mensaje);
      return;
    }
    router.refresh();
    onCerrar();
  });

  async function confirmarDesactivar() {
    if (!mesa) return;
    setErrorActiva(null);
    setCambiandoActiva(true);
    const resultado = await cambiarActivaMesa(mesa.id, false);
    setCambiandoActiva(false);
    if (!resultado.ok) {
      setErrorActiva(resultado.error.mensaje);
      return;
    }
    setConfirmandoDesactivar(false);
    router.refresh();
    onCerrar();
  }

  async function reactivar() {
    if (!mesa) return;
    setErrorActiva(null);
    setCambiandoActiva(true);
    const resultado = await cambiarActivaMesa(mesa.id, true);
    setCambiandoActiva(false);
    if (!resultado.ok) {
      setErrorActiva(resultado.error.mensaje);
      return;
    }
    router.refresh();
    onCerrar();
  }

  return (
    <ClayModal
      abierto={abierto}
      titulo={mesa ? `Editar mesa ${mesa.numero}` : "Nueva mesa"}
      onCerrar={onCerrar}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ClayInput
            label="Número"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            error={errors.numero?.message}
            {...register("numero", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
          />
          <ClayInput
            label="Capacidad (personas)"
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            step={1}
            error={errors.capacidad?.message}
            {...register("capacidad", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
          />
        </div>

        <ClayInput
          label="Nombre (opcional)"
          placeholder="Ej: Terraza, Ventana…"
          error={errors.nombre?.message}
          {...register("nombre", {
            setValueAs: (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
          })}
        />

        {errorGeneral ? (
          <p role="alert" className="text-sm text-brand-tomate-2">
            {errorGeneral}
          </p>
        ) : null}

        {mesa && confirmandoDesactivar ? (
          <div className="flex flex-col gap-3 rounded-clay-md bg-surface-sunken p-4">
            <p className="text-sm text-text-secondary">
              La mesa deja de aparecer, pero conserva su historial.
            </p>
            {errorActiva ? (
              <p role="alert" className="text-sm text-brand-tomate-2">
                {errorActiva}
              </p>
            ) : null}
            <div className="flex gap-3">
              <ClayButton
                type="button"
                variant="destructive"
                size="sm"
                disabled={cambiandoActiva}
                onClick={confirmarDesactivar}
              >
                {cambiandoActiva ? "Desactivando…" : "Sí, desactivar"}
              </ClayButton>
              <ClayButton
                type="button"
                variant="ghost"
                size="sm"
                className="text-text-primary hover:bg-brand-crema-2"
                onClick={() => setConfirmandoDesactivar(false)}
              >
                No, cancelar
              </ClayButton>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div>
            {mesa && !confirmandoDesactivar ? (
              mesa.activa ? (
                <ClayButton
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmandoDesactivar(true)}
                >
                  Desactivar
                </ClayButton>
              ) : (
                <>
                  <ClayButton
                    type="button"
                    variant="success"
                    size="sm"
                    disabled={cambiandoActiva}
                    onClick={reactivar}
                  >
                    {cambiandoActiva ? "Reactivando…" : "Reactivar"}
                  </ClayButton>
                  {errorActiva ? (
                    <p role="alert" className="mt-2 text-sm text-brand-tomate-2">
                      {errorActiva}
                    </p>
                  ) : null}
                </>
              )
            ) : null}
          </div>
          <div className="flex gap-3">
            <ClayButton
              type="button"
              variant="ghost"
              className="text-text-primary hover:bg-brand-crema-2"
              onClick={onCerrar}
            >
              Cancelar
            </ClayButton>
            <ClayButton type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? "Guardando…" : "Guardar"}
            </ClayButton>
          </div>
        </div>
      </form>
    </ClayModal>
  );
}
