"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import {
  cambiarActivoProducto,
  crearProducto,
  editarProducto,
  subirImagenProducto,
} from "@/app/(admin)/menu/actions";
import { productoSchema, type ProductoInput } from "@/lib/validations/menu";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayInput } from "@/components/ui/ClayInput";
import { ClayModal } from "@/components/ui/ClayModal";
import { EditorModificadores } from "@/components/menu/EditorModificadores";
import { cn } from "@/lib/cn";
import type { CategoriaFila, ModificadorFila, ProductoFila } from "@/components/menu/types";

// `activo` tiene `.default(true)` en el schema: el tipo de entrada (antes de
// parsear) lo trata como opcional, pero `ProductoInput` (z.infer, tipo de
// salida) lo exige siempre presente. useForm necesita el tipo de entrada
// para los campos del formulario y el de salida para lo que recibe onSubmit.
type ProductoFormValues = z.input<typeof productoSchema>;

const TIPOS_IMAGEN_ACEPTADOS = "image/jpeg,image/png,image/webp,image/svg+xml";

const CAMPO_HUNDIDO =
  "rounded-clay-md bg-surface-sunken px-4 text-base text-text-primary shadow-clay-pressed " +
  "focus-visible:outline-3 focus-visible:outline-brand-mostaza";

interface EditorProductoProps {
  producto: ProductoFila | null;
  categorias: CategoriaFila[];
  categoriaSugeridaId: string | null;
  modificadores: ModificadorFila[];
  onCerrar: () => void;
}

/** Modal de alta/edición de producto, con subida de imagen y sección de modificadores. */
export function EditorProducto({
  producto,
  categorias,
  categoriaSugeridaId,
  modificadores,
  onCerrar,
}: EditorProductoProps) {
  const router = useRouter();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [confirmandoDesactivar, setConfirmandoDesactivar] = useState(false);
  const [cambiandoActivo, setCambiandoActivo] = useState(false);
  const [errorActivo, setErrorActivo] = useState<string | null>(null);
  const [imagenUrl, setImagenUrl] = useState<string | null>(producto?.imagen_url ?? null);
  const [subiendoImagen, setSubiendoImagen] = useState(false);
  const [errorImagen, setErrorImagen] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProductoFormValues, unknown, ProductoInput>({
    resolver: zodResolver(productoSchema),
    defaultValues: {
      nombre: producto?.nombre ?? "",
      descripcion: producto?.descripcion ?? "",
      categoriaId: producto?.categoria_id ?? categoriaSugeridaId ?? categorias[0]?.id ?? "",
      precioPesos: producto ? producto.precio_cop / 100 : undefined,
      tiempoPrepMin: producto?.tiempo_prep_min ?? undefined,
      activo: producto?.activo ?? true,
    },
  });

  const activoActual = watch("activo");

  const onSubmit = handleSubmit(async (datos) => {
    setErrorGeneral(null);
    const resultado = producto
      ? await editarProducto(producto.id, datos)
      : await crearProducto(datos);
    if (!resultado.ok) {
      setErrorGeneral(resultado.error.mensaje);
      return;
    }
    router.refresh();
    onCerrar();
  });

  async function confirmarDesactivar() {
    if (!producto) return;
    setErrorActivo(null);
    setCambiandoActivo(true);
    const resultado = await cambiarActivoProducto(producto.id, false);
    setCambiandoActivo(false);
    if (!resultado.ok) {
      setErrorActivo(resultado.error.mensaje);
      return;
    }
    setValue("activo", false);
    setConfirmandoDesactivar(false);
    router.refresh();
  }

  async function reactivar() {
    if (!producto) return;
    setErrorActivo(null);
    setCambiandoActivo(true);
    const resultado = await cambiarActivoProducto(producto.id, true);
    setCambiandoActivo(false);
    if (!resultado.ok) {
      setErrorActivo(resultado.error.mensaje);
      return;
    }
    setValue("activo", true);
    router.refresh();
  }

  async function alSubirImagen(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!archivo || !producto) return;
    setErrorImagen(null);
    setSubiendoImagen(true);
    const formData = new FormData();
    formData.append("imagen", archivo);
    const resultado = await subirImagenProducto(producto.id, formData);
    setSubiendoImagen(false);
    if (!resultado.ok) {
      setErrorImagen(resultado.error.mensaje);
      return;
    }
    setImagenUrl(resultado.valor.url);
    router.refresh();
  }

  return (
    <ClayModal
      abierto
      titulo={producto ? `Editar ${producto.nombre}` : "Nuevo producto"}
      onCerrar={onCerrar}
      className="max-w-2xl"
    >
      <div className="max-h-[70vh] overflow-y-auto pr-1">
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <ClayInput
            label="Nombre del producto"
            placeholder="Ej: Arepa rellena de carne"
            error={errors.nombre?.message}
            {...register("nombre")}
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="descripcion" className="font-display text-sm font-medium text-text-primary">
              Descripción
            </label>
            <textarea
              id="descripcion"
              rows={3}
              placeholder="Ingredientes, tamaño, notas para la vendedora…"
              className={cn(CAMPO_HUNDIDO, "resize-none py-3 placeholder:text-text-secondary/60")}
              {...register("descripcion", {
                setValueAs: (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
              })}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="categoriaId" className="font-display text-sm font-medium text-text-primary">
                Categoría
              </label>
              <select
                id="categoriaId"
                className={cn(CAMPO_HUNDIDO, "h-12")}
                {...register("categoriaId")}
              >
                {categorias.map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.nombre}
                  </option>
                ))}
              </select>
              {errors.categoriaId?.message ? (
                <p role="alert" className="text-sm text-brand-tomate-2">
                  {errors.categoriaId.message}
                </p>
              ) : null}
            </div>

            <ClayInput
              label="Precio (COP)"
              type="number"
              inputMode="numeric"
              min={0}
              step={100}
              error={errors.precioPesos?.message}
              {...register("precioPesos", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
            />

            <ClayInput
              label="Tiempo de preparación (min)"
              type="number"
              inputMode="numeric"
              min={0}
              error={errors.tiempoPrepMin?.message}
              {...register("tiempoPrepMin", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
            />

            <div className="flex flex-col gap-1.5">
              <span className="font-display text-sm font-medium text-text-primary">Estado</span>
              <div className="flex gap-2">
                <ClayButton
                  type="button"
                  size="sm"
                  variant={activoActual ? "success" : "secondary"}
                  aria-pressed={activoActual}
                  onClick={() => setValue("activo", true)}
                >
                  Activo
                </ClayButton>
                <ClayButton
                  type="button"
                  size="sm"
                  variant={!activoActual ? "destructive" : "secondary"}
                  aria-pressed={!activoActual}
                  onClick={() => setValue("activo", false)}
                >
                  Inactivo
                </ClayButton>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-display text-sm font-medium text-text-primary">Imagen</span>
            <div className="flex items-center gap-4">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-clay-md bg-surface-sunken shadow-clay-pressed">
                {imagenUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- imagen dinámica de Storage
                  <img
                    src={imagenUrl}
                    alt={producto?.nombre ?? "Vista previa del producto"}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-text-secondary">Sin imagen</span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <input
                  type="file"
                  accept={TIPOS_IMAGEN_ACEPTADOS}
                  disabled={!producto || subiendoImagen}
                  onChange={alSubirImagen}
                  aria-label="Subir imagen del producto"
                  className={cn(
                    "text-sm text-text-secondary",
                    "file:mr-3 file:rounded-clay-md file:border-0 file:bg-brand-mostaza file:px-4 file:py-2",
                    "file:font-display file:font-semibold file:text-brand-chocolate file:hover:bg-brand-mostaza-2",
                    "file:disabled:opacity-50",
                  )}
                />
                {!producto ? (
                  <p className="text-xs text-text-secondary">
                    Guarda el producto primero para poder subirle una imagen.
                  </p>
                ) : subiendoImagen ? (
                  <p className="text-xs text-text-secondary">Subiendo imagen…</p>
                ) : null}
                {errorImagen ? (
                  <p role="alert" className="text-sm text-brand-tomate-2">
                    {errorImagen}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {errorGeneral ? (
            <p role="alert" className="text-sm text-brand-tomate-2">
              {errorGeneral}
            </p>
          ) : null}

          {producto ? (
            confirmandoDesactivar ? (
              <div className="flex flex-col gap-3 rounded-clay-md bg-surface-sunken p-4">
                <p className="text-sm text-text-secondary">
                  El producto deja de aparecer para la vendedora, pero conserva su historial en
                  reportes.
                </p>
                {errorActivo ? (
                  <p role="alert" className="text-sm text-brand-tomate-2">
                    {errorActivo}
                  </p>
                ) : null}
                <div className="flex gap-3">
                  <ClayButton
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={cambiandoActivo}
                    onClick={confirmarDesactivar}
                  >
                    {cambiandoActivo ? "Desactivando…" : "Sí, desactivar"}
                  </ClayButton>
                  <ClayButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-text-primary hover:bg-brand-crema-2"
                    onClick={() => setConfirmandoDesactivar(false)}
                  >
                    No, cancelar
                  </ClayButton>
                </div>
              </div>
            ) : null
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div>
              {producto && !confirmandoDesactivar ? (
                producto.activo ? (
                  <ClayButton
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmandoDesactivar(true)}
                  >
                    Desactivar
                  </ClayButton>
                ) : (
                  <ClayButton
                    type="button"
                    variant="success"
                    size="sm"
                    disabled={cambiandoActivo}
                    onClick={reactivar}
                  >
                    {cambiandoActivo ? "Reactivando…" : "Reactivar"}
                  </ClayButton>
                )
              ) : null}
            </div>
            <div className="flex gap-3">
              <ClayButton
                type="button"
                variant="ghost"
                className="text-text-primary hover:bg-brand-crema-2"
                onClick={onCerrar}
              >
                Cancelar
              </ClayButton>
              <ClayButton type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? "Guardando…" : "Guardar"}
              </ClayButton>
            </div>
          </div>
        </form>

        {producto ? (
          <div className="mt-6">
            <EditorModificadores productoId={producto.id} modificadores={modificadores} />
          </div>
        ) : null}
      </div>
    </ClayModal>
  );
}
