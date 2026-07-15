"use client";

import { useEffect, useState } from "react";
import { PinPad, type UsuarioPin } from "@/components/auth/PinPad";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";
import { listarIdentidades } from "@/lib/offline/identidad";

const SEDE_ID = process.env.NEXT_PUBLIC_SEDE_ID ?? SEDE_DEFAULT_ID;

export default function PinPage() {
  const [usuarios, setUsuarios] = useState<UsuarioPin[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;

    async function cargar() {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/login-pin/usuarios?sede_id=${SEDE_ID}`,
          { cache: "no-store", headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } },
        );
        if (!res.ok) throw new Error("respuesta no ok");
        const datos: UsuarioPin[] = await res.json();
        if (!cancelado) setUsuarios(datos);
      } catch {
        // Sin conexión (o el servidor no respondió): usar la lista
        // cacheada localmente -- solo contiene Cajera/Admin, los únicos
        // roles con respaldo offline (Bloque J2).
        const identidades = await listarIdentidades();
        if (!cancelado) {
          setUsuarios(
            identidades.map((i) => ({
              id: i.usuarioId,
              nombre: i.nombre,
              avatar_url: null,
              rol: i.rol,
            })),
          );
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    }
    cargar();
    return () => {
      cancelado = true;
    };
  }, []);

  if (cargando) return null;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <PinPad usuarios={usuarios} />
    </main>
  );
}
