import { z } from "zod";

export const categoriaSchema = z.object({
  nombre: z.string().min(2, "Escribe el nombre de la categoría"),
});
export type CategoriaInput = z.infer<typeof categoriaSchema>;

export const productoSchema = z.object({
  nombre: z.string().min(2, "Escribe el nombre del producto"),
  descripcion: z.string().optional(),
  categoriaId: z.uuid("Categoría inválida"),
  precioPesos: z
    .number("Escribe el precio en pesos")
    .int("El precio va en pesos, sin decimales")
    .positive("El precio debe ser mayor que cero"),
  tiempoPrepMin: z.number().int().min(0).optional(),
  activo: z.boolean().default(true),
});
export type ProductoInput = z.infer<typeof productoSchema>;

export const modificadorSchema = z
  .object({
    productoId: z.uuid("Producto inválido"),
    grupo: z.string().min(1).optional(),
    nombre: z.string().min(2, "Escribe el nombre del modificador"),
    deltaPesos: z.number().int("El valor va en pesos, sin decimales").min(0, "El valor no puede ser negativo"),
    obligatorio: z.boolean(),
    maxSeleccion: z.number().int().min(1, "Debe permitir al menos una selección"),
  })
  .refine((m) => !m.obligatorio || !!m.grupo, {
    message: "Los modificadores obligatorios necesitan un grupo",
    path: ["grupo"],
  });
export type ModificadorInput = z.infer<typeof modificadorSchema>;
