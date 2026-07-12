import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const clayBadge = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        neutral: "bg-brand-crema-3 text-brand-chocolate",
        exito: "bg-brand-verde text-brand-chocolate",
        alerta: "bg-brand-mostaza text-brand-chocolate",
        peligro: "bg-brand-tomate text-brand-crema",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface ClayBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof clayBadge> {}

export function ClayBadge({ className, variant, ...props }: ClayBadgeProps) {
  return <span className={cn(clayBadge({ variant }), className)} {...props} />;
}
