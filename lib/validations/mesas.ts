import { z } from "zod";

export const mesaSchema = z.object({
  numero: z
    .number("Escribe el número de la mesa")
    .int("El número no lleva decimales")
    .positive("El número debe ser mayor que cero"),
  nombre: z.string().min(1).optional(),
  capacidad: z
    .number("Escribe la capacidad")
    .int("La capacidad no lleva decimales")
    .min(1, "La capacidad mínima es 1")
    .max(20, "La capacidad máxima es 20"),
  activa: z.boolean().default(true),
});
export type MesaInput = z.infer<typeof mesaSchema>;
