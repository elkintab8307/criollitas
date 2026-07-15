# Modo offline (Cajera y Superadmin): Diseño

## Contexto

El local (Armenia, Quindío) sufre caídas de internet por fallas del sector, no relacionadas con Supabase ni con Criollitas OS. El pedido del usuario: que el sistema pueda seguir registrando ventas durante esos cortes, y que al volver la conexión la base de datos en la nube quede al día — de forma repetible, no como un parche de una sola vez.

**Antecedente:** en una sesión anterior de este proyecto apareció en `main` un intento de "modo offline" (`lib/auth/jwtLocal.ts`, `lib/auth/sesionOffline.ts`, `components/ui/BannerConectividad.tsx`, `lib/conectividad/*`) construido fuera de este flujo de trabajo (otro equipo, sin pasar por diseño). El usuario lo descartó por completo. Confirmado con el usuario: el problema fue de **proceso** (apareció sin acordarse), no necesariamente de la idea en sí — este diseño parte de cero, sin heredar nada de ese intento.

## Decisiones de negocio (confirmadas con el usuario)

1. **Solo dos roles tienen respaldo offline: Cajera y Superadmin** (`is_super_admin = true`, CLAUDE.md §7). Vendedora y Admin normal (no-super) quedan completamente inutilizables sin internet — no se construye nada para ellos, es una limitación aceptada.
2. **Un solo dispositivo**: el equipo físico compartido del local, donde trabaja la Cajera y donde el Superadmin a veces también entra. El resto de accesos habituales del Superadmin (su celular, otro PC con internet) no necesitan capacidad offline — solo importa que funcione en ese equipo compartido.
3. **Superadmin offline = solo lectura de informes ya cacheados.** No modifica nada mientras está sin internet — ni menú, ni pedidos, ni usuarios. Nada de eso está en alcance.
4. **Cajera offline = ciclo completo de un turno**, incluyendo abrir turno (Opción A, confirmada explícitamente): si el corte de internet ocurre antes de que la Cajera alcance a abrir turno esa mañana, puede abrirlo igual sin conexión.
5. **Pagos electrónicos no requieren nada especial**: `pagos.metodo`/`referencia` es un registro manual sin integración a ninguna pasarela — todos los métodos (efectivo, Nequi, Daviplata, Bancolombia QR, datáfono) se registran offline exactamente igual que online.
6. **Impresión de tirilla no cambia**: ya funciona en red local (`print-bridge`, CLAUDE.md §10), independiente de si hay internet o no.
7. **Cocina/KDS fuera de alcance**: la sede de Armenia opera con `usa_cocina = false` (CLAUDE.md §2.5) — no hay flujo de cocina en tiempo real que sincronizar.
8. **Límite honesto explícito**: esto resuelve "se cae el internet del local", no "Supabase mismo deja de funcionar" (un problema distinto, mucho más raro, fuera de alcance).

## Arquitectura general

### Por qué no basta con "arreglar la conexión a la base de datos"

El sistema hoy es una aplicación Next.js renderizada en servidor (Vercel) que a su vez llama a Supabase. **Si se cae el internet del local, el navegador pierde contacto tanto con Vercel como con Supabase** — no es solo que la base de datos esté lejos, es que las páginas mismas (Server Components, Server Actions, `middleware.ts`) dejan de poder ejecutarse, porque corren en un servidor remoto inalcanzable.

La única forma de que algo siga funcionando es que esa porción de la app viva **enteramente dentro del navegador**, ya cargada de antemano, y hable directo con Supabase (sin pasar por Vercel) en cuanto vuelva la conexión.

### Piezas

- **Service Worker**: intercepta las peticiones del navegador y sirve una copia ya guardada de la aplicación (HTML/JS/CSS) cuando no hay red, en vez de fallar. Se registra la primera vez que el sitio se abre con internet; se actualiza en segundo plano cada vez que hay conexión (ver "Orden de actualización" más abajo). **Se implementa a mano** (sin librería de terceros tipo `next-pwa`): el proyecto usa Turbopack (`next dev/build --turbopack`) y los plugins de PWA existentes para Next.js tienen soporte incierto con Turbopack — un Service Worker mínimo hecho a mano evita ese riesgo y no agrega dependencias nuevas.

- **IndexedDB** (base de datos del propio navegador, persiste en disco, sobrevive a cerrar el navegador o reiniciar el equipo), con cuatro áreas:
  - **`cola_sync`**: cada acción hecha offline (abrir turno, crear pedido, agregar ítem, cobrar, registrar movimiento, cerrar turno) queda como una fila con su operación, sus parámetros, y el orden en que ocurrió.
  - **`catalogo_cache`**: productos, categorías, modificadores, mesas — se refresca sola cada vez que hay conexión.
  - **`identidad_local`**: para Cajera y Superadmin — `usuario_id`, `nombre`, `rol`, `sede_id`, `pin_hash`, y el `refresh_token` de la última sesión válida en ese equipo.
  - **`informes_cache`** (solo Superadmin): última versión descargada de cada reporte visitado, con la fecha/hora de esa descarga.

- **Detector de conectividad**: combina `navigator.onLine` (rápido pero solo indica si hay señal de red, no si hay internet real) con un ping periódico liviano a Supabase, para decidir de forma confiable si el sistema está "online" u "offline" en este momento.

- **Motor de sincronización**: cuando el detector confirma que volvió la conexión, reproduce `cola_sync` en orden contra Supabase, usando las mismas RPCs que ya existen hoy (`cobrar_pedido`, `cerrar_turno`, etc.) — llamadas **directamente desde el navegador** (`@supabase/supabase-js`, ya es dependencia del proyecto), sin pasar por Server Actions. La lógica de negocio (cálculo de totales, validaciones) nunca se duplica: sigue viviendo una sola vez en las RPCs de Supabase.

### Dependencia nueva a confirmar

Para IndexedDB se recomienda **Dexie.js** (~30kb, TypeScript-first, evita escribir la API nativa de IndexedDB a mano, que es notoriamente verbosa y propensa a errores). Es la única dependencia nueva que este diseño necesitaría agregar — no está en CLAUDE.md §3 hoy. Todo lo demás reutiliza dependencias ya existentes: `@supabase/supabase-js` (llamadas directas desde el navegador) y `bcryptjs` (ya es dependencia — se usa también del lado del cliente para el PIN, ver siguiente sección).

## Autenticación local

1. Cada vez que Cajera o Superadmin inician sesión con normalidad (con internet) en ese equipo, la app guarda en `identidad_local`: su `pin_hash` (el mismo que ya vive en `usuarios.pin_hash`), su `refresh_token` de Supabase, y sus datos básicos.
2. Si el detector confirma que no hay internet y alguien digita su PIN en `/pin`, en vez de llamar a la Edge Function `login-pin` (que corre en la nube, inalcanzable), se verifica el PIN **en el propio navegador** contra el hash guardado, con `bcryptjs` (ya usado en el proyecto).
3. **Límite de intentos reconstruido localmente**: 5 intentos cada 5 minutos por usuario (mismo umbral que hoy, CLAUDE.md §6.1), usando marcas de tiempo guardadas en IndexedDB. Más débil que la protección del servidor (alguien con herramientas de desarrollador podría intentar evadirlo), pero sigue siendo un freno razonable en un equipo físico que ya está bajo control del negocio.
4. **Mientras dura el corte, la app no necesita una sesión válida de Supabase en absoluto** — cada acción se etiqueta directamente con el `usuario_id`/`rol`/`sede_id` ya conocidos localmente. No hay que "fingir" autenticación ante Supabase durante este tiempo.
5. Al volver la conexión, el `refresh_token` guardado se usa para pedir una sesión nueva y válida a Supabase (esto sí requiere y tiene ya internet) — con esa sesión real se ejecuta la sincronización de la cola.
6. **Caso raro, documentado como límite aceptado**: si el `refresh_token` guardado ya venció (equipo sin uso por mucho tiempo), no se puede sincronizar hasta que alguien inicie sesión de nuevo con internet en ese dispositivo.

## Qué puede hacer la Cajera sin internet

El ciclo completo de un turno, igual que hoy:
- Abrir turno (declarar efectivo inicial).
- Tomar pedidos en los 3 canales (mesa, domicilio, llevar), usando `catalogo_cache` y el estado de mesas ya guardado.
- Cobrar, con cualquier método (todos son registro manual, sin integración externa).
- Registrar movimientos de caja (retiros, gastos).
- Imprimir tirilla (sin cambios — ya es independiente de internet).
- Cerrar turno.

Cada una de estas acciones escribe en `cola_sync` y actualiza la pantalla al instante (la Cajera ve el resultado de inmediato, sin esperar a ninguna red).

## Qué puede ver el Superadmin sin internet

Solo lectura de `informes_cache` — los reportes de CLAUDE.md §2.7 que ya haya visitado antes con internet, mostrados con la fecha/hora a la que corresponden (para dejar explícito que no son datos en tiempo real). No puede pedir un reporte o un rango de fechas que nunca haya consultado antes con conexión — no hay forma de generarlo sin datos frescos de Supabase.

## Sincronización al volver la conexión

1. Se sube todo lo pendiente de `cola_sync`, **en el mismo orden en que ocurrió**, ejecutando la RPC correspondiente a cada operación.
2. **Identificadores sin choques**: los pedidos y turnos creados offline reciben un identificador generado en el propio equipo (no depende de una secuencia de la base de datos), para no chocar con otros registros al subirlos.
3. **Fallos reales (no de red)**: si una operación falla al sincronizar por un motivo genuino (no solo por falta de conexión), no se descarta silenciosamente — queda marcada para revisión manual, y el resto de la cola sigue intentando subir con normalidad.
4. **Orden de actualización de la app**: si mientras tanto se publicó una versión nueva del sistema, esa actualización **no se aplica hasta que `cola_sync` quede vacía** — evita que una versión nueva del código "no entienda" datos pendientes guardados con el formato de una versión anterior.
5. **Precios y menú offline reflejan el último dato conocido**: si algo cambió en la nube durante el corte (un precio, por ejemplo), el equipo no tiene forma de saberlo hasta reconectar — cualquier venta offline usa los datos tal como estaban en la última sincronización antes del corte. Es el comportamiento correcto: refleja lo que realmente se cobró en ese momento.

## Indicador visual para la Cajera

Un aviso visible (banner) cuando el sistema detecta que está trabajando sin conexión, y otro cuando termina de sincronizar lo pendiente al volver — para que ella sepa en todo momento en qué modo está operando. (El diseño visual exacto del banner, tono y ubicación se define en la fase de implementación, siguiendo el sistema Claymorphism ya establecido, CLAUDE.md §8 — no requiere una decisión de negocio adicional.)

## Testing

- **Lógica de cola y sincronización** (motor de sync, generación de identificadores locales, verificación de PIN local, límite de intentos): lógica de negocio pura, sigue TDD (CLAUDE.md §4.1) — tests unitarios con `vitest`, sin necesitar un navegador real.
- **Detección de conectividad y Service Worker**: verificación manual con las herramientas de "modo offline" de las DevTools del navegador (simulan la pérdida de red de forma confiable, sin depender de cortar el internet real de la máquina de desarrollo).
- **Flujo completo** (tomar pedido → cobrar → perder conexión a mitad de camino → reconectar → confirmar que llegó a Supabase): verificación manual end-to-end con `pnpm dev`, alternando el modo offline de las DevTools.

## Fuera de alcance

- Vendedora y Admin no-super: sin ningún respaldo offline, tal como se decidió explícitamente.
- Cualquier dispositivo distinto al equipo compartido del local (el celular u otro PC del Superadmin no necesitan esta capacidad).
- Cocina/KDS: sin cambios, sigue fuera de uso en Armenia (`usa_cocina = false`).
- Casos donde Supabase mismo (no el internet del local) esté caído.
- Diseño visual detallado del banner de estado (color exacto, copy, posición) — se resuelve en implementación siguiendo el sistema de diseño ya existente, no es una decisión de negocio pendiente.
