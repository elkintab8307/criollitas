import { z } from "zod";

export const motivoAnulacionSchema = z.object({
  motivo: z
    .string()
    .min(5, "Escribe un motivo de al menos 5 caracteres")
    .max(500, "El motivo es demasiado largo"),
});
export type MotivoAnulacionInput = z.infer<typeof motivoAnulacionSchema>;
