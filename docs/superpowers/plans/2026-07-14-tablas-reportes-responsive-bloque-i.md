# Bloque I — Tablas de reportes de Admin responsive: Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que las 7 tablas de reporte de Admin se adapten a cualquier pantalla: en desktop siguen siendo la tabla real de siempre; en móvil (<640px) cada fila se convierte en una tarjeta apilada, sin scroll horizontal.

**Architecture:** Un componente genérico `components/reportes/TablaReporte.tsx` renderiza dos superficies desde el mismo arreglo de columnas — una `<table>` (visible desde `sm:`) y una lista de `ClayCard` apiladas (visible por debajo de `sm:`), usando clases `hidden sm:block` / `sm:hidden`. Las 7 vistas migran su `<table>` manual a este componente, moviendo su formateo (badges, `formatearCOP`, `formatearFecha`, etiquetas) a la función `render` de cada columna. Un fix adicional de una clase (`flex-wrap`) corrige el desborde del nav de tabs de reportes en móvil.

**Tech Stack:** Next.js 15 App Router, TypeScript estricto, Tailwind CSS, componentes `ClayCard`/`ClayBadge` existentes.

## Global Constraints

- Sin `any`. Genéricos tipados (`TablaReporte<T>`).
- Nombres en español para el dominio (`columnas`, `filas`, `claveFila`), consistente con `BotonExportar`.
- No se toca lógica de negocio ni Server Actions — cambio puramente de presentación.
- Sin scroll horizontal para tablas en móvil (decisión de negocio confirmada con mockup, opción A).
- La primera columna del arreglo `columnas` es siempre el título de la tarjeta en móvil — no se agrega ninguna prop extra para marcarla.
- Cada vista debe verse visualmente igual en desktop que antes del cambio (mismo markup de `<table>`, mismas clases).
- `pnpm lint && pnpm test && pnpm build` deben quedar verdes antes de dar cualquier task por terminada.

---

### Task 1: Componente `TablaReporte`

**Files:**
- Create: `components/reportes/TablaReporte.tsx`

**Interfaces:**
- Consumes: `ClayCard` de `@/components/ui/ClayCard` (variant `"flat"`, ya soporta `className`).
- Produces:
  ```typescript
  export interface ColumnaReporte<T> {
    clave: string;
    encabezado: string;
    render?: (fila: T) => React.ReactNode;
  }
  export interface TablaReporteProps<T> {
    columnas: ColumnaReporte<T>[];
    filas: T[];
    claveFila: (fila: T) => string;
  }
  export function TablaReporte<T>(props: TablaReporteProps<T>): React.JSX.Element | null
  ```
  Las 7 vistas (Tasks 2-4) consumen `TablaReporte` con estas firmas exactas.

- [ ] **Step 1: Crear el componente**

Archivo completo `components/reportes/TablaReporte.tsx`:

```typescript
import { ClayCard } from "@/components/ui/ClayCard";

export interface ColumnaReporte<T> {
  clave: string;
  encabezado: string;
  /** Si no se da, se muestra String(fila[clave]) sin formatear. */
  render?: (fila: T) => React.ReactNode;
}

export interface TablaReporteProps<T> {
  columnas: ColumnaReporte<T>[];
  filas: T[];
  claveFila: (fila: T) => string;
}

function valorColumna<T>(columna: ColumnaReporte<T>, fila: T): React.ReactNode {
  if (columna.render) return columna.render(fila);
  const valor = (fila as Record<string, unknown>)[columna.clave];
  return valor === null || valor === undefined ? "" : String(valor);
}

/** Tabla de reporte responsive: en desktop (`sm:` en adelante) es una tabla
 *  real; en móvil cada fila se convierte en una tarjeta apilada, con la
 *  primera columna del arreglo como título (CLAUDE.md Bloque I). */
export function TablaReporte<T>({ columnas, filas, claveFila }: TablaReporteProps<T>) {
  const [primera, ...resto] = columnas;
  if (!primera) return null;

  return (
    <>
      <ClayCard variant="flat" className="hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-black/10 text-text-secondary">
              {columnas.map((columna) => (
                <th key={columna.clave} className="py-2 pr-4">
                  {columna.encabezado}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={claveFila(fila)} className="border-b border-black/5 text-text-primary">
                {columnas.map((columna) => (
                  <td key={columna.clave} className="py-2 pr-4">
                    {valorColumna(columna, fila)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ClayCard>

      <div className="flex flex-col gap-3 sm:hidden">
        {filas.map((fila) => (
          <ClayCard key={claveFila(fila)} variant="flat">
            <div className="font-display text-base text-text-primary">{valorColumna(primera, fila)}</div>
            <div className="mt-2 flex flex-col">
              {resto.map((columna) => (
                <div
                  key={columna.clave}
                  className="flex items-center justify-between border-t border-(--border-soft) py-1.5 text-sm first:border-t-0"
                >
                  <span className="text-text-secondary">{columna.encabezado}</span>
                  <span className="text-text-primary">{valorColumna(columna, fila)}</span>
                </div>
              ))}
            </div>
          </ClayCard>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verificar tipos, lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores (el componente aún no se usa en ninguna vista, así que no cambia ninguna pantalla todavía).

- [ ] **Step 3: Commit**

```bash
git add components/reportes/TablaReporte.tsx
git commit -m "feat: componente TablaReporte responsive (tabla desktop / tarjetas movil)"
```

---

### Task 2: Migrar Ventas, Métodos de pago y Canales

**Files:**
- Modify: `app/(admin)/reportes/ventas/VistaVentas.tsx`
- Modify: `app/(admin)/reportes/metodos-pago/VistaMetodosPago.tsx`
- Modify: `app/(admin)/reportes/canales/VistaCanales.tsx`

**Interfaces:**
- Consumes: `TablaReporte<T>`, `ColumnaReporte<T>` de `@/components/reportes/TablaReporte` (Task 1).
- Produces: nada nuevo — estas 3 vistas quedan consumidas por nadie más.

- [ ] **Step 1: Migrar `VistaVentas.tsx`**

En `app/(admin)/reportes/ventas/VistaVentas.tsx`, agregar el import:

```typescript
import { TablaReporte, type ColumnaReporte } from "@/components/reportes/TablaReporte";
```

Justo antes de `export function VistaVentas()`, agregar:

```typescript
const columnasVentas: ColumnaReporte<FilaVentaDiaria>[] = [
  { clave: "dia", encabezado: "Día" },
  { clave: "canal", encabezado: "Canal", render: (f) => ETIQUETA_CANAL[f.canal] ?? f.canal },
  { clave: "numPedidos", encabezado: "Pedidos" },
  {
    clave: "totalCop",
    encabezado: "Total",
    render: (f) => <span className="font-mono">{formatearCOP(BigInt(f.totalCop))}</span>,
  },
];
```

Reemplazar el bloque:

```typescript
          <ClayCard variant="flat" className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-text-secondary">
                  <th className="py-2 pr-4">Día</th>
                  <th className="py-2 pr-4">Canal</th>
                  <th className="py-2 pr-4">Pedidos</th>
                  <th className="py-2 pr-4">Total</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={`${f.dia}-${f.canal}`} className="border-b border-black/5 text-text-primary">
                    <td className="py-2 pr-4">{f.dia}</td>
                    <td className="py-2 pr-4">{ETIQUETA_CANAL[f.canal] ?? f.canal}</td>
                    <td className="py-2 pr-4">{f.numPedidos}</td>
                    <td className="py-2 pr-4 font-mono">{formatearCOP(BigInt(f.totalCop))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ClayCard>
```

por:

```typescript
          <TablaReporte columnas={columnasVentas} filas={filas} claveFila={(f) => `${f.dia}-${f.canal}`} />
```

`ClayCard` sigue usándose en otras partes del archivo (gráfica de barras, mapa de calor) — no quitar su import.

- [ ] **Step 2: Migrar `VistaMetodosPago.tsx`**

En `app/(admin)/reportes/metodos-pago/VistaMetodosPago.tsx`, agregar el import:

```typescript
import { TablaReporte, type ColumnaReporte } from "@/components/reportes/TablaReporte";
```

Justo antes de `export function VistaMetodosPago()`, agregar:

```typescript
const columnasMetodosPago: ColumnaReporte<FilaMetodoPago>[] = [
  { clave: "metodo", encabezado: "Método", render: (f) => ETIQUETA_METODO[f.metodo] ?? f.metodo },
  {
    clave: "totalCop",
    encabezado: "Total",
    render: (f) => <span className="font-mono">{formatearCOP(BigInt(f.totalCop))}</span>,
  },
  { clave: "numPagos", encabezado: "Pagos" },
  { clave: "porcentaje", encabezado: "%", render: (f) => `${f.porcentaje.toFixed(1)}%` },
];
```

Reemplazar el bloque:

```typescript
          <ClayCard variant="flat" className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-text-secondary">
                  <th className="py-2 pr-4">Método</th>
                  <th className="py-2 pr-4">Total</th>
                  <th className="py-2 pr-4">Pagos</th>
                  <th className="py-2 pr-4">%</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.metodo} className="border-b border-black/5 text-text-primary">
                    <td className="py-2 pr-4">{ETIQUETA_METODO[f.metodo] ?? f.metodo}</td>
                    <td className="py-2 pr-4 font-mono">{formatearCOP(BigInt(f.totalCop))}</td>
                    <td className="py-2 pr-4">{f.numPagos}</td>
                    <td className="py-2 pr-4">{f.porcentaje.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ClayCard>
```

por:

```typescript
          <TablaReporte columnas={columnasMetodosPago} filas={filas} claveFila={(f) => f.metodo} />
```

- [ ] **Step 3: Migrar `VistaCanales.tsx`**

En `app/(admin)/reportes/canales/VistaCanales.tsx`, agregar el import:

```typescript
import { TablaReporte, type ColumnaReporte } from "@/components/reportes/TablaReporte";
```

Justo antes de `export function VistaCanales()`, agregar:

```typescript
const columnasCanales: ColumnaReporte<FilaCanal>[] = [
  { clave: "canal", encabezado: "Canal", render: (f) => ETIQUETA_CANAL[f.canal] ?? f.canal },
  {
    clave: "totalCop",
    encabezado: "Total",
    render: (f) => <span className="font-mono">{formatearCOP(BigInt(f.totalCop))}</span>,
  },
  { clave: "numPedidos", encabezado: "Pedidos" },
  { clave: "porcentaje", encabezado: "%", render: (f) => `${f.porcentaje.toFixed(1)}%` },
];
```

Reemplazar el bloque:

```typescript
          <ClayCard variant="flat" className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-text-secondary">
                  <th className="py-2 pr-4">Canal</th>
                  <th className="py-2 pr-4">Total</th>
                  <th className="py-2 pr-4">Pedidos</th>
                  <th className="py-2 pr-4">%</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.canal} className="border-b border-black/5 text-text-primary">
                    <td className="py-2 pr-4">{ETIQUETA_CANAL[f.canal] ?? f.canal}</td>
                    <td className="py-2 pr-4 font-mono">{formatearCOP(BigInt(f.totalCop))}</td>
                    <td className="py-2 pr-4">{f.numPedidos}</td>
                    <td className="py-2 pr-4">{f.porcentaje.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ClayCard>
```

por:

```typescript
          <TablaReporte columnas={columnasCanales} filas={filas} claveFila={(f) => f.canal} />
```

- [ ] **Step 4: Verificar lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add app/\(admin\)/reportes/ventas/VistaVentas.tsx app/\(admin\)/reportes/metodos-pago/VistaMetodosPago.tsx app/\(admin\)/reportes/canales/VistaCanales.tsx
git commit -m "feat: migrar tablas de Ventas, Metodos de pago y Canales a TablaReporte responsive"
```

---

### Task 3: Migrar Productos y Categorías

**Files:**
- Modify: `app/(admin)/reportes/productos/VistaProductos.tsx`
- Modify: `app/(admin)/reportes/categorias/VistaCategorias.tsx`

**Interfaces:**
- Consumes: `TablaReporte<T>`, `ColumnaReporte<T>` de `@/components/reportes/TablaReporte` (Task 1).

- [ ] **Step 1: Migrar `VistaProductos.tsx`**

En `app/(admin)/reportes/productos/VistaProductos.tsx`, agregar el import:

```typescript
import { TablaReporte, type ColumnaReporte } from "@/components/reportes/TablaReporte";
```

Justo antes de `export function VistaProductos()`, agregar:

```typescript
const columnasProductos: ColumnaReporte<FilaProducto>[] = [
  { clave: "nombre", encabezado: "Producto" },
  { clave: "categoriaNombre", encabezado: "Categoría" },
  { clave: "unidades", encabezado: "Unidades" },
  {
    clave: "ingresoCop",
    encabezado: "Ingreso",
    render: (f) => <span className="font-mono">{formatearCOP(BigInt(f.ingresoCop))}</span>,
  },
];
```

Reemplazar el bloque:

```typescript
          <ClayCard variant="flat" className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-text-secondary">
                  <th className="py-2 pr-4">Producto</th>
                  <th className="py-2 pr-4">Categoría</th>
                  <th className="py-2 pr-4">Unidades</th>
                  <th className="py-2 pr-4">Ingreso</th>
                </tr>
              </thead>
              <tbody>
                {filasOrdenadas.map((f) => (
                  <tr key={f.productoId} className="border-b border-black/5 text-text-primary">
                    <td className="py-2 pr-4">{f.nombre}</td>
                    <td className="py-2 pr-4">{f.categoriaNombre}</td>
                    <td className="py-2 pr-4">{f.unidades}</td>
                    <td className="py-2 pr-4 font-mono">{formatearCOP(BigInt(f.ingresoCop))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ClayCard>
```

por:

```typescript
          <TablaReporte columnas={columnasProductos} filas={filasOrdenadas} claveFila={(f) => f.productoId} />
```

- [ ] **Step 2: Migrar `VistaCategorias.tsx`**

En `app/(admin)/reportes/categorias/VistaCategorias.tsx`, agregar el import:

```typescript
import { TablaReporte, type ColumnaReporte } from "@/components/reportes/TablaReporte";
```

Justo antes de `export function VistaCategorias()`, agregar:

```typescript
const columnasCategorias: ColumnaReporte<FilaCategoria>[] = [
  { clave: "categoriaNombre", encabezado: "Categoría" },
  { clave: "unidades", encabezado: "Unidades" },
  {
    clave: "ingresoCop",
    encabezado: "Ingreso",
    render: (f) => <span className="font-mono">{formatearCOP(BigInt(f.ingresoCop))}</span>,
  },
  { clave: "porcentaje", encabezado: "%", render: (f) => `${f.porcentaje.toFixed(1)}%` },
];
```

Reemplazar el bloque:

```typescript
          <ClayCard variant="flat" className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-text-secondary">
                  <th className="py-2 pr-4">Categoría</th>
                  <th className="py-2 pr-4">Unidades</th>
                  <th className="py-2 pr-4">Ingreso</th>
                  <th className="py-2 pr-4">%</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.categoriaId} className="border-b border-black/5 text-text-primary">
                    <td className="py-2 pr-4">{f.categoriaNombre}</td>
                    <td className="py-2 pr-4">{f.unidades}</td>
                    <td className="py-2 pr-4 font-mono">{formatearCOP(BigInt(f.ingresoCop))}</td>
                    <td className="py-2 pr-4">{f.porcentaje.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ClayCard>
```

por:

```typescript
          <TablaReporte columnas={columnasCategorias} filas={filas} claveFila={(f) => f.categoriaId} />
```

- [ ] **Step 3: Verificar lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/\(admin\)/reportes/productos/VistaProductos.tsx app/\(admin\)/reportes/categorias/VistaCategorias.tsx
git commit -m "feat: migrar tablas de Productos y Categorias a TablaReporte responsive"
```

---

### Task 4: Migrar Anulaciones y Arqueos

**Files:**
- Modify: `app/(admin)/reportes/anulaciones/VistaAnulaciones.tsx`
- Modify: `app/(admin)/reportes/arqueos/VistaArqueos.tsx`

**Interfaces:**
- Consumes: `TablaReporte<T>`, `ColumnaReporte<T>` de `@/components/reportes/TablaReporte` (Task 1).

- [ ] **Step 1: Migrar `VistaAnulaciones.tsx`**

En `app/(admin)/reportes/anulaciones/VistaAnulaciones.tsx`, agregar el import:

```typescript
import { TablaReporte, type ColumnaReporte } from "@/components/reportes/TablaReporte";
```

Justo antes de `export function VistaAnulaciones()`, agregar:

```typescript
const columnasAnulaciones: ColumnaReporte<FilaAnulacion>[] = [
  { clave: "pedidoNumeroCorto", encabezado: "Pedido", render: (f) => `#${f.pedidoNumeroCorto}` },
  { clave: "anuladoEn", encabezado: "Fecha", render: (f) => formatearFecha(new Date(f.anuladoEn)) },
  { clave: "usuarioNombre", encabezado: "Anulado por" },
  { clave: "motivo", encabezado: "Motivo" },
  {
    clave: "totalCop",
    encabezado: "Total",
    render: (f) => <span className="font-mono">{formatearCOP(BigInt(f.totalCop))}</span>,
  },
];
```

Reemplazar el bloque:

```typescript
          <ClayCard variant="flat" className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-text-secondary">
                  <th className="py-2 pr-4">Pedido</th>
                  <th className="py-2 pr-4">Fecha</th>
                  <th className="py-2 pr-4">Anulado por</th>
                  <th className="py-2 pr-4">Motivo</th>
                  <th className="py-2 pr-4">Total</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.anulacionId} className="border-b border-black/5 text-text-primary">
                    <td className="py-2 pr-4">#{f.pedidoNumeroCorto}</td>
                    <td className="py-2 pr-4">{formatearFecha(new Date(f.anuladoEn))}</td>
                    <td className="py-2 pr-4">{f.usuarioNombre}</td>
                    <td className="py-2 pr-4">{f.motivo}</td>
                    <td className="py-2 pr-4 font-mono">{formatearCOP(BigInt(f.totalCop))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ClayCard>
```

por:

```typescript
          <TablaReporte columnas={columnasAnulaciones} filas={filas} claveFila={(f) => f.anulacionId} />
```

- [ ] **Step 2: Migrar `VistaArqueos.tsx`**

En `app/(admin)/reportes/arqueos/VistaArqueos.tsx`, agregar el import (junto a los ya existentes de `ClayCard`, `ClayBadge`, etc. — no quitar ninguno, `ClayBadge` se sigue usando dentro de `render`):

```typescript
import { TablaReporte, type ColumnaReporte } from "@/components/reportes/TablaReporte";
```

Justo antes de `export function VistaArqueos()`, agregar:

```typescript
const columnasArqueos: ColumnaReporte<FilaArqueo>[] = [
  { clave: "cajeraNombre", encabezado: "Cajera" },
  { clave: "abiertoEn", encabezado: "Apertura", render: (f) => formatearFecha(new Date(f.abiertoEn)) },
  { clave: "cerradoEn", encabezado: "Cierre", render: (f) => formatearFecha(new Date(f.cerradoEn)) },
  {
    clave: "esperadoCop",
    encabezado: "Esperado",
    render: (f) => <span className="font-mono">{formatearCOP(BigInt(f.esperadoCop))}</span>,
  },
  {
    clave: "declaradoCop",
    encabezado: "Declarado",
    render: (f) => <span className="font-mono">{formatearCOP(BigInt(f.declaradoCop))}</span>,
  },
  {
    clave: "diferenciaCop",
    encabezado: "Diferencia",
    render: (f) => (
      <ClayBadge variant={f.diferenciaCop === 0 ? "exito" : "peligro"}>
        {formatearCOP(BigInt(f.diferenciaCop))}
      </ClayBadge>
    ),
  },
];
```

Reemplazar el bloque:

```typescript
          <ClayCard variant="flat" className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-text-secondary">
                  <th className="py-2 pr-4">Cajera</th>
                  <th className="py-2 pr-4">Apertura</th>
                  <th className="py-2 pr-4">Cierre</th>
                  <th className="py-2 pr-4">Esperado</th>
                  <th className="py-2 pr-4">Declarado</th>
                  <th className="py-2 pr-4">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.turnoId} className="border-b border-black/5 text-text-primary">
                    <td className="py-2 pr-4">{f.cajeraNombre}</td>
                    <td className="py-2 pr-4">{formatearFecha(new Date(f.abiertoEn))}</td>
                    <td className="py-2 pr-4">{formatearFecha(new Date(f.cerradoEn))}</td>
                    <td className="py-2 pr-4 font-mono">{formatearCOP(BigInt(f.esperadoCop))}</td>
                    <td className="py-2 pr-4 font-mono">{formatearCOP(BigInt(f.declaradoCop))}</td>
                    <td className="py-2 pr-4">
                      <ClayBadge variant={f.diferenciaCop === 0 ? "exito" : "peligro"}>
                        {formatearCOP(BigInt(f.diferenciaCop))}
                      </ClayBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ClayCard>
```

por:

```typescript
          <TablaReporte columnas={columnasArqueos} filas={filas} claveFila={(f) => f.turnoId} />
```

- [ ] **Step 3: Verificar lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/\(admin\)/reportes/anulaciones/VistaAnulaciones.tsx app/\(admin\)/reportes/arqueos/VistaArqueos.tsx
git commit -m "feat: migrar tablas de Anulaciones y Arqueos a TablaReporte responsive"
```

---

### Task 5: Nav de tabs de reportes — fix de desborde en móvil

**Files:**
- Modify: `app/(admin)/reportes/layout.tsx:34`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: nada nuevo.

- [ ] **Step 1: Agregar `flex-wrap` al nav**

En `app/(admin)/reportes/layout.tsx`, la clase del `<nav>` (línea 34) es hoy:

```typescript
        className="flex gap-2 border-b border-white/10 px-8 pt-8"
```

Cambiar a:

```typescript
        className="flex flex-wrap gap-2 border-b border-white/10 px-8 pt-8"
```

- [ ] **Step 2: Verificar lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/reportes/layout.tsx
git commit -m "fix: envolver tabs de reportes en varias lineas en pantallas angostas"
```

---

### Task 6: Verificación manual y suite completa

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Levantar el servidor de desarrollo**

Run: `pnpm dev` (dejarlo corriendo en background)

- [ ] **Step 2: Verificar cada una de las 7 vistas en desktop**

Con el navegador en ancho de escritorio (≥1024px), visitar y confirmar que la tabla se ve exactamente igual que antes del cambio (mismas columnas, mismo formato, mismos badges):

- `/reportes/ventas`
- `/reportes/metodos-pago`
- `/reportes/canales`
- `/reportes/productos`
- `/reportes/categorias`
- `/reportes/anulaciones`
- `/reportes/arqueos`

- [ ] **Step 3: Verificar cada una de las 7 vistas en viewport móvil (~375px)**

Con las DevTools en modo responsive (~375px de ancho), visitar las mismas 7 rutas y confirmar:

- Cada fila se ve como una tarjeta apilada, sin scroll horizontal.
- La primera columna (Día/Método/Canal/Producto/Categoría/Pedido/Cajera) aparece como título de la tarjeta.
- El resto de columnas aparece como pares etiqueta: valor, en el mismo orden que en desktop.
- Los badges de color (`ClayBadge` en Arqueos → Diferencia) y los montos en `font-mono` se ven igual que en desktop.
- El nav de tabs de reportes se envuelve en varias líneas en vez de desbordarse.

- [ ] **Step 4: Correr la suite completa**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: todo verde (162 tests unitarios o el conteo vigente, sin regresiones — este bloque no agrega tests nuevos porque no hay lógica de negocio nueva).

- [ ] **Step 5: Commit final (si hubo ajustes durante la verificación)**

Si la verificación manual no requirió cambios, este paso se omite. Si se encontró algún detalle visual a ajustar, corregirlo y:

```bash
git add -A
git commit -m "fix: ajustes de verificacion manual en tablas de reportes responsive"
```

---

## Self-Review

- **Cobertura del spec:** Componente `TablaReporte` (Task 1) ✓, migración de las 7 vistas con la primera columna como título en cada una (Tasks 2-4) ✓, `flex-wrap` en el nav (Task 5) ✓, verificación manual desktop+móvil en las 7 vistas (Task 6) ✓. Gráficas Recharts explícitamente fuera de alcance, sin tasks que las toquen ✓.
- **Placeholders:** ninguno — cada step trae el código completo a escribir.
- **Consistencia de tipos:** `ColumnaReporte<T>`/`TablaReporteProps<T>` definidos una sola vez en Task 1 y usados con los mismos nombres de prop (`columnas`, `filas`, `claveFila`) en las 7 migraciones (Tasks 2-4). Cada `clave` de columna coincide exactamente con el campo real del tipo `Fila*` importado desde el `actions.ts` de cada vista.
