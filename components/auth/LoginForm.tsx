"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { createClient } from "@/lib/supabase/client";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayCard } from "@/components/ui/ClayCard";
import { ClayInput } from "@/components/ui/ClayInput";

export function LoginForm() {
  const router = useRouter();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (datos) => {
    setErrorGeneral(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword(datos);
    if (error) {
      setErrorGeneral("Correo o contraseña incorrectos. Verifica e intenta de nuevo.");
      return;
    }
    router.push("/pin");
    router.refresh();
  });

  return (
    <ClayCard>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <ClayInput
          label="Correo electrónico"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <ClayInput
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password")}
        />
        {errorGeneral ? <p className="text-sm text-brand-tomate">{errorGeneral}</p> : null}
        <ClayButton type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Ingresando…" : "Ingresar"}
        </ClayButton>
      </form>
    </ClayCard>
  );
}
