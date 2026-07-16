"use client";

import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/cn";

export interface ClayModalProps {
  abierto: boolean;
  titulo: string;
  onCerrar: () => void;
  children?: React.ReactNode;
  className?: string;
}

export function ClayModal({ abierto, titulo, onCerrar, children, className }: ClayModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const tituloId = useId();
  const onCerrarRef = useRef(onCerrar);
  // El cierre "click en el fondo" solo debe dispararse si el gesto completo
  // (pointerdown Y click) ocurrió sobre el fondo. Si el usuario empieza a
  // seleccionar texto dentro del panel y suelta el mouse fuera (drag-out),
  // el evento click sintético del navegador puede llegar con target=dialog
  // aunque el gesto haya iniciado dentro del contenido; sin este chequeo eso
  // cerraba el modal por accidente.
  const pointerDownEnFondoRef = useRef(false);

  useEffect(() => {
    onCerrarRef.current = onCerrar;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (abierto && !dialog.open) {
      dialog.showModal();
    } else if (!abierto && dialog.open) {
      dialog.close();
    }
  }, [abierto]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const manejarCierre = () => onCerrarRef.current();
    dialog.addEventListener("close", manejarCierre);
    return () => dialog.removeEventListener("close", manejarCierre);
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={tituloId}
      onPointerDown={(evento) => {
        pointerDownEnFondoRef.current = evento.target === dialogRef.current;
      }}
      onClick={(evento) => {
        if (pointerDownEnFondoRef.current && evento.target === dialogRef.current) {
          dialogRef.current?.close();
        }
      }}
      // m-auto: el <dialog> nativo se centra con margin:auto, pero el reset
      // de Tailwind (preflight) pone margin:0 en todo -- sin esto el modal
      // queda pegado a la esquina superior izquierda.
      className={cn("m-auto w-full max-w-lg bg-transparent p-0", className)}
    >
      <div className="w-full rounded-clay-lg bg-brand-crema p-6 text-text-primary shadow-clay-lg">
        <h2 id={tituloId} className="font-display text-xl font-semibold text-text-primary">
          {titulo}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </dialog>
  );
}
