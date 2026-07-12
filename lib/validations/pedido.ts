import { z } from "zod";

export const clienteDomicilioSchema = z.object({
  nombre: z.string().min(2, "Escribe el nombre del cliente"),
  telefono: z.string().min(7, "Escribe un teléfono válido").max(15, "El teléfono es demasiado largo"),
  direccion: z.string().min(5, "Escribe la dirección de entrega"),
  referencia: z.string().optional(),
});
export type ClienteDomicilioInput = z.infer<typeof clienteDomicilioSchema>;

export const itemPedidoEnvioSchema = z.object({
  productoId: z.uuid("Producto inválido"),
  cantidad: z
    .number("Escribe la cantidad")
    .int("La cantidad no lleva decimales")
    .min(1, "La cantidad mínima es 1")
    .max(50, "La cantidad máxima es 50"),
  modificadorIds: z.array(z.uuid("Modificador inválido")).default([]),
  nota: z.string().max(200, "La nota es demasiado larga").optional(),
});
export type ItemPedidoEnvioInput = z.infer<typeof itemPedidoEnvioSchema>;

export const enviarPedidoSchema = z.object({
  items: z.array(itemPedidoEnvioSchema).min(1, "Agrega al menos un producto"),
});
export type EnviarPedidoInput = z.infer<typeof enviarPedidoSchema>;
