"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { err, ok, type DomainError, type Result } from "@/lib/result";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";
import { createServerSupabase } from "@/lib/supabase/server";
import { mesaSchema, type MesaInput } from "@/lib/validations/mesas";

/** Validación mínima de identificadores que llegan como argumento crudo de Server Action. */
const uuidValido = (valor: string): boolean => z.uuid().safeParse(valor).success;

async function exigirAdmin(): Promise<Result<{ sedeId: string }, DomainError>> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return err({ codigo: "NO_AUTORIZADO", mensaje: "Inicia sesión de nuevo" });
  // app_metadata (no user_metadata): solo el service role lo escribe.
  if (user.app_metadata?.rol !== "admin") {
    return err({
      codigo: "NO_AUTORIZADO",
      mensaje: "Solo el administrador puede editar las mesas",
    });
  }
  return ok({ sedeId: (user.app_metadata?.sede_id as string) ?? SEDE_DEFAULT_ID });
}

export async function crearMesa(input: MesaInput): Promise<Result<{ id: string }, DomainError>> {
  const admin = await exigirAdmin();
  if (!admin.ok) return admin;
  const parsed = mesaSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      codigo: "VALIDACION",
      mensaje: parsed.error.issues[0]?.message ?? "Datos inválidos",
    });
  }
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("mesas")
    .insert({
      sede_id: admin.valor.sedeId,
      numero: parsed.data.numero,
      nombre: parsed.data.nombre ?? `Mesa ${parsed.data.numero}`,
      capacidad: parsed.data.capacidad,
      activa: parsed.data.activa,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return err({ codigo: "VALIDACION", mensaje: "Ya existe una mesa con ese número" });
    }
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos guardar la mesa. Intenta de nuevo." });
  }
  revalidatePath("/mesas");
  return ok({ id: data.id });
}

export async function editarMesa(
  id: string,
  input: MesaInput,
): Promise<Result<{ id: string }, DomainError>> {
  const admin = await exigirAdmin();
  if (!admin.ok) return admin;
  if (!uuidValido(id)) {
    return err({ codigo: "VALIDACION", mensaje: "Identificador inválido" });
  }
  const parsed = mesaSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      codigo: "VALIDACION",
      mensaje: parsed.error.issues[0]?.message ?? "Datos inválidos",
    });
  }
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("mesas")
    .update({
      numero: parsed.data.numero,
      nombre: parsed.data.nombre ?? `Mesa ${parsed.data.numero}`,
      capacidad: parsed.data.capacidad,
      activa: parsed.data.activa,
    })
    .eq("id", id)
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return err({ codigo: "VALIDACION", mensaje: "Ya existe una mesa con ese número" });
    }
    return err({
      codigo: "BASE_DATOS",
      mensaje: "No pudimos actualizar la mesa. Intenta de nuevo.",
    });
  }
  if (!data) {
    return err({ codigo: "NO_ENCONTRADO", mensaje: "La mesa no existe" });
  }
  revalidatePath("/mesas");
  return ok({ id: data.id });
}

export async function cambiarActivaMesa(
  id: string,
  activa: boolean,
): Promise<Result<{ id: string }, DomainError>> {
  const admin = await exigirAdmin();
  if (!admin.ok) return admin;
  if (!uuidValido(id)) {
    return err({ codigo: "VALIDACION", mensaje: "Identificador inválido" });
  }
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("mesas")
    .update({ activa })
    .eq("id", id)
    .select("id")
    .single();
  if (error || !data) {
    return err({ codigo: "NO_ENCONTRADO", mensaje: "La mesa no existe" });
  }
  revalidatePath("/mesas");
  return ok({ id: data.id });
}
