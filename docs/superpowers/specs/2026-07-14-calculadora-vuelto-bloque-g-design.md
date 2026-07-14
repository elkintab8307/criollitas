# Bloque G — Calculadora de vuelto en el cobro: Diseño

## Contexto

El usuario reportó dos problemas del perfil Cajera en el mismo mensaje: falta de navegación de retorno (ya corregido en `fix/navegacion-cajera`) y que "al momento de cobrar, no esta calculando lo que da el cliente y el total a cobrar". Hoy `FormularioCobro.tsx` exige que la cajera calcule mentalmente y escriba en el campo "Monto" el valor exacto que corresponde a cada método de pago, para que la suma cuadre exactamente con el total (`pagosCuadranConTotal`). Para efectivo esto es poco realista: el cliente entrega un billete mayor al total y la cajera necesita que el sistema calcule el vuelto.

## Decisiones de negocio (confirmadas con el usuario)

1. **Alcance**: el campo "cuánto entrega el cliente" aparece para **todos los métodos de pago**, no solo efectivo.
2. **Pago mixto**: cada fila calcula su vuelto **sobre el restante** — lo que falta cubrir del total después de las filas anteriores, en orden.
3. **Campo "Monto" existente**: se mantiene, editable directamente. El nuevo campo "Cuánto entrega" es adicional y, al usarse, autocompleta "Monto" con el valor que corresponde cubrir.

## Invariante que no cambia

CLAUDE.md §2.3: la suma de los pagos debe cuadrar exactamente con el total del pedido, sin margen — documentado y validado tanto en `pagosCuadranConTotal` (TypeScript) como en el RPC `cobrar_pedido` (SQL). Esta calculadora es una capa de ayuda visual: nunca cambia qué se envía al backend (siempre es el contenido del campo "Monto", nunca el monto bruto entregado).

## Arquitectura

### Lógica de cálculo (pura, testeable)

Nueva función en `lib/caja/cuadrePago.ts`:

```typescript
interface ResultadoVuelto {
  cubreCop: MontoCOP;
  vueltoCop: MontoCOP;
}

function calcularVuelto(entregadoCop: MontoCOP, restantePorCubrirCop: MontoCOP): ResultadoVuelto
```

- `cubreCop = min(entregadoCop, restantePorCubrirCop)` — nunca cubre más de lo que falta.
- `vueltoCop = entregadoCop - cubreCop` — nunca negativo (si `entregadoCop < restantePorCubrirCop`, `vueltoCop = 0`).
- Se aplica por fila, en orden: el "restante por cubrir" de la fila N es `total - suma de cubreCop de las filas 1..N-1`. Con una sola fila (caso típico), `restante = total` y el resultado es el vuelto intuitivo.

### UI en `FormularioCobro.tsx`

- Cada fila de pago gana un campo **"Cuánto entrega el cliente"**, junto al selector de método y el campo "Monto" existente.
- Al escribir en "Cuánto entrega", se recalcula `cubreCop`/`vueltoCop` para esa fila (con el restante correcto según las filas anteriores en orden) y autocompleta "Monto" con `cubreCop` — la cajera puede seguir editando "Monto" a mano después.
- Debajo de cada fila con vuelto > 0, aparece "Vuelto: $X.XXX" en texto destacado (tamaño grande, legible a distancia, CLAUDE.md §8.4).
- El resumen general ("Total del pedido" / "Suma de pagos" / cuadre) no cambia — sigue validando que la suma de los campos "Monto" cuadre exacto con el total.
- Sin cambios al RPC `cobrar_pedido` ni a `pagosCuadranConTotal`.

## Testing

`calcularVuelto` es lógica pura — tests unitarios directos (TDD): entregado menor al restante (vuelto 0, cubre = entregado), entregado igual al restante (vuelto 0, cubre = todo), entregado mayor al restante (vuelto = diferencia, cubre = restante), casos de pago mixto con 2+ filas donde el restante de la segunda fila ya descuenta lo cubierto por la primera.

Sin necesidad de verificación en vivo contra Supabase — es lógica de UI/cálculo pura, sin tocar RLS, RPCs ni el modelo de datos.

## Fuera de alcance

- Registrar el vuelto como una fila de `pagos` o cualquier otro cambio al modelo de datos — el vuelto nunca se persiste, es puramente informativo para la cajera en el momento del cobro.
- Atajos de teclado (F2/F4/Esc) mencionados en CLAUDE.md §8.4 — no forman parte de este reporte de bug, quedan para una iteración futura si se piden explícitamente.
