"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

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
 *  suya en el mismo dispositivo -- limpia el PIN validado y, si aplica, el
 *  turno abierto de caja (bloque F) antes de mandar de vuelta a /pin. */
export async function cerrarSesion(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete("pin_validado");
  cookieStore.delete("turno_abierto");
  redirect("/pin");
}
