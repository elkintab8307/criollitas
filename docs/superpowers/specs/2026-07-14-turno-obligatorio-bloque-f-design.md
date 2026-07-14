# Bloque F — Dinero base obligatorio al iniciar sesión: Diseño

## Contexto

Último de tres cambios relacionados (orden confirmado): Bloque D (ocultar cocina, ya en `main`) → Bloque E (cajera toma pedidos, ya en `main`) → Bloque F (este). El usuario dijo textualmente: "Cuando una cajera inicia sesion en el dia, lo primero que debe hacer es indicar el valor del dinero base con el que comienza el dia."

El flujo de apertura de turno (`/turno/abrir`) ya existe desde el Bloque 7, pero es voluntario — nada impide a la cajera ir directo a cualquier otra ruta suya sin haberlo abierto nunca.

## Decisiones de negocio (confirmadas con el usuario)

1. **Alcance del bloqueo**: aplica a TODAS las rutas de cajera, incluidas `/inicio`, `/pedido`, `/mis-pedidos` (del Bloque E, para tomar pedidos) — no solo a las rutas específicas de caja. Ni siquiera puede tomar un pedido antes de declarar el dinero base.

## Arquitectura

### Mecanismo: cookie `turno_abierto`, mismo patrón que `pin_validado`

- Nueva cookie `turno_abierto` (`httpOnly`, `sameSite: "lax"`, `path: "/"`, `maxAge: 60*60*12`) — mismos parámetros que la cookie `pin_validado` ya existente (`app/(auth)/pin/actions.ts`).
- `abrirTurno()` (`app/(cajera)/turno/actions.ts`) la fija a `"1"` justo antes de retornar éxito.
- `cerrarTurno()` (mismo archivo) la limpia justo antes de retornar éxito.
- En `middleware.ts`, justo después del chequeo de `pinValidado` y antes de `resolverAccesoRuta`: si `rol === 'cajera'`, la cookie `turno_abierto` no está presente, y la ruta no es `/turno/abrir` ni `/mi-turno` (ni pública), redirige a `/turno/abrir`.
- Sin consultas nuevas a base de datos en el middleware (corre en cada request) — mismo motivo por el que `pin_validado` ya usa este patrón de cookie en vez de una consulta.

### Auto-corrección ante desajuste cookie/base de datos

- **Cookie ausente pero sí hay turno abierto en BD** (ej. caché de navegador borrada): `/turno/abrir/page.tsx` ya consulta `turnos_caja` y se auto-redirige a `/mi-turno` si encuentra un turno abierto — este bloque no cambia esa lógica, así que el caso se resuelve solo.
- **Cookie presente pero el turno ya se cerró por otra vía** (ej. otro dispositivo): no abre ningún hueco de seguridad — las Server Actions de caja (`registrarMovimiento`, `cerrarTurno`, `cobrarPedido`) ya validan un turno abierto real en cada llamada, independientemente de la cookie.

### Excepciones

`/turno/abrir` (la propia ruta de escape) y `/mi-turno` (para ver el turno recién abierto sin quedar en loop) nunca redirigen. `FormularioAbrirTurno.tsx` no cambia — sigue redirigiendo a `/mi-turno` tras éxito; con la cookie ya fijada, esa navegación pasa el gate sin problema.

## Testing

Sin funciones puras nuevas — es un chequeo de cookie más en el middleware y dos escrituras de cookie en Server Actions ya existentes. Verificación en vivo con una cajera de prueba temporal:
- Sin turno abierto: `/pedidos`, `/inicio`, `/pedido/nuevo`, `/mis-pedidos`, `/cobrar/algo` → todas redirigen a `/turno/abrir`.
- Abre turno → cookie fijada → navega libremente a esas mismas rutas.
- Cierra turno → cookie limpiada → vuelve a quedar bloqueada hasta abrir un turno nuevo.
- `/turno/abrir` y `/mi-turno` siempre accesibles.

## Fuera de alcance

- Cualquier cambio a las Server Actions de caja ya existentes (`registrarMovimiento`, `cerrarTurno`, `cobrarPedido`) más allá de fijar/limpiar la cookie — su validación de turno abierto real ya existe y no cambia.
- Aplicar un bloqueo equivalente a la Vendedora (no tiene concepto de turno).
