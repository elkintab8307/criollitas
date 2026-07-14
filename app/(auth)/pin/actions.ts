"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { COOKIE_SESION_OFFLINE } from "@/lib/auth/sesionOffline";

export async function marcarPinValidado(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set("pin_validado", "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

/** Cierra la sesión activa para que otro miembro del staff pueda iniciar la
 *  suya en el mismo dispositivo -- limpia el PIN validado, el turno abierto
 *  de caja (bloque F) y la sesión offline (modo offline, Fase 0) antes de
 *  mandar de vuelta a /pin. Sin esto último, alguien que cierre sesión
 *  seguiría "autenticado" en modo offline hasta 12h si se cae la red. */
export async function cerrarSesion(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete("pin_validado");
  cookieStore.delete("turno_abierto");
  cookieStore.delete(COOKIE_SESION_OFFLINE);
  redirect("/pin");
}
