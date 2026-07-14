# Bloque G — Calculadora de vuelto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la cajera pueda escribir cuánto entrega el cliente y el sistema calcule el vuelto automáticamente, sin cambiar el invariante de que la suma de pagos debe cuadrar exacto con el total.

**Architecture:** Función pura `calcularVuelto` en `lib/caja/cuadrePago.ts` (TDD), consumida por un nuevo campo por fila en `FormularioCobro.tsx` que autocompleta el campo "Monto" existente y muestra el vuelto — sin tocar el resumen de cuadre ni el backend.

**Tech Stack:** TypeScript puro (`bigint` para dinero), React (`components/caja/FormularioCobro.tsx`), vitest.

## Global Constraints

- Dinero siempre en `MontoCOP` (`bigint`, centavos) — nunca `number` para montos reales (CLAUDE.md §13.3).
- El campo "cuánto entrega" aparece para **todos** los métodos de pago, no solo efectivo.
- El vuelto se calcula **por fila, sobre el restante** (total menos lo ya cubierto por filas anteriores en orden de índice).
- El campo "Monto" existente se mantiene editable directamente — el nuevo campo solo lo autocompleta, nunca lo bloquea.
- El vuelto nunca se persiste ni se envía al backend — es puramente informativo en el cliente. Sin cambios a `pagosCuadranConTotal`, al RPC `cobrar_pedido`, ni a `cobrarPedido`.
- `pnpm lint && pnpm test && pnpm build` deben quedar en verde al final de cada tarea. 157 tests en `main` a la fecha de este plan (confirmar corriendo `pnpm test` al iniciar).
- Windows: `git commit -F <tempfile>` en vez de heredocs. Trailer: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: Función pura `calcularVuelto`

**Files:**
- Modify: `lib/caja/cuadrePago.ts`
- Test: `tests/unit/caja-cuadre-pago.test.ts`

**Interfaces:**
- Produces: `export function calcularVuelto(entregadoCop: MontoCOP, restantePorCubrirCop: MontoCOP): { cubreCop: MontoCOP; vueltoCop: MontoCOP }` — usada por `FormularioCobro.tsx` en la Task 2.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `tests/unit/caja-cuadre-pago.test.ts`:

```typescript
import { calcularVuelto, pagosCuadranConTotal } from "@/lib/caja/cuadrePago";

describe("calcularVuelto", () => {
  it("entregado menor al restante: cubre todo lo entregado, sin vuelto", () => {
    expect(calcularVuelto(20000n, 37000n)).toEqual({ cubreCop: 20000n, vueltoCop: 0n });
  });
  it("entregado igual al restante: cubre todo, sin vuelto", () => {
    expect(calcularVuelto(37000n, 37000n)).toEqual({ cubreCop: 37000n, vueltoCop: 0n });
  });
  it("entregado mayor al restante: cubre solo el restante, el resto es vuelto", () => {
    expect(calcularVuelto(50000n, 37000n)).toEqual({ cubreCop: 37000n, vueltoCop: 13000n });
  });
  it("restante cero: no cubre nada, todo es vuelto", () => {
    expect(calcularVuelto(20000n, 0n)).toEqual({ cubreCop: 0n, vueltoCop: 20000n });
  });
  it("entregado cero: no cubre nada, sin vuelto", () => {
    expect(calcularVuelto(0n, 37000n)).toEqual({ cubreCop: 0n, vueltoCop: 0n });
  });
});
```

Nota: el import de `pagosCuadranConTotal` ya existe en la primera línea del archivo (`import { pagosCuadranConTotal } from "@/lib/caja/cuadrePago";`) — reemplazar esa línea completa por la de arriba, que agrega `calcularVuelto` al mismo import.

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `pnpm test tests/unit/caja-cuadre-pago.test.ts`
Expected: FAIL — `calcularVuelto` no está exportado de `@/lib/caja/cuadrePago`.

- [ ] **Step 3: Implementar `calcularVuelto`**

Agregar al final de `lib/caja/cuadrePago.ts`:

```typescript
/** Cuánto de lo entregado cubre lo que falta del total, y cuánto vuelto
 *  corresponde devolver. Capa de ayuda visual para la cajera -- nunca
 *  cambia qué se envía al backend (siempre el campo "Monto", nunca el
 *  monto bruto entregado); el invariante de pagosCuadranConTotal no se
 *  toca. `restantePorCubrirCop` es el total menos lo ya cubierto por las
 *  filas anteriores en un pago mixto -- con una sola fila, es el total
 *  completo del pedido. */
export function calcularVuelto(
  entregadoCop: MontoCOP,
  restantePorCubrirCop: MontoCOP,
): { cubreCop: MontoCOP; vueltoCop: MontoCOP } {
  const cubreCop = entregadoCop < restantePorCubrirCop ? entregadoCop : restantePorCubrirCop;
  const vueltoCop = entregadoCop - cubreCop;
  return { cubreCop, vueltoCop };
}
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `pnpm test tests/unit/caja-cuadre-pago.test.ts`
Expected: PASS — 10/10 tests (5 ya existentes de `pagosCuadranConTotal` + 5 nuevos de `calcularVuelto`).

- [ ] **Step 5: `pnpm lint && pnpm build`**

Run: `pnpm lint && pnpm build`
Expected: exit 0 en ambos.

- [ ] **Step 6: Commit**

```bash
git add lib/caja/cuadrePago.ts tests/unit/caja-cuadre-pago.test.ts
git commit -F- <<'MSG'
feat: función pura calcularVuelto para el cobro en efectivo

MSG
```

---

### Task 2: Integrar la calculadora en `FormularioCobro.tsx`

**Files:**
- Modify: `components/caja/FormularioCobro.tsx`

**Interfaces:**
- Consumes: `calcularVuelto` (Task 1).

- [ ] **Step 1: Agregar el import**

En `components/caja/FormularioCobro.tsx`, reemplazar:

```typescript
import { pagosCuadranConTotal } from "@/lib/caja/cuadrePago";
```

por:

```typescript
import { calcularVuelto, pagosCuadranConTotal } from "@/lib/caja/cuadrePago";
```

- [ ] **Step 2: Agregar `entregaPesos` a la interfaz `FilaPago` y al estado inicial**

Reemplazar:

```typescript
interface FilaPago {
  clave: string;
  metodo: PagoInput["metodo"];
  montoPesos: number;
}
```

por:

```typescript
interface FilaPago {
  clave: string;
  metodo: PagoInput["metodo"];
  montoPesos: number;
  entregaPesos: number;
}
```

Reemplazar la línea del `useState` inicial:

```typescript
  const [pagos, setPagos] = useState<FilaPago[]>([{ clave: crypto.randomUUID(), metodo: "efectivo", montoPesos: 0 }]);
```

por:

```typescript
  const [pagos, setPagos] = useState<FilaPago[]>([
    { clave: crypto.randomUUID(), metodo: "efectivo", montoPesos: 0, entregaPesos: 0 },
  ]);
```

- [ ] **Step 3: Agregar `entregaPesos` en `agregarPago` y en `actualizarPago`**

Reemplazar:

```typescript
  function agregarPago() {
    setPagos((actual) => [...actual, { clave: crypto.randomUUID(), metodo: "efectivo", montoPesos: 0 }]);
  }
```

por:

```typescript
  function agregarPago() {
    setPagos((actual) => [
      ...actual,
      { clave: crypto.randomUUID(), metodo: "efectivo", montoPesos: 0, entregaPesos: 0 },
    ]);
  }
```

Reemplazar:

```typescript
  function actualizarPago(clave: string, cambios: Partial<Pick<FilaPago, "metodo" | "montoPesos">>) {
    setPagos((actual) => actual.map((p) => (p.clave === clave ? { ...p, ...cambios } : p)));
  }
```

por:

```typescript
  function actualizarPago(clave: string, cambios: Partial<Pick<FilaPago, "metodo" | "montoPesos" | "entregaPesos">>) {
    setPagos((actual) => actual.map((p) => (p.clave === clave ? { ...p, ...cambios } : p)));
  }
```

- [ ] **Step 4: Función auxiliar `restanteAntesDe` y `manejarEntrega`**

Agregar, justo después de la función `actualizarPago` (antes de `async function confirmar()`):

```typescript
  /** Total menos lo que ya cubren las filas anteriores a `indice`, en
   *  orden de índice -- así un pago mixto se resuelve fila por fila. */
  function restanteAntesDe(indice: number): MontoCOP {
    const cubiertoAntes = sumar(
      ...pagos.slice(0, indice).map((p) => montoDesdePesos(Math.trunc(p.montoPesos) || 0)),
    );
    const restante = totalCop - cubiertoAntes;
    return restante > 0n ? restante : 0n;
  }

  /** Al escribir "cuánto entrega el cliente" en una fila, autocompleta
   *  "Monto" con lo que corresponde cubrir del restante en ese punto. La
   *  cajera puede seguir editando "Monto" a mano después. */
  function manejarEntrega(indice: number, entregaPesos: number) {
    const entregaCop = montoDesdePesos(Math.trunc(entregaPesos) || 0);
    const { cubreCop } = calcularVuelto(entregaCop, restanteAntesDe(indice));
    const cubrePesos = Number(cubreCop / 100n);
    setPagos((filas) => filas.map((p, i) => (i === indice ? { ...p, entregaPesos, montoPesos: cubrePesos } : p)));
  }
```

Agregar `type MontoCOP` al import ya existente de `@/lib/money` en la parte superior del archivo — reemplazar:

```typescript
import { formatearCOP, montoDesdePesos, multiplicar, sumar, type MontoCOP } from "@/lib/money";
```

(Si el import actual no incluye `MontoCOP`, esta es la línea completa a dejar; los demás nombres ya estaban importados.)

- [ ] **Step 5: Agregar el input "Cuánto entrega" y el texto de vuelto en el JSX de cada fila**

Reemplazar el bloque JSX de cada fila de pago:

```typescript
      {pagos.map((pago) => (
        <div key={pago.clave} className="flex items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="font-display text-sm font-medium text-text-primary">Método</label>
            <select
              value={pago.metodo}
              onChange={(evento) => actualizarPago(pago.clave, { metodo: evento.target.value as PagoInput["metodo"] })}
              className="h-12 rounded-clay-md bg-surface-sunken px-4 text-base text-text-primary shadow-clay-pressed"
            >
              {(Object.keys(ETIQUETA_METODO) as PagoInput["metodo"][]).map((metodo) => (
                <option key={metodo} value={metodo}>
                  {ETIQUETA_METODO[metodo]}
                </option>
              ))}
            </select>
          </div>
          <ClayInput
            label="Monto (pesos)"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={pago.montoPesos || ""}
            onChange={(evento) =>
              actualizarPago(pago.clave, { montoPesos: Math.trunc(Number(evento.target.value)) || 0 })
            }
          />
          {pagos.length > 1 ? (
            <button
              type="button"
              aria-label="Quitar pago"
              onClick={() => quitarPago(pago.clave)}
              className="mb-1 text-brand-tomate-2 hover:text-brand-tomate"
            >
              ✕
            </button>
          ) : null}
        </div>
      ))}
```

por:

```typescript
      {pagos.map((pago, indice) => {
        const { vueltoCop } = calcularVuelto(
          montoDesdePesos(Math.trunc(pago.entregaPesos) || 0),
          restanteAntesDe(indice),
        );
        return (
          <div key={pago.clave} className="flex flex-col gap-2 rounded-clay-md bg-surface-sunken p-3">
            <div className="flex items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="font-display text-sm font-medium text-text-primary">Método</label>
                <select
                  value={pago.metodo}
                  onChange={(evento) =>
                    actualizarPago(pago.clave, { metodo: evento.target.value as PagoInput["metodo"] })
                  }
                  className="h-12 rounded-clay-md bg-surface-sunken px-4 text-base text-text-primary shadow-clay-pressed"
                >
                  {(Object.keys(ETIQUETA_METODO) as PagoInput["metodo"][]).map((metodo) => (
                    <option key={metodo} value={metodo}>
                      {ETIQUETA_METODO[metodo]}
                    </option>
                  ))}
                </select>
              </div>
              <ClayInput
                label="Cuánto entrega el cliente"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={pago.entregaPesos || ""}
                onChange={(evento) => manejarEntrega(indice, Math.trunc(Number(evento.target.value)) || 0)}
              />
              <ClayInput
                label="Monto (pesos)"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={pago.montoPesos || ""}
                onChange={(evento) =>
                  actualizarPago(pago.clave, { montoPesos: Math.trunc(Number(evento.target.value)) || 0 })
                }
              />
              {pagos.length > 1 ? (
                <button
                  type="button"
                  aria-label="Quitar pago"
                  onClick={() => quitarPago(pago.clave)}
                  className="mb-1 text-brand-tomate-2 hover:text-brand-tomate"
                >
                  ✕
                </button>
              ) : null}
            </div>
            {vueltoCop > 0n ? (
              <p className="font-mono text-lg font-semibold text-brand-verde-2">
                Vuelto: {formatearCOP(vueltoCop)}
              </p>
            ) : null}
          </div>
        );
      })}
```

- [ ] **Step 6: `pnpm lint && pnpm test && pnpm build`**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: exit 0 en los tres, 162/162 tests (157 previos + 5 nuevos de la Task 1).

- [ ] **Step 7: Commit**

```bash
git add components/caja/FormularioCobro.tsx
git commit -F- <<'MSG'
feat: campo "cuánto entrega" con cálculo de vuelto en el cobro

MSG
```

---

## Self-Review

**Cobertura del spec:** función pura `calcularVuelto` con TDD (Task 1); campo "cuánto entrega" para todos los métodos, cálculo por fila sobre el restante, autocompletado de "Monto" sin bloquearlo, texto de vuelto destacado, resumen general sin cambios (Task 2). Sin cambios a `pagosCuadranConTotal`/RPC/Server Action en ninguna task — cumple "fuera de alcance" del spec.

**Placeholders:** ninguno.

**Consistencia de tipos:** `calcularVuelto(entregadoCop: MontoCOP, restantePorCubrirCop: MontoCOP): { cubreCop: MontoCOP; vueltoCop: MontoCOP }` es la misma firma en la Task 1 (definición) y la Task 2 (consumo en `manejarEntrega` y en el JSX, ambos vía la función auxiliar `restanteAntesDe`). `FilaPago` con el campo `entregaPesos` agregado se usa consistentemente en el estado inicial, `agregarPago`, `actualizarPago` y el JSX.
