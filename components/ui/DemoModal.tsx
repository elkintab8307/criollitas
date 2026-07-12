"use client";

import { useState } from "react";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayModal } from "@/components/ui/ClayModal";

export function DemoModal() {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <ClayButton variant="primary" size="md" onClick={() => setAbierto(true)}>
        Abrir modal de ejemplo
      </ClayButton>
      <ClayModal abierto={abierto} titulo="Confirmar anulación de pedido" onCerrar={() => setAbierto(false)}>
        <p className="font-body text-sm text-text-secondary">
          Esta acción anulará el pedido #0042 y quedará registrada en la auditoría. Escribe el
          motivo antes de continuar.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <ClayButton variant="secondary" size="sm" onClick={() => setAbierto(false)}>
            Cancelar
          </ClayButton>
          <ClayButton variant="destructive" size="sm" onClick={() => setAbierto(false)}>
            Anular pedido
          </ClayButton>
        </div>
      </ClayModal>
    </>
  );
}
