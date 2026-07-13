"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { crearPedidoDomicilio, crearPedidoLlevar, crearPedidoMesa } from "@/app/(vendedora)/inicio/actions";
import { clienteDomicilioSchema, type ClienteDomicilioInput } from "@/lib/validations/pedido";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayCard } from "@/components/ui/ClayCard";
import { ClayInput } from "@/components/ui/ClayInput";
import { ClayModal } from "@/components/ui/ClayModal";
import { GrillaMesas } from "@/components/mesas/GrillaMesas";
import type { MesaVista } from "@/components/mesas/tipos";

interface SelectorOrigenProps {
  mesasIniciales: MesaVista[];
  sedeId: string;
}

/** Los tres orígenes de un pedido nuevo: mesa, domicilio, para llevar. */
export function SelectorOrigen({ mesasIniciales, sedeId }: SelectorOrigenProps) {
  const router = useRouter();
  const [modalDomicilioAbierto, setModalDomicilioAbierto] = useState(false);
  const [creandoLlevar, setCreandoLlevar] = useState(false);
  const [creandoMesa, setCreandoMesa] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function alSeleccionarMesa(mesa: MesaVista) {
    if (creandoMesa) return;
    setError(null);
    setCreandoMesa(true);
    const resultado = await crearPedidoMesa(mesa.id);
    if (!resultado.ok) {
      setCreandoMesa(false);
      setError(resultado.error.mensaje);
      return;
    }
    router.push(`/pedido/${resultado.valor.pedidoId}`);
  }

  async function alCrearLlevar() {
    setError(null);
    setCreandoLlevar(true);
    const resultado = await crearPedidoLlevar();
    setCreandoLlevar(false);
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
        <div className={creandoMesa ? "pointer-events-none opacity-60" : undefined}>
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
        <ClayButton
          type="button"
          variant="secondary"
          size="lg"
          onClick={() => setModalDomicilioAbierto(true)}
        >
          Domicilio
        </ClayButton>
        <ClayButton type="button" variant="secondary" size="lg" disabled={creandoLlevar} onClick={alCrearLlevar}>
          {creandoLlevar ? "Creando…" : "Para llevar"}
        </ClayButton>
      </div>

      <FormularioDomicilio
        abierto={modalDomicilioAbierto}
        onCerrar={() => setModalDomicilioAbierto(false)}
        onCreado={(pedidoId) => router.push(`/pedido/${pedidoId}`)}
      />
    </div>
  );
}

interface FormularioDomicilioProps {
  abierto: boolean;
  onCerrar: () => void;
  onCreado: (pedidoId: string) => void;
}

function FormularioDomicilio({ abierto, onCerrar, onCreado }: FormularioDomicilioProps) {
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClienteDomicilioInput>({ resolver: zodResolver(clienteDomicilioSchema) });

  function cerrar() {
    reset();
    setErrorGeneral(null);
    onCerrar();
  }

  const onSubmit = handleSubmit(async (datos) => {
    setErrorGeneral(null);
    const resultado = await crearPedidoDomicilio(datos);
    if (!resultado.ok) {
      setErrorGeneral(resultado.error.mensaje);
      return;
    }
    reset();
    onCreado(resultado.valor.pedidoId);
  });

  return (
    <ClayModal abierto={abierto} titulo="Pedido a domicilio" onCerrar={cerrar}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <ClayInput
          label="Nombre"
          placeholder="Ej: María Pérez"
          error={errors.nombre?.message}
          {...register("nombre")}
        />
        <ClayInput
          label="Teléfono"
          type="tel"
          placeholder="Ej: 3211234567"
          error={errors.telefono?.message}
          {...register("telefono")}
        />
        <ClayInput
          label="Dirección"
          placeholder="Ej: Cra 14 # 8-28"
          error={errors.direccion?.message}
          {...register("direccion")}
        />
        <ClayInput
          label="Referencia (opcional)"
          placeholder="Ej: portón verde"
          error={errors.referencia?.message}
          {...register("referencia")}
        />
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
            {isSubmitting ? "Creando…" : "Crear pedido"}
          </ClayButton>
        </div>
      </form>
    </ClayModal>
  );
}
