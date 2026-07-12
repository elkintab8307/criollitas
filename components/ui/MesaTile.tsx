import { Users } from "lucide-react";
import { ClayBadge, type ClayBadgeProps } from "@/components/ui/ClayBadge";
import { cn } from "@/lib/cn";
import { metaEstadoMesa, type EstadoMesa } from "@/lib/mesas/estado";

const VARIANTE_BADGE_ESTADO: Record<EstadoMesa, NonNullable<ClayBadgeProps["variant"]>> = {
  libre: "exito",
  ocupada: "alerta",
  reservada: "peligro",
};

export interface MesaTileProps {
  numero: number;
  nombre: string;
  capacidad: number;
  estado: EstadoMesa;
  activa: boolean;
  onClick?: () => void;
}

export function MesaTile({ numero, nombre, capacidad, estado, activa, onClick }: MesaTileProps) {
  const meta = metaEstadoMesa(estado);
  const etiquetaBadge = activa ? meta.etiqueta : "Inactiva";
  const varianteBadge = activa ? VARIANTE_BADGE_ESTADO[estado] : "alerta";

  const className = cn(
    "relative flex aspect-square min-h-12 min-w-12 flex-col items-center justify-center gap-1",
    "rounded-clay-lg p-4 text-center shadow-clay-md",
    meta.claseFondo,
    meta.claseTexto,
    !activa && "opacity-60 grayscale",
  );

  const contenido = (
    <>
      <ClayBadge variant={varianteBadge} className="absolute right-3 top-3">
        {etiquetaBadge}
      </ClayBadge>
      <span className="font-display text-4xl font-semibold">{numero}</span>
      <span className="font-body text-base font-medium">{nombre}</span>
      <span className="flex items-center gap-1 font-body text-sm">
        <Users className="size-4" aria-hidden="true" />
        {capacidad} pers.
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          className,
          "transition-all duration-150",
          "hover:shadow-clay-lg active:translate-y-px active:shadow-clay-pressed",
          "focus-visible:outline focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2",
        )}
        aria-label={`Mesa ${numero}, ${nombre}, ${etiquetaBadge}, capacidad ${capacidad} personas`}
      >
        {contenido}
      </button>
    );
  }

  return <div className={className}>{contenido}</div>;
}
