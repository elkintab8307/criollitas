"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

const INTERVALO_MS = 5_000;

export function BannerConectividad() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelado = false;

    async function verificar() {
      try {
        const respuesta = await fetch("/api/conectividad", { cache: "no-store" });
        const { estado } = (await respuesta.json()) as { estado: "en_linea" | "offline" };
        if (!cancelado) setOffline(estado === "offline");
      } catch {
        // Si ni siquiera se puede llamar a la ruta local, no se asume nada:
        // el servidor local seguramente está caído, no es este banner el
        // que debe reportarlo.
      }
    }

    void verificar();
    const intervalo = setInterval(verificar, INTERVALO_MS);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-brand-tomate px-4 py-2 font-display text-sm text-brand-crema">
      <WifiOff size={16} aria-hidden="true" />
      Sin conexión a internet — trabajando en modo local
    </div>
  );
}
