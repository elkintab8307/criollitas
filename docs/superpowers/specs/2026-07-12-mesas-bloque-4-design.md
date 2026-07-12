# Diseño: Bloque 4 — Mesas (CRUD, vista de estado, Realtime)

**Fecha:** 2026-07-12
**Estado:** diseño aprobado verbalmente (sin reservas, con nav de admin); pendiente revisión de este documento.
**Alcance:** Roadmap §16 bloque 4. Rama `feature/mesas-bloque-4` (apilada sobre `feature/menu-bloque-3`; retarget a `main` cuando entren los PRs previos).

---

## 1. Objetivo

Gestión de las mesas del salón: el administrador las crea/edita/desactiva, y una parrilla muestra el estado de cada mesa (`libre` / `ocupada` / `reservada`) con color, actualizándose en vivo vía Supabase Realtime. Base para la toma de pedido del bloque 5.

## 2. Decisiones tomadas (aprobadas)

| Decisión | Elección | Razón |
|---|---|---|
| Reservas | **Fuera de alcance.** La parrilla solo muestra estado; sin botón reservar/liberar | El restaurante no usa reservas. `estado` lo manejará el pedido (bloque 5). YAGNI |
| Navegación del admin | **Se agrega** una barra lateral en el layout de admin (Panel / Menú / Mesas) | Hoy `/menu` y `/mesas` solo se alcanzan escribiendo la URL; con dos secciones ya hace falta |
| Dueño de la ruta `/mesas` | **Admin** en este bloque | Resuelve la colisión de rutas (ver §3). La vista operativa de la vendedora (seleccionar mesa) llega en el bloque 5 |

## 3. Resolución del choque de rutas

CLAUDE.md §5 lista `(admin)/mesas/` y `(vendedora)/mesas/`. En Next.js App Router los grupos de ruta **no** cambian la URL, así que dos `page.tsx` no pueden resolver ambos a `/mesas` (colisión de archivos). Resolución:

- En el bloque 4, `/mesas` es **admin**: CRUD + vista de estado + Realtime, en `app/(admin)/mesas/`.
- El middleware cambia la regla `/mesas` de `vendedora` a `admin` (la vendedora aún no tiene página de mesas — no rompe nada).
- La **parrilla es un componente reutilizable** (`components/mesas/GrillaMesas`). En el bloque 5, cuando la vendedora seleccione mesa para un pedido, se reutiliza en la ruta de su flujo (probablemente `/inicio` o una ruta propia), y ahí se decide la compartición final.
- Se reconcilian CLAUDE.md §5 (nota de la ruta) y §9 (regla de middleware).

## 4. Modelo de datos (migración nueva)

Tabla exacta de CLAUDE.md §7:

```
estado_mesa enum: libre | ocupada | reservada
mesas (id uuid pk, sede_id fk, numero int, nombre text, capacidad int,
       activa bool, estado estado_mesa default 'libre', creado_en timestamptz)
```

- `numero` único por sede: `unique (sede_id, numero)`.
- `capacidad` entero > 0; `numero` entero > 0 (checks).
- RLS: SELECT para `authenticated` de la sede (`sede_id = public.current_sede_id()`); INSERT/UPDATE solo `admin` de la sede (usando `public.current_rol()` que lee `app_metadata`). Sin DELETE (soft delete con `activa=false`).
- Índice: `mesas(sede_id, activa)`.
- **Realtime:** `alter publication supabase_realtime add table public.mesas;` para que los cambios de fila se emitan. RLS también aplica a Realtime (cada cliente solo recibe filas de su sede).
- Seed idempotente: 5 mesas (`Mesa 1`..`Mesa 5`, capacidad 4, `libre`) con UUIDs fijos `00000000-0000-4000-8000-0000000004NN`.

## 5. Componentes y UI

- **`MesaTile`** (`components/ui/`, §8.3): tarjeta cuadrada con número grande, nombre, capacidad, y **color de fondo por estado** — `libre`=verde suave, `ocupada`=mostaza suave, `reservada`=tomate suave (§8.3). `ClayBadge` "Inactiva" cuando `activa=false`. Target táctil ≥48px. Estilo clay. Recibe props serializables; sin lógica de datos.
- **`estadoMesa` helper** (`lib/mesas/estado.ts`, TDD): función pura `metaEstadoMesa(estado) → { etiqueta: string; claseFondo: string }` con las etiquetas en español (`Libre`/`Ocupada`/`Reservada`) y las clases de color. Centraliza el mapeo para tile y futuros consumidores.
- **`GrillaMesas`** (`components/mesas/`, client): renderiza la parrilla de `MesaTile`, se **suscribe al canal Realtime** `mesas:sede_<id>` (postgres_changes sobre `public.mesas`) en un `useEffect` con cleanup, y actualiza el estado local cuando llega un cambio. Recibe `puedeEditar` (true solo admin) para mostrar los controles de CRUD.
- **`EditorMesa`** (`components/mesas/`, client): `ClayModal` con `react-hook-form` + `zodResolver(mesaSchema)`: número, nombre, capacidad, activa. Guardar (primary) / Desactivar (destructive, con confirmación: "La mesa deja de aparecer, pero conserva su historial") / Cancelar. Errores del `Result` en `<p role="alert">`.
- **`AdminNav`** (`components/admin/`, en `app/(admin)/layout.tsx`): barra lateral con enlaces a **Panel** (`/dashboard`), **Menú** (`/menu`) y **Mesas** (`/mesas`), resaltando la sección activa (`usePathname`). Densidad admin (§8.4). Deja espacio visual para secciones futuras (Reportes, Usuarios, etc.).

## 6. Server Actions (`app/(admin)/mesas/actions.ts`)

Mismo patrón del bloque 3 (`exigirAdmin` → Zod → DB → `revalidatePath("/mesas")` → `Result`):

- `crearMesa(input: MesaInput): Result<{ id }>` — sede del admin; error claro si el `numero` ya existe (violación de unique → "Ya existe una mesa con ese número").
- `editarMesa(id, input): Result<{ id }>`.
- `cambiarActivaMesa(id, activa): Result<{ id }>` — soft delete, con `.select().single()` para confirmar fila.

`mesaSchema` (`lib/validations/mesas.ts`, TDD): `numero` entero > 0, `nombre` opcional (default `Mesa <numero>` si vacío), `capacidad` entero 1–20, `activa` boolean. Tipo `MesaInput` derivado.

## 7. Testing (TDD)

- `lib/mesas/estado.ts`: cada estado → etiqueta y clase correctas; estado desconocido → fallback seguro.
- `mesaSchema`: número/capacidad inválidos rechazados con mensajes en español; nombre por defecto.
- RLS verificada contra cloud: anon lee `[]`; vendedora (sesión real) no puede INSERT/UPDATE mesas; admin sí. (Las actions ya están gated; RLS es la última línea.)
- Realtime: verificación manual — abrir `/mesas`, cambiar `estado` de una mesa por SQL, confirmar que la parrilla se actualiza sin recargar.
- E2E completo se difiere al bloque 11.

## 8. Criterios de éxito

1. `pnpm lint && pnpm test && pnpm build` verdes.
2. Migración aplicada en deliarepas; tipos regenerados; 5 mesas visibles.
3. Admin en `/mesas`: crea, edita, desactiva mesa; número duplicado da error claro.
4. La parrilla refleja un cambio de `estado` hecho por SQL sin recargar (Realtime).
5. La barra de navegación del admin lleva a Panel/Menú/Mesas y resalta la actual.
6. Un rol no admin no puede escribir mesas (RLS verificada).

## 9. Fuera de alcance

Selección de mesa por la vendedora y su URL final (bloque 5, toma de pedido); reservas; transición automática a `ocupada` (bloque 5, al crear pedido); plano/mapa del salón (drag de posiciones); nav de la vendedora/cajera/cocina (este bloque solo agrega la del admin).
