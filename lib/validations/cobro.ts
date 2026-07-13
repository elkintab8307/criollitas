import { z } from "zod";

export const pagoSchema = z.object({
  metodo: z.enum(["efectivo", "nequi", "daviplata", "bancolombia_qr", "datafono", "otro"], "Elige un método de pago"),
  montoPesos: z
    .number("Escribe el monto")
    .int("No se admiten centavos")
    .min(1, "El monto debe ser mayor a cero"),
  referencia: z.string().max(100, "La referencia es demasiado larga").optional(),
});
export type PagoInput = z.infer<typeof pagoSchema>;

export const cobrarPedidoSchema = z.object({
  pagos: z.array(pagoSchema).min(1, "Agrega al menos un pago"),
});
export type CobrarPedidoInput = z.infer<typeof cobrarPedidoSchema>;
