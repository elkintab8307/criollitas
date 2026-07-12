import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const clayCard = cva("rounded-clay-lg p-6 text-text-primary", {
  variants: {
    variant: {
      default: "bg-brand-crema shadow-clay-md",
      elevated: "bg-surface-elevated shadow-clay-lg",
      flat: "bg-brand-crema border border-(--border-soft)",
      sunken: "bg-surface-sunken shadow-clay-pressed",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface ClayCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof clayCard> {}

export function ClayCard({ className, variant, ...props }: ClayCardProps) {
  return <div className={cn(clayCard({ variant }), className)} {...props} />;
}
