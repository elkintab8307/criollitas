"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { useSesionOfflineStore } from "@/lib/offline/sesionOfflineStore";
import { decidirRedireccionOffline } from "@/lib/offline/guardiaOffline";

/** Mientras haya conexión, middleware.ts sigue siendo la única autoridad
 *  de acceso -- este componente no hace nada. Solo actúa cuando el
 *  detector de conectividad confirma que no hay internet (Bloque J1),
 *  momento en el que middleware.ts no puede ejecutarse en absoluto (el
 *  navegador no alcanza a Vercel). Sin test unitario (efectos de
 *  navegador/router); la lógica de decisión que importa vive en
 *  decidirRedireccionOffline, ya testeada. */
export function GuardiaOffline() {
  const pathname = usePathname();
  const router = useRouter();
  const estado = useConectividadStore((s) => s.estado);
  const sesion = useSesionOfflineStore((s) => s.sesion);

  useEffect(() => {
    if (estado !== "offline") return;
    const decision = decidirRedireccionOffline(pathname, sesion);
    if (decision.tipo === "redirigir") router.replace(decision.destino);
  }, [pathname, estado, sesion, router]);

  return null;
}
