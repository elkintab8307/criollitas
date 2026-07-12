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
    const manejarCierre = () => onCerrar();
    dialog.addEventListener("close", manejarCierre);
    return () => dialog.removeEventListener("close", manejarCierre);
  }, [onCerrar]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={tituloId}
      onClick={(evento) => {
        if (evento.target === dialogRef.current) {
          dialogRef.current?.close();
        }
      }}
      className={cn(
        "w-full max-w-lg rounded-clay-lg bg-brand-crema p-6 text-text-primary shadow-clay-lg",
        "backdrop:bg-transparent",
        className,
      )}
    >
      <h2 id={tituloId} className="font-display text-xl font-semibold text-text-primary">
        {titulo}
      </h2>
      <div className="mt-4">{children}</div>
    </dialog>
  );
}
