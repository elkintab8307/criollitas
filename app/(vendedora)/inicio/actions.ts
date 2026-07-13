"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { err, ok, type DomainError, type Result } from "@/lib/result";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";
import { createServerSupabase } from "@/lib/supabase/server";
import { clienteDomicilioSchema, type ClienteDomicilioInput } from "@/lib/validations/pedido";
import { siguienteNumeroCorto } from "@/lib/pedido/numeroCorto";
import { limitesDeHoyBogota } from "@/lib/dates";

const uuidValido = (valor: string): boolean => z.uuid().safeParse(valor).success;

interface ContextoVendedora {
  sedeId: string;
  vendedoraId: string;
}

async function exigirVendedora(): Promise<Result<ContextoVendedora, DomainError>> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return err({ codigo: "NO_AUTORIZADO", mensaje: "Inicia sesión de nuevo" });
  // app_metadata (no user_metadata): solo el service role lo escribe.
  if (user.app_metadata?.rol !== "vendedora") {
    return err({ codigo: "NO_AUTORIZADO", mensaje: "Solo la vendedora puede tomar pedidos" });
  }
  return ok({
    sedeId: (user.app_metadata?.sede_id as string) ?? SEDE_DEFAULT_ID,
    vendedoraId: user.id,
  });
}

async function calcularSiguienteNumero(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  sedeId: string,
): Promise<number> {
  const { desde, hasta } = limitesDeHoyBogota();
  const { data } = await supabase
    .from("pedidos")
    .select("numero_corto")
    .eq("sede_id", sedeId)
    .gte("creado_en", desde.toISOString())
    .lt("creado_en", hasta.toISOString());
  return siguienteNumeroCorto((data ?? []).map((fila) => fila.numero_corto));
}

export async function crearPedidoMesa(
  mesaId: string,
): Promise<Result<{ pedidoId: string }, DomainError>> {
  const ctx = await exigirVendedora();
  if (!ctx.ok) return ctx;
  if (!uuidValido(mesaId)) {
    return err({ codigo: "VALIDACION", mensaje: "Identificador de mesa inválido" });
  }
  const supabase = await createServerSupabase();

  const { data: mesa, error: errorMesa } = await supabase
    .from("mesas")
    .select("id, estado, activa")
    .eq("id", mesaId)
    .single();
  if (errorMesa || !mesa) {
    return err({ codigo: "NO_ENCONTRADO", mensaje: "La mesa no existe" });
  }
  if (!mesa.activa || mesa.estado !== "libre") {
    return err({ codigo: "VALIDACION", mensaje: "Esa mesa ya no está disponible. Elige otra." });
  }

  const numeroCorto = await calcularSiguienteNumero(supabase, ctx.valor.sedeId);
  const { data: pedido, error: errorPedido } = await supabase
    .from("pedidos")
    .insert({
      sede_id: ctx.valor.sedeId,
      numero_corto: numeroCorto,
      canal: "mesa",
      mesa_id: mesaId,
      vendedora_id: ctx.valor.vendedoraId,
    })
    .select("id")
    .single();
  if (errorPedido || !pedido) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos crear el pedido. Intenta de nuevo." });
  }

  revalidatePath("/inicio");
  return ok({ pedidoId: pedido.id });
}

export async function crearPedidoDomicilio(
  input: ClienteDomicilioInput,
): Promise<Result<{ pedidoId: string }, DomainError>> {
  const ctx = await exigirVendedora();
  if (!ctx.ok) return ctx;
  const parsed = clienteDomicilioSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      codigo: "VALIDACION",
      mensaje: parsed.error.issues[0]?.message ?? "Datos inválidos",
    });
  }
  const supabase = await createServerSupabase();

  const { data: cliente, error: errorCliente } = await supabase
    .from("clientes_domicilio")
    .upsert(
      {
        sede_id: ctx.valor.sedeId,
        nombre: parsed.data.nombre,
        telefono: parsed.data.telefono,
        direccion: parsed.data.direccion,
        referencia: parsed.data.referencia ?? null,
      },
      { onConflict: "sede_id,telefono" },
    )
    .select("id")
    .single();
  if (errorCliente || !cliente) {
    return err({
      codigo: "BASE_DATOS",
      mensaje: "No pudimos guardar los datos del cliente. Intenta de nuevo.",
    });
  }

  const numeroCorto = await calcularSiguienteNumero(supabase, ctx.valor.sedeId);
  const { data: pedido, error: errorPedido } = await supabase
    .from("pedidos")
    .insert({
      sede_id: ctx.valor.sedeId,
      numero_corto: numeroCorto,
      canal: "domicilio",
      cliente_id: cliente.id,
      vendedora_id: ctx.valor.vendedoraId,
    })
    .select("id")
    .single();
  if (errorPedido || !pedido) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos crear el pedido. Intenta de nuevo." });
  }

  revalidatePath("/inicio");
  return ok({ pedidoId: pedido.id });
}

export async function crearPedidoLlevar(): Promise<Result<{ pedidoId: string }, DomainError>> {
  const ctx = await exigirVendedora();
  if (!ctx.ok) return ctx;
  const supabase = await createServerSupabase();
  const numeroCorto = await calcularSiguienteNumero(supabase, ctx.valor.sedeId);
  const { data: pedido, error } = await supabase
    .from("pedidos")
    .insert({
      sede_id: ctx.valor.sedeId,
      numero_corto: numeroCorto,
      canal: "llevar",
      vendedora_id: ctx.valor.vendedoraId,
    })
    .select("id")
    .single();
  if (error || !pedido) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos crear el pedido. Intenta de nuevo." });
  }
  revalidatePath("/inicio");
  return ok({ pedidoId: pedido.id });
}

/** Busca el pedido abierto de esta mesa que pertenece a la vendedora
 *  actual, para retomarlo (ej. si salió a atender otra mesa y regresa).
 *  `pedidos_vendedora_select` no excluye estados terminales, así que el
 *  filtro de estado va explícito en la query, no se confía en RLS aquí. */
export async function entrarPedidoDeMesa(
  mesaId: string,
): Promise<Result<{ pedidoId: string }, DomainError>> {
  const ctx = await exigirVendedora();
  if (!ctx.ok) return ctx;
  if (!uuidValido(mesaId)) {
    return err({ codigo: "VALIDACION", mensaje: "Identificador de mesa inválido" });
  }
  const supabase = await createServerSupabase();

  const { data: pedido } = await supabase
    .from("pedidos")
    .select("id")
    .eq("mesa_id", mesaId)
    .eq("vendedora_id", ctx.valor.vendedoraId)
    .not("estado", "in", "(cobrado,cerrado,anulado)")
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pedido) {
    return err({ codigo: "NO_ENCONTRADO", mensaje: "Esta mesa está ocupada por otra persona." });
  }
  return ok({ pedidoId: pedido.id });
}
