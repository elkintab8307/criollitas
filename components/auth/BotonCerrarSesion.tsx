"use client";

import { useTransition } from "react";
import { cerrarSesion } from "@/app/(auth)/pin/actions";
import { useSesionOfflineStore } from "@/lib/offline/sesionOfflineStore";
import { useTurnoOfflineStore } from "@/lib/offline/turnoOfflineStore";
import { ClayButton } from "@/components/ui/ClayButton";

/** Limpia las identidades locales del equipo antes de cerrar sesión, para
 *  que la siguiente persona que use este dispositivo compartido no
 *  herede la identidad offline ni el turno local de quien cerró sesión. */
export function BotonCerrarSesion() {
  const [isPending, startTransition] = useTransition();

  return (
    <ClayButton
      type="button"
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={() => {
        useSesionOfflineStore.getState().cerrar();
        useTurnoOfflineStore.getState().cerrar();
        startTransition(() => {
          cerrarSesion();
        });
      }}
    >
      Cambiar de usuario
    </ClayButton>
  );
}
