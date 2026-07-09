# Diseño: Bootstrap Criollitas OS — Bloques 1 y 2 (Infraestructura + Auth)

**Fecha:** 2026-07-09
**Estado:** aprobado por Jonathan (diseño verbal); pendiente revisión de este documento.
**Alcance:** Roadmap §16 de CLAUDE.md, bloques 1 (Infraestructura) y 2 (Auth).

---

## 1. Contexto y punto de partida

- El directorio `C:\PROYECTOS\CRIOLLITAS` contiene únicamente `CLAUDE.md` (spec maestra del producto). No hay repositorio git aún.
- Entorno verificado: Node 22.17, pnpm 10.32, git 2.48, Supabase CLI 2.78. **No hay Docker**, por lo que no es viable `supabase start` local.
- Proyecto Supabase cloud: **deliarepas** (`btiejgeljpwsqwckuocs`, región `ca-central-1`, activo).
  - URL: `https://btiejgeljpwsqwckuocs.supabase.co` (el campo "URL" que entregó el usuario venía errado; se derivó y verificó desde el `ref` de los JWT).
  - Claves verificadas contra la API: anon (legacy JWT), service_role (legacy JWT), publishable (`sb_publishable_…`) y secret (`sb_secret_…`). Todas vigentes.
  - Nota: el endpoint raíz `/rest/v1/` (OpenAPI) solo responde a service_role; no es un error de las demás claves.

## 2. Decisiones tomadas (aprobadas por el usuario)

| Decisión | Elección | Razón |
|---|---|---|
| Base de datos de desarrollo | **Cloud directo** contra deliarepas, repo vinculado con `supabase link`; migraciones con `supabase db push` | No hay Docker; no existen datos de producción todavía; arranque inmediato |
| Alcance de la sesión | **Bloques 1 y 2** del roadmap | Decisión del usuario |
| Dinero | **Helpers propios** en `lib/money.ts` con `bigint` de centavos COP | Sin dependencia externa (dinero.js v2 sigue en beta); CLAUDE.md §3 lo permite; se cubre con TDD |
| Sesión tras PIN | **`admin.generateLink(magiclink)` + `verifyOtp` server-side** en la Edge Function | Devuelve `access_token` + `refresh_token` oficiales de Supabase; la sesión se refresca sola; no depende del JWT secret ni se rompe con rotación de claves |
| Tailwind | **v4** (tokens como CSS variables en `globals.css` + `@theme inline`) | Estándar actual; los tokens viven exactamente donde §8 los pide. Requiere edit de reconciliación en CLAUDE.md §8.1 (referencia a `tailwind.config.ts`) |

### Edits de reconciliación pendientes para CLAUDE.md

1. §8.1: los tokens se exponen a Tailwind v4 vía `@theme inline` en `globals.css`, no vía `tailwind.config.ts`.
2. §14/§15: flujo de desarrollo contra cloud vinculado (`supabase link` + `supabase db push`) mientras no haya Docker; corregir `SUPABASE_JWT_SECRET` (no se usa con la estrategia magic link).

## 3. Bloque 1 — Infraestructura

### 3.1 Scaffold

- Next.js 15 (App Router) + TypeScript con `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`. Package manager pnpm.
- Como el directorio no está vacío (CLAUDE.md, docs/), el scaffold se genera con `create-next-app` en un directorio temporal y se mueve su contenido a la raíz, preservando CLAUDE.md y docs/.
- ESLint + Prettier con reglas del proyecto. Alias de imports `@/`.
- Git: `git init` en la raíz, rama `main`, Conventional Commits en español. `.gitignore` incluye `.env.local`, `node_modules`, `.next`.
- `.env.local` (no commiteado) con las credenciales reales; `.env.example` commiteado con placeholders. Variables según CLAUDE.md §14 (sin `SUPABASE_JWT_SECRET`; ver decisión de sesión PIN).

### 3.2 Sistema de diseño

- `app/globals.css`: tokens literales de CLAUDE.md §8.1 y §8.2 (colores de marca, semánticos, sombras clay, radios, fuentes), expuestos a utilidades Tailwind v4 vía `@theme inline`.
- Fuentes con `next/font/google`: Fredoka (display), Inter (body), JetBrains Mono (cifras/tickets). Nunca por CDN.
- Componentes base en `components/ui/` usando `cva`:
  - `ClayButton`: variantes `primary | secondary | ghost | destructive | success`; tamaños `sm | md | lg | xl`; estados hover (eleva sombra), pressed (`--clay-shadow-pressed`), disabled (desaturado), focus visible (outline mostaza 3px).
  - `ClayCard`: variantes `default | elevated | flat | sunken`; padding por defecto `p-6`.
  - `ClayInput`: sombra interna hundida, radio `md`, label accesible.
- Página temporal `/design` (solo desarrollo) para verificación visual de tokens y componentes; se elimina o protege antes del MVP final.

### 3.3 Librerías núcleo (`lib/`)

- `lib/money.ts`: tipo `MontoCOP` sobre `bigint` de centavos; operaciones suma/resta/multiplicación por cantidad, reparto, comparación; formato `es-CO` → `$ 12.500` (miles con punto, sin decimales). Nunca `number`.
- `lib/dates.ts`: wrapper de `date-fns` con locale `es-CO` y zona `America/Bogota` fijas.
- `lib/supabase/client.ts` (browser), `server.ts` (RSC/Server Actions), `middleware.ts` (refresh de sesión), `types.ts` (generado con `supabase gen types` tras cada migración).
- `lib/validations/`: esquemas Zod compartidos; los tipos TS se derivan de Zod.
- `lib/auth/roles.ts` y `lib/auth/pin.ts`.

## 4. Bloque 2 — Autenticación (email + PIN)

### 4.1 Modelo de datos (migración `0001`)

```
sedes     (id uuid pk, nombre, direccion, telefono, activa bool, creado_en timestamptz)
usuarios  (id uuid pk fk auth.users, sede_id fk, nombre, rol rol_usuario,
           pin_hash text, activo bool, avatar_url, creado_en)
           -- rol_usuario enum: admin | cajera | vendedora | cocina
pin_intentos (id, usuario_id fk, exito bool, creado_en timestamptz)
```

- Funciones `auth.current_sede_id()` y `auth.current_rol()` leyendo `raw_user_meta_data` del JWT (CLAUDE.md §6.2). El rol y la sede se copian a `raw_user_meta_data` al crear/actualizar el usuario (trigger o Server Action de Admin).
- RLS habilitada en las tres tablas:
  - `usuarios`: cada usuario lee su propia fila; admin de la sede lee/escribe usuarios de su sede; **la lista de usuarios para la pantalla PIN se sirve desde la Edge Function con service role (solo id, nombre, avatar — nunca `pin_hash`)**, no por SELECT anónimo.
  - `sedes`: SELECT para usuarios autenticados de la sede; escritura solo admin.
  - `pin_intentos`: sin acceso desde el cliente; solo la Edge Function (service role) escribe/lee.
- Seed: 1 sede "Criollitas Armenia" + 1 usuario Administrador (email `jonathantabares@gmail.com`, password inicial que el usuario cambiará, PIN de prueba).

### 4.2 Edge Function `login-pin` (Deno, `supabase/functions/login-pin/`)

Flujo por request `POST { usuario_id, pin }`:

1. **Rate limit:** contar fallos en `pin_intentos` de los últimos 5 minutos; si ≥ 5 → 429 con tiempo restante de bloqueo. (La "notificación al Admin" de CLAUDE.md §6.1 se difiere: los intentos quedan consultables y se expondrán en el dashboard de auditoría, bloque 10.)
2. Buscar `usuarios.pin_hash` (cliente service role) y verificar con **bcrypt**.
3. Registrar el intento (éxito o fallo) en `pin_intentos`.
4. Si es válido: `admin.generateLink({ type: 'magiclink', email })` → extraer `token_hash` → `verifyOtp({ type: 'email', token_hash })` **dentro de la función** → devolver `{ access_token, refresh_token }` al cliente. La Service Role Key nunca sale del servidor.
5. El cliente hace `supabase.auth.setSession(...)`; desde ahí `auth.uid()` es el usuario real y RLS opera normal.

Endpoint expuesto también como `POST /api/auth/pin` (route handler que reenvía a la Edge Function) para mantener la estructura de CLAUDE.md §5.

### 4.3 UI y middleware

- `/login` (grupo `(auth)`): email + password con Supabase Auth; formulario `react-hook-form` + Zod; estilo Claymorphism sobre fondo chocolate.
- `/pin`: grilla de usuarios activos de la sede (avatar + nombre, targets ≥48px) + teclado numérico PIN 4-6 dígitos; errores en español claro; tras validar, cookie httpOnly `pin_validado`.
- `middleware.ts` raíz: refresca sesión → lee rol del JWT → aplica las redirecciones de CLAUDE.md §9 (sin sesión → `/login`; sin PIN → `/pin`; rol en ruta ajena → su ruta base). Los layouts `(admin)/(cajera)/(vendedora)/(cocina)` se crean como esqueleto con placeholder para que las redirecciones sean verificables.

### 4.4 Seguridad

- Service Role Key y Access Token solo en `.env.local` / secrets de Edge Functions. Nunca en el cliente ni en git.
- **Las credenciales fueron compartidas por chat; se recomienda rotarlas al terminar el bootstrap** (especialmente el Access Token `sbp_…`). El sistema quedará configurado para que rotar sea solo actualizar `.env.local`.
- Autorización siempre en RLS o Server Action con `getUser()`; jamás confiar en el rol del cliente.

## 5. Testing (TDD, vitest)

Orden test-primero obligatorio para lógica de negocio:

- `lib/money.ts`: formato COP, aritmética bigint, casos borde (0, negativos, montos grandes).
- `lib/dates.ts`: TZ Bogotá estable independiente de la TZ de la máquina.
- Esquemas Zod de login y PIN (longitud 4-6, solo dígitos).
- Lógica de rate limit (función pura contada sobre timestamps, testeable sin red).
- E2E (playwright) del flujo login→pin→redirección por rol: se difiere al bloque 11 según roadmap, pero el esqueleto de `tests/` queda creado.

## 6. Criterios de éxito

1. `pnpm lint && pnpm test && pnpm build` en verde.
2. `/design` muestra ClayButton/ClayCard/ClayInput con la identidad §8 (contraste AA).
3. Migración aplicada en deliarepas; `lib/supabase/types.ts` generado.
4. Login email/password funcional con el admin del seed.
5. Pantalla PIN funcional: PIN correcto → sesión del usuario y redirección por rol; 5 fallos en 5 min → bloqueo temporal.
6. RLS verificada: un rol no admin no puede leer/escribir `usuarios` de otros.

## 7. Fuera de alcance (bloques posteriores)

Menú, mesas, pedidos, KDS, cobro, turnos, reportes, auditoría completa, print-bridge. Los layouts por rol quedan solo como esqueleto de navegación.
