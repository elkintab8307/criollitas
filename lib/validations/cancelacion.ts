import { z } from "zod";

export const motivoCancelacionSchema = z.object({
  motivo: z
    .string()
    .min(5, "Escribe un motivo de al menos 5 caracteres")
    .max(500, "El motivo es demasiado largo"),
});
export type MotivoCancelacionInput = z.infer<typeof motivoCancelacionSchema>;
