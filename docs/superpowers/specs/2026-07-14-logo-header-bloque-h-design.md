# Bloque H — Logo global con header sticky: Diseño

## Contexto

El usuario pidió tres cosas de escala muy distinta en un mismo mensaje: (1) mejorar el diseño general del sitio para que se vea "más profesional"; (2) hacerlo más responsive, pensando en dispositivos móviles; (3) usar `archivos/logo.png` como logo, visible arriba a la izquierda en desktop y centrado en móvil, siempre presente (sticky) aunque se haga scroll. Se descompuso en iniciativas separadas — este documento cubre solo la (3), la pieza concreta. Las otras dos quedan para sus propios ciclos de diseño (una de ellas, "tablas de reportes responsive en Admin", ya se identificó como el siguiente bloque).

## Decisiones de negocio (confirmadas con el usuario, incluyendo mockups visuales)

1. **Cajera y Vendedora**: el logo se integra en la misma barra sticky que ya tiene su navegación de rol — una sola fila (logo + links), que se envuelve en varias líneas en móvil.
2. **Admin**: el sidebar de navegación (`AdminNav`) se mantiene exactamente como está, sin tocarlo. Se agrega una barra superior nueva, delgada y sticky, solo con el logo, encima de todo (sidebar + contenido).
3. **Login / PIN**: hoy sin header — se agrega la misma barra delgada de solo-logo que Admin.
4. **KDS (Cocina)**: exento, sin header — pantalla operativa dedicada donde cada píxel vertical protege las tarjetas de pedido y el semáforo de tiempo (CLAUDE.md §2.5/§8.4); el logo no aporta ahí.

## Arquitectura

### Activo del logo

`archivos/logo.png` (1536×1024, PNG con transparencia real, sin fondo opaco) se copia a `public/logo.png` — la copia canónica que sirve el sitio. La carpeta `archivos/` (assets de origen del usuario) se agrega a `.gitignore`, no se versiona.

### Componente compartido

Nuevo `components/ui/LogoCriollitas.tsx`: envuelve el logo con `next/image` (optimización automática — evita servir el PNG de 2.6MB completo; Next genera los tamaños responsivos). Alt text: "Criollitas — Arepas Rellenas". Sin fondo propio, aprovecha la transparencia del PNG. Acepta una prop de tamaño (`sm`/`md` o alto en px) para los dos contextos donde aparece: integrado en una barra con navegación (Cajera/Vendedora) vs. solo en una barra delgada (Admin/Auth).

### Integración por grupo de rutas

- **`app/(cajera)/layout.tsx`** y **`app/(vendedora)/layout.tsx`**: el `<header>` existente gana `position: sticky; top: 0` (si no lo tiene ya) y el `<LogoCriollitas />` se agrega como primer elemento de la fila, antes de los links de navegación — misma fila, se envuelve en móvil (mockup opción A, aprobada).
- **`app/(admin)/layout.tsx`**: nueva barra `<header>` sticky, solo con el logo, agregada ENCIMA de la estructura actual (`<AdminNav />` + contenido) sin modificar `AdminNav` en absoluto (mockup opción D, aprobada).
- **`app/(auth)/layout.tsx`** (nuevo archivo — hoy el grupo no tiene layout): mismo patrón de barra delgada de solo-logo que Admin, envolviendo `login/page.tsx` y `pin/page.tsx`.
- **`app/(cocina)/`**: sin cambios, ningún archivo nuevo ni modificado.

### Comportamiento sticky

`position: sticky; top: 0; z-index` por encima del contenido de la página, con fondo sólido (`--brand-chocolate`, ya usado en los headers existentes) para que no se vea transparente al hacer scroll por debajo.

## Testing

Sin lógica de negocio nueva — es estructural/visual. Verificación manual con `pnpm dev`: el logo aparece y permanece visible al hacer scroll en cada grupo de rutas (Admin, Cajera, Vendedora, Login, PIN), se ve alineado a la izquierda en desktop y centrado en móvil (viewport angosto), y KDS queda sin cambios visibles.

## Fuera de alcance

- Rediseño visual general ("más profesional") — iniciativa separada, sin definir todavía.
- Responsive del resto de cada pantalla (ej. tablas de reportes en Admin) — iniciativa separada, ya identificada como el siguiente bloque a abordar.
- Cualquier cambio a middleware, RLS o lógica de negocio.
