"use server";

import { revalidatePath } from "next/cache";

import { moverCategoria } from "@/lib/menu/orden";
import { montoDesdePesos } from "@/lib/money";
import { err, ok, type DomainError, type Result } from "@/lib/result";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  categoriaSchema,
  modificadorSchema,
  productoSchema,
  type CategoriaInput,
  type ModificadorInput,
  type ProductoInput,
} from "@/lib/validations/menu";

const TIPOS_IMAGEN_PERMITIDOS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
const TAMANO_MAXIMO_IMAGEN_BYTES = 2 * 1024 * 1024;

async function exigirAdmin(): Promise<Result<{ sedeId: string }, DomainError>> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return err({ codigo: "NO_AUTORIZADO", mensaje: "Inicia sesión de nuevo" });
  if (user.user_metadata?.rol !== "admin") {
    return err({ codigo: "NO_AUTORIZADO", mensaje: "Solo el administrador puede editar el menú" });
  }
  return ok({ sedeId: (user.user_metadata?.sede_id as string) ?? SEDE_DEFAULT_ID });
}

export async function crearProducto(
  input: ProductoInput,
): Promise<Result<{ id: string }, DomainError>> {
  const admin = await exigirAdmin();
  if (!admin.ok) return admin;
  const parsed = productoSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      codigo: "VALIDACION",
      mensaje: parsed.error.issues[0]?.message ?? "Datos inválidos",
    });
  }
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("productos")
    .insert({
      sede_id: admin.valor.sedeId,
      categoria_id: parsed.data.categoriaId,
      nombre: parsed.data.nombre,
      descripcion: parsed.data.descripcion ?? null,
      // aritmética de montos sigue en lib/money con bigint; aquí es solo serialización
      precio_cop: Number(montoDesdePesos(parsed.data.precioPesos)),
      tiempo_prep_min: parsed.data.tiempoPrepMin ?? null,
      activo: parsed.data.activo,
    })
    .select("id")
    .single();
  if (error) {
    return err({
      codigo: "BASE_DATOS",
      mensaje: "No pudimos guardar el producto. Intenta de nuevo.",
    });
  }
  revalidatePath("/menu");
  return ok({ id: data.id });
}

export async function editarProducto(
  id: string,
  input: ProductoInput,
): Promise<Result<{ id: string }, DomainError>> {
  const admin = await exigirAdmin();
  if (!admin.ok) return admin;
  const parsed = productoSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      codigo: "VALIDACION",
      mensaje: parsed.error.issues[0]?.message ?? "Datos inválidos",
    });
  }
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("productos")
    .update({
      categoria_id: parsed.data.categoriaId,
      nombre: parsed.data.nombre,
      descripcion: parsed.data.descripcion ?? null,
      // aritmética de montos sigue en lib/money con bigint; aquí es solo serialización
      precio_cop: Number(montoDesdePesos(parsed.data.precioPesos)),
      tiempo_prep_min: parsed.data.tiempoPrepMin ?? null,
      activo: parsed.data.activo,
    })
    .eq("id", id)
    .select("id")
    .single();
  if (error) {
    return err({
      codigo: "BASE_DATOS",
      mensaje: "No pudimos actualizar el producto. Intenta de nuevo.",
    });
  }
  revalidatePath("/menu");
  return ok({ id: data.id });
}

export async function cambiarActivoProducto(
  id: string,
  activo: boolean,
): Promise<Result<{ id: string }, DomainError>> {
  const admin = await exigirAdmin();
  if (!admin.ok) return admin;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("productos")
    .update({ activo })
    .eq("id", id)
    .select("id")
    .single();
  if (error) {
    return err({
      codigo: "BASE_DATOS",
      mensaje: "No pudimos actualizar el producto. Intenta de nuevo.",
    });
  }
  revalidatePath("/menu");
  return ok({ id: data.id });
}

export async function crearCategoria(
  input: CategoriaInput,
): Promise<Result<{ id: string }, DomainError>> {
  const admin = await exigirAdmin();
  if (!admin.ok) return admin;
  const parsed = categoriaSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      codigo: "VALIDACION",
      mensaje: parsed.error.issues[0]?.message ?? "Datos inválidos",
    });
  }
  const supabase = await createServerSupabase();
  const { data: ultima, error: maxError } = await supabase
    .from("categorias")
    .select("orden")
    .eq("sede_id", admin.valor.sedeId)
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxError) {
    return err({
      codigo: "BASE_DATOS",
      mensaje: "No pudimos crear la categoría. Intenta de nuevo.",
    });
  }
  const siguienteOrden = (ultima?.orden ?? -1) + 1;
  const { data, error } = await supabase
    .from("categorias")
    .insert({
      sede_id: admin.valor.sedeId,
      nombre: parsed.data.nombre,
      orden: siguienteOrden,
    })
    .select("id")
    .single();
  if (error) {
    return err({
      codigo: "BASE_DATOS",
      mensaje: "No pudimos crear la categoría. Intenta de nuevo.",
    });
  }
  revalidatePath("/menu");
  return ok({ id: data.id });
}

export async function editarCategoria(
  id: string,
  input: CategoriaInput,
): Promise<Result<{ id: string }, DomainError>> {
  const admin = await exigirAdmin();
  if (!admin.ok) return admin;
  const parsed = categoriaSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      codigo: "VALIDACION",
      mensaje: parsed.error.issues[0]?.message ?? "Datos inválidos",
    });
  }
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("categorias")
    .update({ nombre: parsed.data.nombre })
    .eq("id", id)
    .select("id")
    .single();
  if (error) {
    return err({
      codigo: "BASE_DATOS",
      mensaje: "No pudimos actualizar la categoría. Intenta de nuevo.",
    });
  }
  revalidatePath("/menu");
  return ok({ id: data.id });
}

export async function moverCategoriaAction(
  id: string,
  direccion: "arriba" | "abajo",
): Promise<Result<null, DomainError>> {
  const admin = await exigirAdmin();
  if (!admin.ok) return admin;
  const supabase = await createServerSupabase();
  const { data: categorias, error: selectError } = await supabase
    .from("categorias")
    .select("id")
    .eq("sede_id", admin.valor.sedeId)
    .eq("activa", true)
    .order("orden", { ascending: true });
  if (selectError) {
    return err({
      codigo: "BASE_DATOS",
      mensaje: "No pudimos leer las categorías. Intenta de nuevo.",
    });
  }
  const ordenActual = (categorias ?? []).map((categoria) => categoria.id);
  if (!ordenActual.includes(id)) {
    return err({ codigo: "NO_ENCONTRADO", mensaje: "La categoría no existe o no está activa." });
  }
  const nuevoOrden = moverCategoria(ordenActual, id, direccion);
  const actualizaciones = await Promise.all(
    nuevoOrden.map((categoriaId, indice) =>
      supabase.from("categorias").update({ orden: indice }).eq("id", categoriaId),
    ),
  );
  const fallo = actualizaciones.find((resultado) => resultado.error);
  if (fallo) {
    return err({
      codigo: "BASE_DATOS",
      mensaje: "No pudimos reordenar las categorías. Intenta de nuevo.",
    });
  }
  revalidatePath("/menu");
  return ok(null);
}

export async function guardarModificador(
  input: ModificadorInput & { id?: string },
): Promise<Result<{ id: string }, DomainError>> {
  const admin = await exigirAdmin();
  if (!admin.ok) return admin;
  const parsed = modificadorSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      codigo: "VALIDACION",
      mensaje: parsed.error.issues[0]?.message ?? "Datos inválidos",
    });
  }
  const supabase = await createServerSupabase();
  const registro = {
    producto_id: parsed.data.productoId,
    grupo: parsed.data.grupo ?? null,
    nombre: parsed.data.nombre,
    // aritmética de montos sigue en lib/money con bigint; aquí es solo serialización
    precio_delta_cop: Number(montoDesdePesos(parsed.data.deltaPesos)),
    obligatorio: parsed.data.obligatorio,
    max_seleccion: parsed.data.maxSeleccion,
  };
  const { data, error } = input.id
    ? await supabase.from("modificadores").update(registro).eq("id", input.id).select("id").single()
    : await supabase.from("modificadores").insert(registro).select("id").single();
  if (error) {
    return err({
      codigo: "BASE_DATOS",
      mensaje: "No pudimos guardar el modificador. Intenta de nuevo.",
    });
  }
  revalidatePath("/menu");
  return ok({ id: data.id });
}

export async function cambiarActivoModificador(
  id: string,
  activo: boolean,
): Promise<Result<null, DomainError>> {
  const admin = await exigirAdmin();
  if (!admin.ok) return admin;
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("modificadores").update({ activo }).eq("id", id);
  if (error) {
    return err({
      codigo: "BASE_DATOS",
      mensaje: "No pudimos actualizar el modificador. Intenta de nuevo.",
    });
  }
  revalidatePath("/menu");
  return ok(null);
}

export async function subirImagenProducto(
  productoId: string,
  formData: FormData,
): Promise<Result<{ url: string }, DomainError>> {
  const admin = await exigirAdmin();
  if (!admin.ok) return admin;
  const archivo = formData.get("imagen");
  if (!(archivo instanceof File)) {
    return err({ codigo: "VALIDACION", mensaje: "Selecciona una imagen" });
  }
  const extension = TIPOS_IMAGEN_PERMITIDOS[archivo.type];
  if (!extension) {
    return err({ codigo: "VALIDACION", mensaje: "La imagen debe ser JPG, PNG, WEBP o SVG" });
  }
  if (archivo.size > TAMANO_MAXIMO_IMAGEN_BYTES) {
    return err({ codigo: "VALIDACION", mensaje: "La imagen no puede pesar más de 2 MB" });
  }
  const supabase = await createServerSupabase();
  const ruta = `productos/${productoId}.${extension}`;
  const { error: subidaError } = await supabase.storage
    .from("menu")
    .upload(ruta, archivo, { upsert: true, contentType: archivo.type });
  if (subidaError) {
    return err({ codigo: "BASE_DATOS", mensaje: "No pudimos subir la imagen. Intenta de nuevo." });
  }
  const {
    data: { publicUrl },
  } = supabase.storage.from("menu").getPublicUrl(ruta);
  const imagenUrl = `${publicUrl}?v=${Date.now()}`;
  const { error: updateError } = await supabase
    .from("productos")
    .update({ imagen_url: imagenUrl })
    .eq("id", productoId);
  if (updateError) {
    return err({
      codigo: "BASE_DATOS",
      mensaje: "No pudimos guardar la imagen del producto. Intenta de nuevo.",
    });
  }
  revalidatePath("/menu");
  return ok({ url: imagenUrl });
}
