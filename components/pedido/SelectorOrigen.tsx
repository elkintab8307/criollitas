"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { crearPedidoDomicilio, entrarPedidoDeMesa } from "@/app/(vendedora)/inicio/actions";
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

/** Los tres orígenes de un pedido nuevo: mesa, domicilio, para llevar. Tocar
 *  una mesa libre o "Para llevar" navega directo a /pedido/nuevo -- ningún
 *  pedido se crea hasta que se confirme el primer producto (Bloque A). Una
 *  mesa ocupada por la propia vendedora sí tiene un pedido real que
 *  retomar (entrarPedidoDeMesa). */
export function SelectorOrigen({ mesasIniciales, sedeId }: SelectorOrigenProps) {
  const router = useRouter();
  const [modalDomicilioAbierto, setModalDomicilioAbierto] = useState(false);
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
        <ClayButton type="button" variant="secondary" size="lg" onClick={() => setModalDomicilioAbierto(true)}>
          Domicilio
        </ClayButton>
        <ClayButton
          type="button"
          variant="secondary"
          size="lg"
          onClick={() => router.push("/pedido/nuevo?canal=llevar")}
        >
          Para llevar
        </ClayButton>
      </div>

      <FormularioDomicilio
        abierto={modalDomicilioAbierto}
        onCerrar={() => setModalDomicilioAbierto(false)}
        onCreado={(clienteId) => router.push(`/pedido/nuevo?canal=domicilio&clienteId=${clienteId}`)}
      />
    </div>
  );
}

interface FormularioDomicilioProps {
  abierto: boolean;
  onCerrar: () => void;
  onCreado: (clienteId: string) => void;
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
    onCreado(resultado.valor.clienteId);
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
            {isSubmitting ? "Creando…" : "Continuar"}
          </ClayButton>
        </div>
      </form>
    </ClayModal>
  );
}
