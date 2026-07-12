"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { crearCategoria, editarCategoria, moverCategoriaAction } from "@/app/(admin)/menu/actions";
import { categoriaSchema, type CategoriaInput } from "@/lib/validations/menu";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayInput } from "@/components/ui/ClayInput";
import { ClayModal } from "@/components/ui/ClayModal";
import { cn } from "@/lib/cn";
import type { CategoriaFila } from "@/components/menu/types";

interface BarraCategoriasProps {
  categorias: CategoriaFila[];
  categoriaActivaId: string | null;
  onSeleccionar: (id: string) => void;
}

/** Pestañas horizontales de categoría con reordenamiento (▲▼) y alta de categorías. */
export function BarraCategorias({ categorias, categoriaActivaId, onSeleccionar }: BarraCategoriasProps) {
  const router = useRouter();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [categoriaEditando, setCategoriaEditando] = useState<CategoriaFila | null>(null);
  const [moviendoId, setMoviendoId] = useState<string | null>(null);
  const [errorMover, setErrorMover] = useState<string | null>(null);

  async function mover(id: string, direccion: "arriba" | "abajo") {
    setErrorMover(null);
    setMoviendoId(id);
    const resultado = await moverCategoriaAction(id, direccion);
    setMoviendoId(null);
    if (!resultado.ok) {
      setErrorMover(resultado.error.mensaje);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3" role="tablist" aria-label="Categorías del menú">
        {categorias.map((categoria, indice) => {
          const activa = categoria.id === categoriaActivaId;
          return (
            <div
              key={categoria.id}
              className={cn(
                "flex items-center gap-1 rounded-clay-md p-1 shadow-clay-sm transition-all duration-150",
                activa ? "bg-brand-mostaza" : "bg-brand-crema hover:bg-brand-crema-2",
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={activa}
                onClick={() => onSeleccionar(categoria.id)}
                className={cn(
                  "rounded-clay-sm px-4 py-2 font-display text-sm font-semibold text-brand-chocolate",
                  "focus-visible:outline-3 focus-visible:outline-brand-chocolate focus-visible:outline-offset-2",
                )}
              >
                {categoria.nombre}
              </button>
              {activa ? (
                <button
                  type="button"
                  aria-label={`Editar ${categoria.nombre}`}
                  onClick={() => setCategoriaEditando(categoria)}
                  className="rounded-clay-sm px-1 text-sm leading-none text-brand-chocolate/70 hover:text-brand-chocolate focus-visible:outline-2 focus-visible:outline-brand-chocolate"
                >
                  ✎
                </button>
              ) : null}
              <div className="flex flex-col">
                <button
                  type="button"
                  aria-label={`Mover ${categoria.nombre} hacia arriba`}
                  disabled={indice === 0 || moviendoId === categoria.id}
                  onClick={() => mover(categoria.id, "arriba")}
                  className="rounded-clay-sm px-1.5 text-xs leading-none text-brand-chocolate/70 hover:text-brand-chocolate disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-brand-chocolate"
                >
                  ▲
                </button>
                <button
                  type="button"
                  aria-label={`Mover ${categoria.nombre} hacia abajo`}
                  disabled={indice === categorias.length - 1 || moviendoId === categoria.id}
                  onClick={() => mover(categoria.id, "abajo")}
                  className="rounded-clay-sm px-1.5 text-xs leading-none text-brand-chocolate/70 hover:text-brand-chocolate disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-brand-chocolate"
                >
                  ▼
                </button>
              </div>
            </div>
          );
        })}
        <ClayButton type="button" variant="secondary" size="sm" onClick={() => setModalAbierto(true)}>
          + Nueva categoría
        </ClayButton>
      </div>

      {errorMover ? (
        <p role="alert" className="text-sm text-brand-tomate-2">
          {errorMover}
        </p>
      ) : null}

      {categorias.length === 0 ? (
        <p className="text-sm text-brand-crema/70">Aún no hay categorías. Crea la primera.</p>
      ) : null}

      <ModalNuevaCategoria
        abierto={modalAbierto}
        onCerrar={() => setModalAbierto(false)}
        onCreada={() => {
          setModalAbierto(false);
          router.refresh();
        }}
      />

      <ModalEditarCategoria
        categoria={categoriaEditando}
        onCerrar={() => setCategoriaEditando(null)}
        onEditada={() => {
          setCategoriaEditando(null);
          router.refresh();
        }}
      />
    </div>
  );
}

interface ModalNuevaCategoriaProps {
  abierto: boolean;
  onCerrar: () => void;
  onCreada: () => void;
}

function ModalNuevaCategoria({ abierto, onCerrar, onCreada }: ModalNuevaCategoriaProps) {
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CategoriaInput>({ resolver: zodResolver(categoriaSchema) });

  function cerrar() {
    reset();
    setErrorGeneral(null);
    onCerrar();
  }

  const onSubmit = handleSubmit(async (datos) => {
    setErrorGeneral(null);
    const resultado = await crearCategoria(datos);
    if (!resultado.ok) {
      setErrorGeneral(resultado.error.mensaje);
      return;
    }
    reset();
    onCreada();
  });

  return (
    <ClayModal abierto={abierto} titulo="Nueva categoría" onCerrar={cerrar}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <ClayInput
          label="Nombre de la categoría"
          placeholder="Ej: Postres"
          error={errors.nombre?.message}
          {...register("nombre")}
        />
        {errorGeneral ? (
          <p role="alert" className="text-sm text-brand-tomate-2">
            {errorGeneral}
          </p>
        ) : null}
        <div className="flex justify-end gap-3">
          <ClayButton
            type="button"
            variant="ghost"
            className="text-text-primary hover:bg-brand-crema-2"
            onClick={cerrar}
          >
            Cancelar
          </ClayButton>
          <ClayButton type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? "Creando…" : "Crear categoría"}
          </ClayButton>
        </div>
      </form>
    </ClayModal>
  );
}

interface ModalEditarCategoriaProps {
  categoria: CategoriaFila | null;
  onCerrar: () => void;
  onEditada: () => void;
}

/** Modal de renombrar categoría, precargado con el nombre actual. */
function ModalEditarCategoria({ categoria, onCerrar, onEditada }: ModalEditarCategoriaProps) {
  return (
    // key remonta el formulario por categoría: evita arrastrar valores/errores
    // de una edición previa cuando se abre para otra categoría.
    <FormularioEditarCategoria
      key={categoria?.id ?? "cerrado"}
      categoria={categoria}
      onCerrar={onCerrar}
      onEditada={onEditada}
    />
  );
}

function FormularioEditarCategoria({ categoria, onCerrar, onEditada }: ModalEditarCategoriaProps) {
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CategoriaInput>({
    resolver: zodResolver(categoriaSchema),
    defaultValues: { nombre: categoria?.nombre ?? "" },
  });

  function cerrar() {
    setErrorGeneral(null);
    onCerrar();
  }

  const onSubmit = handleSubmit(async (datos) => {
    if (!categoria) return;
    setErrorGeneral(null);
    const resultado = await editarCategoria(categoria.id, datos);
    if (!resultado.ok) {
      setErrorGeneral(resultado.error.mensaje);
      return;
    }
    onEditada();
  });

  return (
    <ClayModal abierto={categoria !== null} titulo="Editar categoría" onCerrar={cerrar}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <ClayInput
          label="Nombre de la categoría"
          placeholder="Ej: Postres"
          error={errors.nombre?.message}
          {...register("nombre")}
        />
        {errorGeneral ? (
          <p role="alert" className="text-sm text-brand-tomate-2">
            {errorGeneral}
          </p>
        ) : null}
        <div className="flex justify-end gap-3">
          <ClayButton
            type="button"
            variant="ghost"
            className="text-text-primary hover:bg-brand-crema-2"
            onClick={cerrar}
          >
            Cancelar
          </ClayButton>
          <ClayButton type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? "Guardando…" : "Guardar cambios"}
          </ClayButton>
        </div>
      </form>
    </ClayModal>
  );
}
