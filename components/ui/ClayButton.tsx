import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const clayButton = cva(
  [
    "inline-flex items-center justify-center gap-2 font-display font-semibold",
    "rounded-clay-md shadow-clay-sm transition-all duration-150 select-none",
    "hover:shadow-clay-md active:shadow-clay-pressed active:translate-y-px",
    "focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2",
    "disabled:opacity-50 disabled:saturate-50 disabled:pointer-events-none",
  ],
  {
    variants: {
      variant: {
        primary: "bg-brand-mostaza text-brand-chocolate hover:bg-brand-mostaza-2 active:bg-brand-mostaza-3",
        secondary: "bg-brand-crema text-brand-chocolate hover:bg-brand-crema-2",
        ghost: "bg-transparent text-brand-crema shadow-none hover:bg-brand-chocolate-2",
        destructive: "bg-brand-tomate text-brand-crema hover:bg-brand-tomate-2",
        success: "bg-brand-verde text-brand-chocolate hover:bg-brand-verde-2",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-12 px-6 text-base",
        lg: "h-14 px-8 text-lg",
        xl: "h-16 px-10 text-xl",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ClayButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof clayButton> {}

export function ClayButton({ className, variant, size, ...props }: ClayButtonProps) {
  return <button className={cn(clayButton({ variant, size }), className)} {...props} />;
}
