"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { crearPedidoDomicilio, entrarPedidoDeMesa } from "@/app/(vendedora)/inicio/actions";
import { clienteDomicilioSchema, type ClienteDomicilioInput } from "@/lib/validations/pedido";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayCard } from "@/components/ui/ClayCard";
import { ClayInput } from "@/components/ui/ClayInput";
import { ClayModal } from "@/components/ui/ClayModal";
import { GrillaMesas } from "@/components/mesas/GrillaMesas";
import { cn } from "@/lib/cn";
import type { MesaVista } from "@/components/mesas/tipos";

interface SelectorOrigenProps {
  mesasIniciales: MesaVista[];
  sedeId: string;
}

/** Orígenes de un pedido nuevo: mesa, o "Para llevar" -- que abre un solo
 *  formulario de cliente con dos casillas excluyentes (para llevar /
 *  domicilio, decisión del usuario: antes eran dos botones separados).
 *  Tocar una mesa libre navega directo a /pedido/nuevo -- ningún pedido se
 *  crea hasta que se confirme el primer producto (Bloque A). Una mesa
 *  ocupada por la propia vendedora sí tiene un pedido real que retomar
 *  (entrarPedidoDeMesa). */
export function SelectorOrigen({ mesasIniciales, sedeId }: SelectorOrigenProps) {
  const router = useRouter();
  const [modalClienteAbierto, setModalClienteAbierto] = useState(false);
  const [entrandoMesa, setEntrandoMesa] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function alSeleccionarMesa(mesa: MesaVista) {
    if (mesa.estado === "libre") {
      router.push(`/pedido/nuevo?mesaId=${mesa.id}`);
      return;
    }
    if (entrandoMesa) return;
    setError(null);
    setEntrandoMesa(true);
    const resultado = await entrarPedidoDeMesa(mesa.id);
    setEntrandoMesa(false);
    if (!resultado.ok) {
      setError(resultado.error.mensaje);
      return;
    }
    router.push(`/pedido/${resultado.valor.pedidoId}`);
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {error}
        </p>
      ) : null}

      <ClayCard variant="flat">
        <h2 className="mb-4 font-display text-xl font-semibold text-text-primary">Mesa</h2>
        <div className={entrandoMesa ? "pointer-events-none opacity-60" : undefined}>
          <GrillaMesas
            mesasIniciales={mesasIniciales}
            sedeId={sedeId}
            puedeEditar={false}
            modo="seleccion"
            onSeleccionarMesa={alSeleccionarMesa}
          />
        </div>
      </ClayCard>

      <div className="flex flex-wrap gap-4">
        <ClayButton type="button" variant="secondary" size="lg" onClick={() => setModalClienteAbierto(true)}>
          Para llevar
        </ClayButton>
      </div>

      <FormularioCliente
        abierto={modalClienteAbierto}
        onCerrar={() => setModalClienteAbierto(false)}
        onContinuar={(canal, clienteId) =>
          router.push(clienteId ? `/pedido/nuevo?canal=${canal}&clienteId=${clienteId}` : `/pedido/nuevo?canal=${canal}`)
        }
      />
    </div>
  );
}

type CanalCliente = "llevar" | "domicilio";

interface FormularioClienteProps {
  abierto: boolean;
  onCerrar: () => void;
  onContinuar: (canal: CanalCliente, clienteId: string | null) => void;
}

function FormularioCliente({ abierto, onCerrar, onContinuar }: FormularioClienteProps) {
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [canal, setCanal] = useState<CanalCliente>("llevar");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClienteDomicilioInput>({ resolver: zodResolver(clienteDomicilioSchema) });

  function cerrar() {
    reset();
    setErrorGeneral(null);
    setCanal("llevar");
    onCerrar();
  }

  const onSubmit = handleSubmit(async (datos) => {
    setErrorGeneral(null);

    // Sin conexión no se puede guardar el cliente (Server Action). Para
    // llevar sigue funcionando sin datos de cliente (limitación aceptada,
    // misma del Bloque J3d); domicilio sí exige el cliente guardado.
    if (useConectividadStore.getState().estado === "offline") {
      if (canal === "domicilio") {
        setErrorGeneral("Los pedidos a domicilio necesitan internet para guardar los datos del cliente.");
        return;
      }
      reset();
      onContinuar("llevar", null);
      return;
    }

    const resultado = await crearPedidoDomicilio(datos);
    if (!resultado.ok) {
      setErrorGeneral(resultado.error.mensaje);
      return;
    }
    reset();
    onContinuar(canal, resultado.valor.clienteId);
  });

  return (
    <ClayModal abierto={abierto} titulo="Datos del pedido" onCerrar={cerrar}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <ClayInput
          label="Nombre"
          placeholder="Ej: María Pérez"
          error={errors.nombre?.message}
          {...register("nombre")}
        />
        <ClayInput
          label="Celular (opcional)"
          type="tel"
          placeholder="Ej: 3211234567"
          error={errors.telefono?.message}
          {...register("telefono")}
        />
        <ClayInput
          label="Dirección (opcional)"
          placeholder="Ej: Cra 14 # 8-28"
          error={errors.direccion?.message}
          {...register("direccion")}
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="font-display text-sm font-medium text-text-primary">Tipo de pedido</legend>
          <div className="flex flex-wrap gap-4">
            <CasillaCanal
              etiqueta="Para llevar"
              activa={canal === "llevar"}
              onActivar={() => setCanal("llevar")}
            />
            <CasillaCanal
              etiqueta="Domicilio"
              activa={canal === "domicilio"}
              onActivar={() => setCanal("domicilio")}
            />
          </div>
        </fieldset>

        {errorGeneral ? (
          <p role="alert" className="text-sm text-brand-tomate-2">
            {errorGeneral}
          </p>
        ) : null}
        <div className="flex justify-end gap-3">
          <ClayButton
            type="button"
            variant="ghost"
            className="text-text-primary hover:bg-brand-crema-2"
            onClick={cerrar}
          >
            Cancelar
          </ClayButton>
          <ClayButton type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? "Creando…" : "Continuar"}
          </ClayButton>
        </div>
      </form>
    </ClayModal>
  );
}

interface CasillaCanalProps {
  etiqueta: string;
  activa: boolean;
  onActivar: () => void;
}

/** Casilla de elección excluyente (solo una puede estar activa): checkbox
 *  visual con comportamiento de grupo de radio, como pidió el usuario.
 *  role="radio" para que los lectores de pantalla anuncien la exclusión. */
function CasillaCanal({ etiqueta, activa, onActivar }: CasillaCanalProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={activa}
      onClick={onActivar}
      className={cn(
        "flex min-h-12 items-center gap-3 rounded-clay-md px-4 py-2 shadow-clay-sm transition-all duration-150",
        "focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2",
        activa ? "bg-brand-mostaza" : "bg-surface-sunken hover:bg-brand-crema-2",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-5 items-center justify-center rounded-md border-2",
          activa ? "border-brand-chocolate bg-brand-chocolate text-brand-mostaza" : "border-brand-chocolate/40 bg-brand-crema",
        )}
      >
        {activa ? "✓" : ""}
      </span>
      <span className="font-display text-sm font-semibold text-text-primary">{etiqueta}</span>
    </button>
  );
}
