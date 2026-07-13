import { ClayCard } from "@/components/ui/ClayCard";
import { cn } from "@/lib/cn";

export interface StatCardProps {
  titulo: string;
  valor: string;
  deltaPorcentaje?: number;
  className?: string;
}

export function StatCard({ titulo, valor, deltaPorcentaje, className }: StatCardProps) {
  const tieneDelta = typeof deltaPorcentaje === "number";
  const esPositivo = tieneDelta && deltaPorcentaje >= 0;
  return (
    <ClayCard className={cn("flex flex-col gap-1", className)}>
      <span className="text-sm text-text-secondary">{titulo}</span>
      <span className="font-display text-2xl font-semibold text-text-primary">{valor}</span>
      {tieneDelta ? (
        <span className={cn("text-sm font-medium", esPositivo ? "text-brand-verde" : "text-brand-tomate-2")}>
          {esPositivo ? "▲" : "▼"} {Math.abs(deltaPorcentaje).toFixed(1)}% vs. período anterior
        </span>
      ) : null}
    </ClayCard>
  );
}
