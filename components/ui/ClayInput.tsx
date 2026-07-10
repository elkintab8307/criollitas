"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

export interface ClayInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function ClayInput({ label, error, className, id, ...props }: ClayInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="font-display text-sm font-medium text-text-primary">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "h-12 rounded-clay-md bg-surface-sunken px-4 text-base text-text-primary",
          "shadow-clay-pressed placeholder:text-text-secondary/60",
          "focus-visible:outline-3 focus-visible:outline-brand-mostaza",
          error && "outline-2 outline-brand-tomate",
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={errorId} className="text-sm text-brand-tomate-2">{error}</p>
      ) : null}
    </div>
  );
}
