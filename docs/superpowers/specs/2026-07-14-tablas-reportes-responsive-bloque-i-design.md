# Bloque I — Tablas de reportes de Admin responsive: Diseño

## Contexto

Segunda pieza de la iniciativa de diseño más amplia (Bloque H, logo/header, ya en `main`, fue la primera). El usuario pidió: "quiero que las tablas de reportes en Admin tengan la capacidad de adaptarse a cualquier pantalla."

Las 7 vistas de reporte (`app/(admin)/reportes/{ventas,metodos-pago,canales,productos,categorias,arqueos,anulaciones}/Vista*.tsx`) comparten el mismo patrón: `<ClayCard variant="flat" className="overflow-x-auto"><table>...</table></ClayCard>`. El scroll horizontal ya existe como mitigación mínima, pero no es "adaptarse" — solo evita que el layout se rompa.

## Decisiones de negocio (confirmadas con el usuario, incluyendo mockup visual)

1. **Patrón móvil**: cada fila de tabla se convierte en una tarjeta apilada (`ClayCard`) en pantallas angostas, con la primera columna como título y el resto como pares etiqueta: valor. Sin scroll horizontal en absoluto para las tablas.

## Arquitectura

### Componente compartido `TablaReporte`

Nuevo `components/reportes/TablaReporte.tsx`, genérico:

```typescript
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
```

- **Desktop** (`sm:` en adelante, ≥640px): renderiza la `<table>` real, mismo markup que las 7 vistas ya tienen hoy.
- **Móvil** (<640px): cada fila es una `ClayCard`. La primera columna del arreglo `columnas` es siempre el título de la tarjeta — es la columna identificadora natural en las 7 vistas (Día, Método, Canal, Producto, Categoría, Pedido, Cajera), sin necesidad de una prop extra para marcarla. Las columnas restantes se listan debajo como pares etiqueta: valor, en el mismo orden del arreglo.
- Cada vista migra su `<table>` manual a `<TablaReporte columnas={...} filas={...} claveFila={...} />`, moviendo su formateo actual (badges de `ClayBadge`, `formatearCOP`, `formatearFecha`) a la función `render` de la columna correspondiente — sin perder ningún detalle visual ya existente (ej. el badge de color en la columna Diferencia de Arqueos).

### Nav de tabs de reportes (hallazgo relacionado)

`app/(admin)/reportes/layout.tsx` (comparte los 7 tabs entre todas las vistas) usa hoy `flex gap-2` sin `flex-wrap` — con 7 tabs se desborda en pantallas angostas, contradiciendo la meta aunque las tablas queden perfectas. Se agrega `flex-wrap` (cambio mínimo, sin tocar el resto del componente).

## Testing

Sin lógica de negocio nueva — es estructural/visual. Verificación manual con `pnpm dev` en las 7 vistas, en desktop y en viewport móvil (~375px): confirmar que la tabla se ve igual que hoy en desktop, que se convierte en tarjetas en móvil sin perder ningún dato ni formato (badges, montos, fechas), y que el nav de tabs se envuelve en vez de desbordarse.

## Fuera de alcance

- Cualquier cambio a las gráficas Recharts (`ResponsiveContainer` ya las hace responsive por diseño de la librería).
- Rediseño visual general del resto de la app — iniciativas separadas, ya en curso (Bloque H) o pendientes de definir.
