import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("Ingresa un correo válido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const pinSchema = z.object({
  usuarioId: z.uuid("Usuario inválido"),
  pin: z.string().regex(/^\d{4,6}$/, "El PIN debe tener entre 4 y 6 dígitos"),
});
export type PinInput = z.infer<typeof pinSchema>;
