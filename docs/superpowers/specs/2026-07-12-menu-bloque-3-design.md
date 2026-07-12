# Diseño: Bloque 3 — Menú (categorías, productos, modificadores, imágenes)

**Fecha:** 2026-07-12
**Estado:** diseño aprobado verbalmente (estilo de imágenes A y valores provisionales confirmados por el usuario); pendiente revisión de este documento.
**Alcance:** Roadmap §16 bloque 3. Rama `feature/menu-bloque-3` (apilada sobre `feature/bootstrap-bloques-1-2` mientras el PR #1 no se merjee; retarget a `main` después).

---

## 1. Fuente de verdad del menú

Carta física fotografiada en `1.jpeg` (no se commitea). Contenido:

| Categoría (orden) | Producto | Precio | Notas |
|---|---|---|---|
| Arepas Rellenas (1) | Super Criollita | $17.000 | queso de tu elección, carne, pollo desmechado y chicharrón |
| | Criollita con Res | $15.000 | queso de tu elección y carne desmechada |
| | Criollita con Pollo | $14.000 | queso de tu elección y pollo desmechado |
| | Criollita de Huevos Pericos | $11.000 | queso, huevos pericos y salchicha ranchera |
| | Criollita con Queso | $8.000 | queso de tu elección |
| Chorizo de Cerdo (2) | Chorizo Santarrosano | $11.000 | acompañado de arepa y tomate |
| Jugos en Leche (3) | Jugo de Fresa / Mora / Mango / Guanábana | $7.000 c/u | 4 productos |
| Bebidas (4) | Gaseosa | $4.000 * | |
| | Jugo Hit | $4.000 * | |
| | Café | $2.500 * | |
| | Café en Leche | $3.500 * | |

\* Valores **provisionales** aprobados por el usuario (la carta no los lista); se corrigen desde el CRUD.

**Modificadores** (de las 5 arepas):
- "Queso de tu elección" — obligatorio, `max_seleccion = 1`, opciones provisionales: Queso campesino (+$0), Queso mozzarella (+$0).
- Adicional Chorizo (+$3.500) — opcional.
- Adicional Chicharrón (+$2.000) — opcional.

En el modelo §7 (`modificadores(id, producto_id, nombre, precio_delta_cop, obligatorio, max_seleccion)`) cada opción es una fila por producto; la agrupación "elige 1 queso" se modela con un campo `grupo` nuevo (`modificadores.grupo text`) para que la UI sepa que "Queso campesino" y "Queso mozzarella" son excluyentes dentro del grupo "Queso" con `obligatorio = true`. Es la única extensión al modelo de CLAUDE.md §7 y se propondrá como edit de reconciliación.

## 2. Imágenes de productos — estilo aprobado

**Opción A: ilustración clay** (aprobada por el usuario viendo la muestra en artifact). Reglas:
- SVG 208×160 viewBox, fondo transparente, estilo plastilina coherente con §8 (formas redondeadas, sombra elíptica suave bajo el plato).
- Arepas: arepa partida vista de frente; el **relleno lleva el color de la proteína** — res café-rojizo `#8B4A2F`, pollo dorado `#E8A33D`, queso crema `#FFF3C4`, huevos pericos naranja `#F5A623` con motas rojas de tomate, Super Criollita con 3 capas (res+pollo+chicharrón `#D98559`).
- Chorizo Santarrosano: chorizo curvo sobre plato con arepa pequeña y rodaja de tomate (como la foto de la carta).
- Jugos en leche: vaso con franja de leche arriba y cuerpo del color de la fruta — fresa `#E05A6D`, mora `#7A2853`, mango `#F2A93B`, guanábana `#EFE9DC` con semillas.
- Bebidas: gaseosa (vaso burbujas cola), jugo Hit (cajita), café (taza oscura), café en leche (taza clara).
- Los 14 archivos se generan en `supabase/assets/menu/*.svg` (versionados) y el seed los sube al bucket `menu` de Storage; `productos.imagen_url` guarda la URL pública.

## 3. Storage

- Bucket `menu`: lectura pública (las imágenes de la carta no son sensibles), escritura/borrado solo rol `admin` de la sede vía política de Storage.
- El CRUD permite subir JPG/PNG/WebP (máx 2 MB, se valida en el borde) para reemplazar cualquier SVG por foto real; el nombre de objeto es `productos/<producto_id>.<ext>` (sobrescribe, sin acumular versiones).

## 4. Modelo de datos (migración nueva)

Tablas exactas de CLAUDE.md §7 + la extensión `grupo`:

```
categorias    (id uuid pk, sede_id fk, nombre, orden int, activa bool, imagen_url, creado_en)
productos     (id uuid pk, sede_id fk, categoria_id fk, nombre, descripcion, precio_cop bigint,
               imagen_url, activo bool, tiempo_prep_min int, es_combo bool, creado_en)
modificadores (id uuid pk, producto_id fk, grupo text, nombre, precio_delta_cop bigint,
               obligatorio bool, max_seleccion int, activo bool)
```

- Dinero `bigint` centavos (§13.3). Soft delete con `activo/activa` (§13.8).
- RLS: SELECT para `authenticated` de la sede (`sede_id = public.current_sede_id()`); INSERT/UPDATE solo `admin` de la sede; sin DELETE (soft delete). `modificadores` hereda la sede vía join a `productos` (política con EXISTS).
- Índices: `productos(sede_id, categoria_id, activo)`, `modificadores(producto_id, activo)`.
- Seed idempotente del menú completo con UUIDs fijos (estilo seed del bloque 2).

## 5. CRUD Admin (`/(admin)/menu`)

- **Vista principal:** categorías como pestañas/lista ordenada; dentro, grilla de productos (baldosa con imagen, nombre, precio formateado `formatearCOP`, badge inactivo si `activo=false`).
- **Producto:** crear/editar en modal ClayModal (nombre, descripción, precio en pesos — la UI convierte a centavos —, categoría, tiempo prep, activo, imagen con preview y subida a Storage). Desactivar = soft delete con confirmación.
- **Categoría:** crear/editar/ordenar (botones subir/bajar; sin drag-and-drop en esta entrega — YAGNI).
- **Modificadores:** sección dentro del editor de producto: lista por grupo, agregar/editar/desactivar filas (nombre, delta en pesos, grupo, obligatorio, max selección).
- Server Actions con validación Zod al borde (`lib/validations/menu.ts`); tipos derivados de Zod. Errores como `Result<T, DomainError>` (§12).
- Componentes nuevos: `ClayModal`, `ClayBadge` (contrato §8.3, aún no existen) + `components/menu/*`.
- Texto 100% español CO, tono cálido.

## 6. Testing (TDD)

- Zod de menú: precio > 0 y entero, nombre no vacío, max_seleccion ≥ 1, grupo requerido si obligatorio.
- Conversión pesos↔centavos del borde de UI (función pura en `lib/money.ts` si falta: `pesosACentavos`, ya existe `montoDesdePesos` — reutilizar).
- Ordenamiento de categorías (función pura subir/bajar).
- RLS verificada contra cloud: vendedora no puede INSERT en productos (REST 403/vacío), admin sí.
- E2E de flujos completos queda para bloque 11 (roadmap).

## 7. Criterios de éxito

1. `pnpm lint && pnpm test && pnpm build` verdes.
2. Migración aplicada en deliarepas; tipos regenerados; menú real visible en la base.
3. 14 SVGs subidos al bucket `menu`; cada producto con su `imagen_url` funcionando.
4. Admin puede: crear/editar/desactivar producto, cambiar precio, subir foto que reemplaza el SVG, reordenar categorías, gestionar modificadores.
5. Un rol no admin no puede escribir menú (RLS verificada).
6. `/menu` audita bien contra la checklist UX (§4.2) en desktop.

## 8. Fuera de alcance

Toma de pedidos (bloque 5), promociones/descuentos, combos (`es_combo` queda en el modelo pero sin UI), drag-and-drop de orden, imágenes de categorías (el campo existe; la UI solo productos por ahora).
