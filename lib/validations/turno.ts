import { z } from "zod";

export const efectivoInicialSchema = z.object({
  efectivoInicialPesos: z
    .number("Escribe el efectivo inicial")
    .int("No se admiten centavos")
    .min(0, "El efectivo inicial no puede ser negativo"),
});
export type EfectivoInicialInput = z.infer<typeof efectivoInicialSchema>;

export const movimientoSchema = z.object({
  tipo: z.enum(["retiro", "gasto", "ingreso_extra"], "Elige un tipo de movimiento"),
  concepto: z.string().min(3, "Escribe el concepto del movimiento").max(200, "El concepto es demasiado largo"),
  montoPesos: z
    .number("Escribe el monto")
    .int("No se admiten centavos")
    .min(1, "El monto debe ser mayor a cero"),
});
export type MovimientoInput = z.infer<typeof movimientoSchema>;

export const cierreTurnoSchema = z.object({
  efectivoDeclaradoPesos: z
    .number("Escribe el efectivo contado")
    .int("No se admiten centavos")
    .min(0, "El efectivo contado no puede ser negativo"),
});
export type CierreTurnoInput = z.infer<typeof cierreTurnoSchema>;
