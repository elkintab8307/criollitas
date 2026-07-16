# CLAUDE.md — Criollitas OS

Este archivo es la fuente única de verdad para Claude Code en este repositorio. Léelo completo antes de iniciar cualquier tarea y consúltalo antes de proponer cambios estructurales. Si algo del código diverge de lo aquí descrito, gana este documento y se debe abrir una tarea de reconciliación.

---

## 0. Modo de trabajo autónomo

Este proyecto tiene UN dueño (el usuario) que no es desarrollador full-time y NO
quiere ser consultado en cada decisión menor. Claude Code opera con autonomía
razonable siguiendo estas reglas:

### 0.1 Decide sin preguntar (default: actúa)

Toma la decisión y sigue. Documenta brevemente en el PR/commit qué elegiste y
por qué. Aplica a:

- Nombres de variables, funciones, archivos, tablas, columnas, rutas.
- Estructura interna de componentes, hooks, helpers.
- Elección entre patrones equivalentes (map/reduce/for, switch/objeto lookup,
  early return/if-else anidado).
- Librerías utilitarias pequeñas y estables (clsx, cva, date-fns, zod)
  siempre que ya estén en package.json o encajen con §3 del CLAUDE.md.
- Refactors internos que no cambian API pública.
- Manejo de errores, mensajes al usuario, textos de UI (siguiendo tono
  cálido, español CO, sin jerga técnica).
- Micro-decisiones de UI: espaciados exactos, radios dentro del rango de
  tokens, cuál variante de sombra clay usar, orden de campos en un form.
- Estructura de tests, casos edge que se te ocurran, mocks.
- Optimizaciones evidentes (memoización obvia, índices SQL obvios).
- Correcciones de bugs encontrados de paso, si son <20 líneas y sin riesgo.
- Escritura de queries SQL, políticas RLS, migraciones (siguiendo §7 y §13).

### 0.2 Pregunta SOLO si se cumple al menos una de estas condiciones

1. **Ambigüedad de negocio irresoluble por contexto:** el CLAUDE.md no lo
   cubre y hay dos interpretaciones con consecuencias operativas distintas
   para el restaurante (ej. "¿la propina se calcula antes o después del
   descuento?", "¿el pago mixto puede dejar diferencia a favor del cliente?").
2. **Costo o dependencia externa nueva:** vas a agregar una dependencia no
   listada en §3, un servicio de pago, un proveedor de SMS/email pagado, o
   algo que implique costos recurrentes.
3. **Cruzar una línea roja de §13:** si tu solución exige cruzarla, PARA y
   pregunta. No la cruces "temporalmente".
4. **Cambio destructivo de datos:** migraciones que borran columnas/tablas
   con datos, DROP, TRUNCATE, cambios de tipo con posible pérdida.
5. **Cambio de alcance:** la tarea que te pidieron implica en realidad
   rediseñar algo más grande. Confirma el alcance antes de expandirlo.
6. **Trade-off estratégico real:** hay dos caminos con implicaciones a largo
   plazo genuinamente distintas (no meras preferencias de estilo).

### 0.3 Cómo preguntar cuando toca

- UNA sola pregunta por vez, no listas de 8 puntos.
- Presenta tu recomendación con justificación y pide confirmación:
  "Voy a hacer X porque Y. ¿OK o prefieres Z?"
- Nunca preguntes "¿cómo quieres que…?" en abstracto. Siempre con opción
  por defecto ya elegida.

### 0.4 Cómo NO preguntar (patrones prohibidos)

- "¿Quieres que use TypeScript o JavaScript?" → ya está en §3, es TypeScript.
- "¿Prefieres tabs o espacios?" → lo dice prettier, no me preguntes.
- "¿Cómo llamo esta función?" → decide tú.
- "¿En qué carpeta la pongo?" → sigue §5, decide tú.
- "¿Agrego un test?" → sí, siempre para lógica de negocio (§4.1).
- "¿Uso Server Component o Client?" → aplica §12, decide tú.
- Preguntas encadenadas antes de escribir una sola línea de código.

### 0.5 Cuando termines una tarea

Reporta al final, no en el medio:
- Qué hiciste (bullets breves).
- Decisiones que tomaste solo y merecen visibilidad (máx. 3, las más
  relevantes).
- Qué queda pendiente o dudoso, si algo.
- Cómo probarlo en 1 comando.

No pidas permiso para hacer commit, para correr tests, para instalar una
dependencia ya prevista, ni para leer archivos del repo. Solo hazlo.

---

## 1. Contexto de negocio

**Cliente:** Criollitas — Arepas Rellenas, Sabores de Tradición.
**Sede inicial:** Armenia, Quindío, Colombia.
**Canales de operación:** consumo en mesa (5 mesas), domicilios, para llevar.
**Redes:** @criollitas_armenia · WhatsApp/tel. 321 212 7100.

El sistema es un **POS interno de comandas y caja** —no facturación electrónica DIAN—, con impresión de tirilla en impresora térmica al momento del cobro. El objetivo es que Vendedora, Cajera y Administrador trabajen sobre la misma base de datos en tiempo real, y que la cocina reciba los pedidos en una pantalla (KDS) sin papel intermedio.

El modelo de datos se diseña **multi-sede desde el día 1**, aunque la operación arranque con una sola sede. Todas las tablas relevantes llevan `sede_id` y las políticas RLS lo respetan.

---

## 2. Alcance funcional

### 2.1 Roles y responsabilidades

| Rol | Puede hacer | No puede |
|---|---|---|
| **Administrador** | CRUD total: usuarios, sedes, mesas, categorías, productos, modificadores, precios, promociones. Ver todos los reportes, cierres de caja históricos, auditoría. Configurar impresora, métodos de pago, parámetros de sede. | — |
| **Cajera** | Ver todos los pedidos activos y su estado. Cobrar (registrar método de pago, imprimir tirilla, cerrar pedido). Abrir y cerrar turno de caja con conteo de efectivo. Ver reporte de su turno. Tomar pedidos igual que la Vendedora, en los 3 canales — mesa, domicilio, para llevar (bloque E, apoyo cuando la Vendedora está ocupada). | Editar menú, ver reportes históricos de otros turnos. |
| **Vendedora** | Seleccionar mesa u origen (mesa / domicilio / para llevar), armar pedido desde el menú, aplicar modificadores/notas, enviar a cocina, editar pedido mientras esté en estado `abierto`. | Cobrar, ver reportes, editar menú, editar precios. |
| **Cocina** *(vista pública sin login o con PIN mínimo)* | Ver KDS en tiempo real, marcar ítems como `en_preparacion` → `listo`. | Todo lo demás. |

### 2.2 Estados de un pedido

```
abierto → enviado_cocina → en_preparacion → listo → entregado → cobrado → cerrado
                                                                       ↘ anulado
```

`entregado` no es un paso obligatorio antes de `cobrado`: la Cajera cobra directo desde `listo` o desde `entregado` indistintamente (ambos significan "la comida ya salió de cocina, se puede cobrar") — no existe un flujo de "marcar entregado" separado; `cobrarPedido` transiciona a `cobrado` desde cualquiera de los dos.

Un pedido anulado exige motivo y queda en auditoría. Solo Administrador anula pedidos ya cobrados (reversión con nota).

### 2.3 Métodos de pago soportados

Efectivo, Nequi, Daviplata, Bancolombia QR, datáfono/tarjeta, **pago mixto** (combinación de dos o más). El pago mixto se modela como una lista de `pagos` asociados a un mismo pedido; la suma debe cuadrar con el total.

### 2.4 Arqueo y cierre de caja

La Cajera abre turno declarando el efectivo inicial. Durante el turno, cada pago en efectivo suma al esperado. Puede registrar `movimientos_caja` (retiros, gastos menores) con concepto. Al cerrar, declara el efectivo contado; el sistema calcula la diferencia y la deja registrada. El turno cerrado no se puede editar. El efectivo esperado (misma fórmula que `cerrar_turno`, `lib/caja/arqueo.ts`) se muestra también en la cola de cobro (`/pedidos`), visible justo después de cada cobro.

**Obligatorio al iniciar sesión** (bloque F): la Cajera no puede usar ninguna otra ruta suya — ni siquiera tomar pedidos (bloque E) — hasta declarar el efectivo inicial en `/turno/abrir`. Se implementa con una cookie `turno_abierto` (mismo patrón que `pin_validado`, §6.1), fijada por `abrirTurno()` y limpiada por `cerrarTurno()`, chequeada en el middleware. Únicas rutas exentas: `/turno/abrir` y `/mi-turno`.

### 2.5 KDS (Kitchen Display System)

Vista sin scroll, pensada para pantalla vertical u horizontal en cocina. Cada tarjeta = un pedido. Muestra: número corto de pedido, origen (mesa X / domicilio / llevar), ítems con modificadores y notas, tiempo transcurrido con semáforo (verde <5min, amarillo 5-10, rojo >10, medido desde `enviado_cocina_en`). Toques por ítem: `pendiente` → `en preparación` → `listo`; un toque sobre `listo` lo destoca a `en preparación` (corrección de error). El estado agregado del pedido se recalcula solo cuando todos sus ítems coinciden — un pedido `entregado` al que se le agrega un ítem tardío se reabre a `enviado_cocina` para que vuelva a ser visible en el KDS. Se actualiza vía Supabase Realtime.

**Cocina desactivable por sede** (`sedes.usa_cocina`, bloque D): la sede de Armenia opera hoy con `usa_cocina = false` — el establecimiento no usa este flujo. Con la bandera en `false`, `confirmarItemsPedido` inserta los `pedido_items` ya en `estado_item = 'listo'`, así que el agregado del pedido (calculado por `recalcular_totales_pedido`, sin cambios) llega directo a `listo` sin pasar visiblemente por `enviado_cocina`/`en_preparacion` — el pedido aparece de inmediato en la cola de cobro de la Cajera. Todo el modelo de cocina (rol, RLS, `/kds`, RPCs) queda intacto para reactivarse en el futuro solo cambiando esa columna a `true`, sin tocar código.

### 2.6 Impresión de tirilla POS

Al cobrar, se genera y envía a la impresora térmica un ticket ESC/POS que incluye: encabezado con marca y sede, número de pedido, fecha/hora, mesa/origen, ítems con cantidades y precios, subtotales, propina si aplica, total, método(s) de pago, mensaje de cierre. Ver §10.

### 2.7 Reportes (Administrador)

Se implementan todos los siguientes, calculados sobre vistas y funciones SQL en Supabase:

- Ventas por rango (día / semana / mes / año / rango libre) con filtro por sede y canal.
- Ventas por hora del día (mapa de calor semanal para planificar personal).
- Productos más vendidos (top N por unidades y por ingreso).
- Categorías más vendidas.
- ~~Ranking de Vendedoras (ingreso generado, número de pedidos, ticket promedio)~~ — fuera de alcance por decisión explícita del usuario (bloque 9b), no planificado en un bloque concreto.
- ~~Ranking de Cajeras (turnos, pedidos cobrados, diferencia promedio en arqueo)~~ — fuera de alcance por decisión explícita del usuario (bloque 9b), no planificado en un bloque concreto.
- Ticket promedio global y por canal.
- ~~Mesas más rentables (ingreso por mesa, rotación)~~ — fuera de alcance por decisión explícita del usuario (bloque 9b), no planificado en un bloque concreto.
- Ventas por método de pago (participación %).
- Ventas por canal (mesa / domicilio / para llevar).
- Comparativos período contra período (semana vs. semana anterior, mes vs. mes anterior).
- Historial de arqueos y diferencias.
- Anulaciones y motivos.
- ~~Descuentos y promociones aplicados~~ — fuera de alcance permanente por decisión explícita del usuario (el restaurante no usa esta función).
- ~~Tiempo promedio de preparación por producto (de `enviado_cocina` a `listo`)~~ — fuera de alcance por decisión explícita del usuario (bloque 9b), no planificado en un bloque concreto.

Exportación a CSV y XLSX en todos los reportes.

---

## 3. Stack técnico

| Capa | Tecnología | Razón |
|---|---|---|
| Framework | **Next.js 15 (App Router)**, TypeScript estricto | SSR/RSC para reportes pesados, rutas por rol vía middleware. |
| Estilos | **Tailwind CSS** + tokens CSS personalizados | Consistencia del sistema Claymorphism definido en §8. |
| UI base | Componentes propios en `components/ui/*`, sin librerías de componentes cerradas. `lucide-react` para iconos. | El Claymorphism exige control fino de sombras y radios; las librerías estándar (shadcn, Radix) se pueden usar como **primitivas de accesibilidad** (Radix headless), pero el estilo final es propio. |
| Estado | Server Components + Server Actions donde aplique. `zustand` solo para estado UI local del cliente (carrito de pedido en curso, filtros). | Menos JS al cliente, menos hidratación innecesaria. |
| Formularios | `react-hook-form` + `zod` | Validación tipada compartida cliente/servidor. |
| Realtime | **Supabase Realtime** vía canales de Postgres Changes | KDS y sincronización de estado entre Vendedora y Cajera. |
| Backend | **Supabase**: Postgres, Auth, Storage, Edge Functions (Deno) | Un solo proveedor, RLS nativa, Realtime incluido. |
| Autenticación | Supabase Auth (email/password) + PIN vía Edge Function (§6). | Rotación rápida en dispositivos compartidos sin sacrificar RLS. |
| Gráficas | **Recharts** | Suficiente para todos los reportes descritos. |
| Fechas | `date-fns` con locale `es-CO`, zona `America/Bogota` **fija en todo el sistema**. | Evita drift de zona horaria en reportes. |
| Dinero | Helpers propios (`lib/money.ts`) con `bigint` de centavos. **Nunca `number` para montos.** | Precisión monetaria. |
| Impresión POS | Servicio local `print-bridge` en la PC de caja (Node.js) que expone HTTP en LAN y envía ESC/POS por TCP a la impresora térmica. Ver §10. | Único camino confiable multiplataforma. |
| Tests | `vitest` para unitarios, `playwright` para E2E de los flujos críticos (tomar pedido, cobrar, cerrar turno). | Cobertura donde más duele si se rompe. |

**Node** ≥ 20 LTS. **Package manager:** `pnpm`. **Linter/formatter:** `eslint` + `prettier` con reglas del proyecto (ver `.eslintrc` y `.prettierrc`).

---

## 4. Skills obligatorios en Claude Code

Antes de iniciar cualquier tarea no trivial, cargar y aplicar los siguientes skills. Si un skill no está instalado, **detente y pídelo al usuario** antes de proceder.

### 4.1 Superpowers (framework de Obra)

Repo: `https://github.com/obra/superpowers`.

Uso obligatorio:
- **`brainstorming`** al inicio de cualquier feature nueva, antes de escribir código.
- **`planning-execution-workflow`** para dividir features grandes en tareas ejecutables.
- **`test-driven-development`** para toda lógica de negocio (cálculo de totales, arqueo, agregación de reportes, transiciones de estado de pedido).
- **`root-cause-tracing`** ante cualquier bug reportado; no parches sintomáticos.
- **`writing-clearly-and-persuasively`** para todo texto visible al usuario (mensajes de error, tooltips, confirmaciones).

Regla dura: **ningún commit de lógica de negocio sin test previo**. Si Superpowers TDD dice "escribe el test primero", se cumple sin excepción.

### 4.2 UX/UI Pro Max Skill

Fuente: `https://ui-ux-pro-max-skill.nextlevelbuilder.io/`.

Uso obligatorio para:
- Definir jerarquía visual de cada pantalla antes de maquetar.
- Auditar cada vista terminada contra su checklist antes de marcar la tarea como completa.
- Resolver dudas de espaciado, contraste, densidad de información y estados (hover, focus, disabled, loading, empty, error).

### 4.3 Skills de Anthropic ya disponibles

- `frontend-design` para todo lo relativo a tokens, tipografía y consistencia general.
- `product-self-knowledge` si en algún momento el desarrollo toca la API de Anthropic (previsto solo si más adelante se integra un asistente de IA para el Admin; **no en el MVP**).

---

## 5. Estructura de carpetas

```
criollitas-os/
├── app/
│   ├── (auth)/
│   │   ├── login/                    # Login inicial email/password
│   │   └── pin/                      # Selección de usuario + PIN
│   ├── (admin)/
│   │   ├── layout.tsx
│   │   ├── dashboard/
│   │   ├── menu/                     # CRUD productos, categorías, modificadores
│   │   ├── mesas/                    # CRUD + vista de estado (Realtime)
│   │   ├── usuarios/
│   │   ├── sedes/
│   │   ├── reportes/
│   │   │   ├── ventas/
│   │   │   ├── productos/
│   │   │   ├── categorias/
│   │   │   ├── vendedoras/
│   │   │   ├── cajeras/
│   │   │   ├── metodos-pago/
│   │   │   ├── canales/
│   │   │   ├── mesas/
│   │   │   ├── tiempos/
│   │   │   ├── arqueos/
│   │   │   └── anulaciones/
│   │   ├── auditoria/
│   │   └── anular/                   # búsqueda por número de pedido + anulación con motivo
│   ├── (cajera)/
│   │   ├── layout.tsx
│   │   ├── pedidos/                  # Cola de pedidos por cobrar
│   │   ├── pedidos-en-curso/         # Domicilio/llevar en curso de toda la sede — ver y
│   │   │                             #   cancelar, nunca agregar productos (bloque C)
│   │   ├── cobrar/[pedidoId]/
│   │   ├── turno/
│   │   │   ├── abrir/
│   │   │   ├── movimientos/
│   │   │   └── cerrar/
│   │   └── mi-turno/                 # Reporte del turno actual
│   ├── (vendedora)/
│   │   ├── layout.tsx
│   │   ├── inicio/                   # Selector origen: mesa / domicilio / llevar
│   │   ├── pedido/
│   │   │   ├── nuevo/                # Carrito sin pedido creado aún — el pedido solo
│   │   │   │                         #   se crea al confirmar el primer producto
│   │   │   └── [pedidoId]/           # Editor de pedido ya existente (con ≥1 producto)
│   │   ├── mis-pedidos/               # Domicilio/llevar propios en curso (bloque C)
│   │   └── mesas/                    # (bloque 5) selección de mesa — reutiliza GrillaMesas
│   ├── (cocina)/
│   │   └── kds/
│   ├── api/
│   │   ├── auth/pin/route.ts         # Verificación de PIN vía Edge Function o route
│   │   └── print/route.ts            # Envío al print-bridge
│   └── layout.tsx
├── components/
│   ├── ui/                           # Botones, inputs, cards, modales (Claymorphism)
│   ├── menu/
│   ├── pedido/
│   ├── kds/
│   ├── caja/
│   └── reportes/
├── lib/
│   ├── supabase/
│   │   ├── client.ts                 # Browser client
│   │   ├── server.ts                 # Server client (RSC/Server Actions)
│   │   └── types.ts                  # Tipos generados con `supabase gen types`
│   ├── auth/
│   │   ├── roles.ts
│   │   └── pin.ts
│   ├── money.ts                      # Helpers de moneda COP
│   ├── dates.ts                      # Wrapper de date-fns con locale y TZ fijos
│   ├── escpos/                       # Constructor de tirilla ESC/POS
│   └── validations/                  # Esquemas Zod compartidos
├── supabase/
│   ├── migrations/                   # SQL versionado
│   ├── seed.sql
│   └── functions/                    # Edge Functions Deno
│       ├── login-pin/
│       └── close-shift/
├── print-bridge/                     # Servicio Node.js separado (repo independiente opcional)
│   ├── src/
│   └── package.json
├── tests/
│   ├── unit/
│   └── e2e/
├── CLAUDE.md                         # este archivo
├── README.md
└── package.json
```

---

## 6. Autenticación (email + PIN) y RLS

### 6.1 Flujo de login

1. **Primer uso del dispositivo:** Admin (o cualquier usuario con credenciales) inicia sesión con email/password en `/login`. La sesión Supabase queda persistida en el dispositivo.
2. **Uso diario / cambio de turno:** en `/pin`, la app muestra la lista de usuarios de la sede actual (avatar + nombre). El usuario toca su nombre y digita su PIN de 4-6 dígitos.
3. El cliente llama a `POST /api/auth/pin` (o directamente a la Edge Function `login-pin`) con `{ usuario_id, pin }`.
4. La Edge Function busca `pin_hash` en la tabla `usuarios`, verifica con **bcrypt** (o `argon2`), y si es válida devuelve un **token de sesión Supabase** generado con la Service Role Key (no expuesta al cliente).
5. El cliente hace `supabase.auth.setSession(...)` con ese token. A partir de ese momento, `auth.uid()` retorna el usuario real y RLS opera normalmente.

**Rate limiting** obligatorio en la Edge Function: máximo 5 intentos por usuario cada 5 minutos. Tras 5 fallos, bloqueo temporal y notificación al Admin.

### 6.2 RLS — política general

- Toda tabla con datos operativos lleva `sede_id`.
- Se define una función `public.current_sede_id()` y `public.current_rol()` que leen del `raw_app_meta_data` del JWT.
- **Vendedora:** SELECT/INSERT/UPDATE sobre pedidos de su sede que ella creó (`vendedora_id = auth.uid()`), mientras `estado` no sea `cobrado`, `cerrado`, `anulado` ni `cancelado` (permite seguir agregando ítems después de enviar a cocina). Puede cancelar su propio pedido en cualquier estado previo a `cobrado` (RPC `cancelar_pedido`, motivo obligatorio) — distinto de `anular_pedido` (admin, exclusivo de pedidos ya cobrados, §2.2); si el canal es `mesa`, la mesa se libera automáticamente en la misma transacción. Desde el bloque E, estas mismas policies (`pedidos`, `pedido_items`, `pedido_item_mods`, `clientes_domicilio`) también admiten a la **Cajera** actuando como dueña de su propio pedido (`vendedora_id = auth.uid()`) — la cajera puede tomar pedidos de los 3 canales exactamente igual que la vendedora.
- **Cajera:** además de lo anterior (dueña de sus propios pedidos, bloque E), SELECT sobre todos los pedidos de su sede en cualquier estado no terminal (`abierto`/`enviado_cocina`/`en_preparacion`/`listo`/`entregado`) más `cobrado`/`cancelado` — ampliado en el bloque C para que pueda ver y cancelar pedidos ajenos de domicilio/llevar en curso, no solo cobrarlos. Sobre `pedidos` **ajenos** puede escribir `estado` hacia `cobrado` (desde `listo`/`entregado`) o hacia `cancelado` (junto con `motivo_cancelacion` en la misma sentencia vía `cancelar_pedido`, RPC compartido con la vendedora); ninguna otra columna, vía un trigger de columnas que se desactiva cuando el pedido es suyo propio (`vendedora_id = auth.uid()`, bloque E) — sobre su propio pedido tiene la misma libertad de columnas que la vendedora. Un solo turno `abierto` a la vez (índice único parcial); su UPDATE de `turnos_caja` está restringido por trigger a los campos de cierre. `pagos`/`movimientos_caja` son de solo INSERT/SELECT (inmutables, sin política de UPDATE/DELETE para ningún rol). `impresiones` admite además UPDATE, para reintentar una impresión fallida. `cobrarPedido`/`cerrarTurno` son RPCs atómicos con lock explícito sobre la fila que protegen (`turnos_caja`/`pedidos`), evitando condiciones de carrera entre un cobro y un cierre de turno concurrentes. Sobre `mesas`, comparte con la vendedora una sola policy bidireccional (`mesas_staff_update_estado`, libre↔ocupada, bloque E) en vez de dos policies separadas.
- **Administrador:** acceso total a su(s) sede(s). Un admin global (`is_super_admin = true`) ve todas.
- **Cocina:** rol especial `cocina`, SELECT sobre pedidos `enviado_cocina`/`en_preparacion`/`listo`. UPDATE de `pedido_items` restringido a nivel de columna a `estado_item`/`tiempo_listo_en`. Sobre `pedidos` solo puede escribir `estado` (limitado a esos mismos 3 valores) y `enviado_cocina_en`; ninguna otra columna, vía un trigger que rechaza el UPDATE si cambia algo más. Un RPC atómico hace ambas escrituras (ítem + agregado) en una sola sentencia: el agregado del pedido se recalcula solo cuando todos sus ítems coinciden.

Cada política se implementa en su migración correspondiente y se prueba con un test E2E que intenta violarla desde el rol equivocado y espera un 401/403.

---

## 7. Modelo de datos (Supabase Postgres)

Resumen de tablas principales. El SQL completo vive en `supabase/migrations/`.

```
sedes                (id, nombre, direccion, telefono, activa, usa_cocina, creado_en)
                     -- usa_cocina: si es false, los pedidos saltan directo a 'listo'
                     --   sin pasar por el flujo de cocina/KDS (bloque D); default true
usuarios             (id [FK auth.users], sede_id, nombre, rol, pin_hash, activo,
                      avatar_url, creado_en)
                     -- rol ∈ {admin, cajera, vendedora, cocina}
categorias           (id, sede_id, nombre, orden, activa, imagen_url)
productos            (id, sede_id, categoria_id, nombre, descripcion, precio_cop,
                      imagen_url, activo, tiempo_prep_min, es_combo)
modificadores        (id, producto_id, grupo, nombre, precio_delta_cop, obligatorio,
                      max_seleccion)
                     -- ej: "sin cebolla", "extra queso +2000"
                     -- grupo agrupa opciones excluyentes (ej. "Queso": campesino|mozzarella)
mesas                (id, sede_id, numero, nombre, capacidad, activa, estado)
                     -- estado ∈ {libre, ocupada, reservada}
                     -- libre→ocupada: automático al confirmar el primer ítem del
                     --   pedido (no al crear el pedido); ocupada→libre: automático
                     --   al cobrar el pedido (cobrar_pedido). "reservada" es manual,
                     --   solo el admin la fija/quita desde /mesas.
clientes_domicilio   (id, sede_id, nombre, telefono, direccion, referencia, notas)

pedidos              (id, sede_id, numero_corto, canal, mesa_id, cliente_id,
                      vendedora_id, estado, subtotal_cop, descuento_cop,
                      propina_cop, total_cop, notas, creado_en, cerrado_en,
                      enviado_cocina_en, motivo_cancelacion)
                     -- canal ∈ {mesa, domicilio, llevar}
                     -- enviado_cocina_en: se fija una sola vez, la primera vez
                     --   que el pedido entra a enviado_cocina (nunca se
                     --   sobreescribe); base del semáforo de tiempo del KDS
                     -- estado ∈ {abierto, enviado_cocina, en_preparacion,
                     --           listo, entregado, cobrado, cerrado, anulado,
                     --           cancelado}
                     -- motivo_cancelacion: solo se llena cuando estado=
                     --   cancelado (RPC cancelar_pedido, vendedora, pre-cobro);
                     --   distinto de anulado/anulaciones (admin, post-cobro,
                     --   bloque 8) -- no genera fila en anulaciones.
pedido_items         (id, pedido_id, producto_id, cantidad, precio_unit_cop,
                      subtotal_cop, notas, estado_item, tiempo_listo_en)
                     -- estado_item ∈ {pendiente, en_preparacion, listo, entregado}
pedido_item_mods     (id, pedido_item_id, modificador_id, precio_delta_cop)

turnos_caja          (id, sede_id, cajera_id, abierto_en, cerrado_en,
                      efectivo_inicial_cop, efectivo_declarado_cop,
                      esperado_cop, diferencia_cop, estado, notas)
                     -- estado ∈ {abierto, cerrado}
movimientos_caja     (id, turno_id, tipo, concepto, monto_cop, creado_en)
                     -- tipo ∈ {retiro, gasto, ingreso_extra}
pagos                (id, pedido_id, turno_id, metodo, monto_cop, referencia,
                      creado_en)
                     -- metodo ∈ {efectivo, nequi, daviplata, bancolombia_qr,
                     --           datafono, otro}

impresiones          (id, pedido_id, tipo, contenido_escpos, enviado_en,
                      exito, error, creado_en)
                     -- tipo ∈ {comanda_cocina, tirilla_cobro, copia}
                     -- el bloque 7 solo produce tipo='tirilla_cobro';
                     --   comanda_cocina/copia quedan reservados para uso
                     --   futuro, la columna es texto libre, no un enum

auditoria            (id, sede_id, usuario_id, accion, tabla, registro_id,
                      diff_json, creado_en)

anulaciones          (id, pedido_id, usuario_id, motivo, creado_en)

-- Vistas y funciones para reportes (bloque 9a: infraestructura + ventas)
vw_ventas_diarias           -- agregado diario por sede/canal, solo pedidos 'cobrado';
                             --   sede_id y current_rol()='admin' filtrados dentro de
                             --   la vista misma (una vista corre con privilegios del
                             --   dueño, no del invocador, así que RLS de `pedidos` no
                             --   se aplica automáticamente a través de ella)
fn_reporte_ventas_rango(desde, hasta, canal?)
fn_reporte_mapa_calor_horas(desde, hasta)     -- promedio por día-de-semana×hora, no suma
fn_reporte_ticket_promedio_global(desde, hasta)
fn_reporte_ticket_promedio_canal(desde, hasta)
fn_reporte_metodos_pago(desde, hasta)
fn_reporte_canales(desde, hasta)

-- Bloque 9b: productos y categorías (ranking de Vendedoras/Cajeras, mesas
-- más rentables y tiempo de preparación quedan fuera de alcance por
-- decisión explícita del usuario — no planificados en un bloque concreto)
fn_reporte_productos(desde, hasta)    -- todos los productos vendidos, sin filtrar por
                                       --   activo; ordena/trunca al top N en la UI
fn_reporte_categorias(desde, hasta)

-- Bloque 9c: caja y auditoría (descuentos/promociones aplicados queda
-- fuera de alcance permanente por decisión explícita del usuario — el
-- restaurante no usa esa función, no hay entidad "promoción" en el modelo)
fn_reporte_arqueos(desde, hasta)      -- turnos 'cerrado', filtra por cerrado_en
fn_reporte_anulaciones(desde, hasta)  -- filtra por anulaciones.creado_en
```

**Reglas de dinero:** todos los montos se almacenan como `bigint` en **centavos de peso colombiano** (`_cop` en el nombre). Nunca `numeric` con decimales, nunca `float`. La UI convierte en el borde.

**Auditoría:** un trigger `pg_audit_trigger` (bloque 8) escribe en `auditoria` con el `diff` JSON (`before`/`after`). Insertos, updates y deletes quedan registrados con `usuario_id = auth.uid()`. Por ahora solo está adjunto a las tablas financieras/sensibles: `pedidos`, `pagos`, `turnos_caja`, `movimientos_caja`, `anulaciones`, `usuarios` — el resto de tablas operativas (mesas, productos, categorías, modificadores, sedes) ya tienen soft-delete y se instrumentan si hace falta más adelante. `pagos`, `movimientos_caja` y `anulaciones` no tienen columna `sede_id` propia; el trigger la resuelve vía `turno_id`/`pedido_id` como respaldo para que sus filas sigan siendo visibles bajo RLS (`auditoria_admin_select` exige `sede_id = current_sede_id()`, que nunca es `null`).

---

## 8. Sistema de diseño — Claymorphism Criollitas

El estilo se aleja del claymorphism genérico (pasteles fríos) para adaptarlo a la identidad cálida de la marca: fondo chocolate, superficies crema elevadas con doble sombra (externa oscura + luz interna cálida), acentos en amarillo mostaza, verde lechuga y rojo tomate. Todo con radios generosos (≥20px).

### 8.1 Tokens de color

Definidos como CSS variables en `app/globals.css` y expuestos a Tailwind v4 vía `@theme inline` en `app/globals.css`.

```css
:root {
  /* Marca — extraídos del logo */
  --brand-chocolate:    #3D1F14;  /* fondo principal */
  --brand-chocolate-2:  #52281A;  /* superficies hundidas */
  --brand-chocolate-3:  #2A1409;  /* profundidades, sombras */
  --brand-mostaza:      #F5B822;  /* CTA principal, marca "criollitas" */
  --brand-mostaza-2:    #FFC94A;  /* hover */
  --brand-mostaza-3:    #D69A0C;  /* pressed */
  --brand-crema:        #FFF8E7;  /* superficies elevadas (cards) */
  --brand-crema-2:      #FFEFD1;  /* superficies elevadas hover */
  --brand-crema-3:      #F5E4BE;  /* borde inferior de tarjeta clay */
  --brand-verde:        #7CB342;  /* éxito, mesa libre, listo */
  --brand-verde-2:      #9CCC65;
  --brand-tomate:       #D84315;  /* alerta, anulación, destructivo */
  --brand-tomate-2:     #E85D2E;
  --brand-tomate-3:     #F5CBB3;  /* tinte claro para superficies de estado opaco (ej. MesaTile reservada); NO sigue la convención "-3 = pressed/profundidad" usada arriba */

  /* Semánticos */
  --surface:            var(--brand-crema);
  --surface-elevated:   #FFFDF5;
  --surface-sunken:     var(--brand-crema-3);
  --text-primary:       var(--brand-chocolate);
  --text-secondary:     #6B4A38;
  --text-inverse:       var(--brand-crema);
  --border-soft:        rgba(61, 31, 20, 0.08);
  --border-strong:      rgba(61, 31, 20, 0.16);

  /* Sombras Claymorphism — la firma visual */
  --clay-shadow-sm:
    0 4px 8px -2px rgba(42, 20, 9, 0.25),
    0 -2px 4px 0 rgba(255, 248, 231, 0.6) inset,
    0 2px 4px 0 rgba(42, 20, 9, 0.12) inset;
  --clay-shadow-md:
    0 8px 16px -4px rgba(42, 20, 9, 0.30),
    0 -3px 6px 0 rgba(255, 248, 231, 0.7) inset,
    0 3px 6px 0 rgba(42, 20, 9, 0.15) inset;
  --clay-shadow-lg:
    0 16px 32px -8px rgba(42, 20, 9, 0.35),
    0 -4px 8px 0 rgba(255, 248, 231, 0.75) inset,
    0 4px 8px 0 rgba(42, 20, 9, 0.18) inset;
  --clay-shadow-pressed:
    0 2px 4px -1px rgba(42, 20, 9, 0.20),
    0 3px 6px 0 rgba(42, 20, 9, 0.20) inset,
    0 -1px 2px 0 rgba(255, 248, 231, 0.3) inset;

  /* Sombras Claymorphism para superficie oscura (chocolate) */
  --clay-shadow-dark-md:
    0 8px 16px -4px rgba(0, 0, 0, 0.5),
    0 -3px 6px 0 rgba(245, 184, 34, 0.15) inset,
    0 3px 6px 0 rgba(0, 0, 0, 0.35) inset;
}
```

### 8.2 Radios y tipografía

```css
:root {
  --radius-sm: 12px;
  --radius-md: 20px;   /* default para tarjetas y botones */
  --radius-lg: 28px;
  --radius-xl: 36px;
  --radius-pill: 999px;

  --font-display: "Fredoka", system-ui, sans-serif;   /* refleja "criollitas" del logo */
  --font-body:    "Inter", system-ui, sans-serif;
  --font-mono:    "JetBrains Mono", ui-monospace, monospace;  /* tickets, cifras */
}
```

Cargar Fredoka e Inter con `next/font/google` en `app/layout.tsx`. No cargar por CDN externa.

### 8.3 Componentes base (contrato)

Cada uno vive en `components/ui/` y expone variantes vía `cva` (`class-variance-authority`).

- **`<ClayButton />`** — variantes: `primary` (mostaza), `secondary` (crema), `ghost`, `destructive` (tomate), `success` (verde). Tamaños: `sm`, `md`, `lg`, `xl`. Estados: hover eleva sombra, pressed usa `--clay-shadow-pressed`, disabled desatura y baja opacidad. Focus visible con outline mostaza a 3px.
- **`<ClayCard />`** — superficie crema sobre fondo chocolate con `--clay-shadow-md`. Padding por defecto `p-6`. Variante `elevated` (`lg`), `flat` (sin sombra externa), `sunken`.
- **`<ClayInput />`** — sombra interna (hundida), radio `md`, label flotante o fija según densidad.
- **`<ClayTabs />`**, **`<ClayModal />`**, **`<ClayBadge />`**, **`<ClayToast />`**.
- **`<StatCard />`** — para dashboards de reportes.
- **`<MesaTile />`** — con estado libre/ocupada/reservada codificado por color de fondo (verde/mostaza/tomate suaves) y sombra correspondiente.

**Accesibilidad**: contraste AA mínimo en todo texto. En superficies mostaza, texto chocolate. En superficies chocolate, texto crema. Nunca texto crema sobre mostaza (falla contraste).

### 8.4 Densidad por rol

- **Vendedora (tablet/celular):** targets táctiles ≥ 48px, tipografía cuerpo 16px, botones grandes, columnas amplias.
- **Cajera (PC):** densidad media, tablas legibles a 1m, atajos de teclado (F2 cobrar, F4 imprimir, Esc cancelar).
- **Admin (desktop):** densidad alta permitida en tablas de reportes; gráficas con leyendas claras.
- **KDS (pantalla cocina):** fuentes 20-24px cuerpo, 32px número de pedido, alto contraste, sin colores decorativos que compitan con el semáforo de tiempo.

---

## 9. Rutas por rol y middleware

`middleware.ts` en la raíz:

1. Refresca la sesión Supabase.
2. Lee el rol del JWT.
3. Redirige según:
   - Sin sesión → `/login`.
   - Sesión sin PIN validado (flag en cookie) y ruta no pública → `/pin`.
   - Rol `vendedora` intentando entrar a `/(admin)` o `/(cajera)` → `/vendedora/inicio` y log de auditoría.
   - Análogo para `cajera` y `cocina`.
   - `/mesas` (CRUD + vista de estado) pertenece a `admin` desde el bloque 4; la vista de la vendedora para seleccionar mesa llega en el bloque 5 (reutiliza `GrillaMesas` en modo solo lectura).
4. La ruta `/(cocina)/kds` puede exponerse en modo kiosco con un token de sede (no requiere PIN de usuario), configurable por Admin.

---

## 10. Impresión POS — arquitectura

### 10.1 Servicio `print-bridge`

Pequeña app Node.js que corre en la PC de caja (o en un mini-PC / Raspberry Pi conectado por LAN). Expone:

```
POST http://<ip-local>:7070/print
  Body: { "printer": "caja-01", "escpos_base64": "..." }
  Auth: header X-Bridge-Token (compartido con la app Next.js)
```

Internamente, al recibir `POST /print`, abre un socket TCP contra `PRINTER_IP:PRINTER_PORT` (puerto 9100 típico, protocolo raw/JetDirect) y escribe los bytes ESC/POS decodificados -- la IP de la impresora vive en `print-bridge/.env`, no en el body de la petición. Sin cola en disco ni reintentos propios: la app ya absorbe un fallo de impresión a su nivel (`impresiones.exito = false`, reintento manual). Se distribuye como `print-bridge.exe` empaquetado con `pkg` -- el usuario no necesita instalar Node.js. Ver `docs/superpowers/specs/2026-07-15-print-bridge-red-design.md` para el diseño completo y `print-bridge/README.md` para la puesta en marcha.

### 10.2 Cliente

`lib/escpos/` construye el ticket con un builder tipado (encabezado, línea, alineación, corte, apertura de cajón). La app se despliega en Vercel (nube): el servidor **no tiene ruta de red hacia la IP LAN del print-bridge**, así que el `POST /print` nunca lo hace el servidor — lo hace el navegador de la Cajera, que sí está en la misma red que el print-bridge (`lib/escpos/clienteBridge.ts`, `enviarAlPrintBridgeDesdeNavegador`). El flujo: la Server Action `cobrarPedido` calcula el total, registra los pagos, cambia el estado a `cobrado`, arma el ticket ESC/POS y lo deja guardado en `impresiones` (`prepararImpresionTirilla`) — y devuelve ese contenido al cliente. `FormularioCobro.tsx` recibe la respuesta y, **después** de que el cobro ya quedó confirmado, hace el `POST` al print-bridge desde el propio navegador y reporta el resultado con la Server Action `reportarResultadoImpresion`. Si el bridge falla, el pago queda registrado igual y se marca `impresiones.exito = false` para reintento manual (`prepararReintentoImpresion`) desde la vista de Cajera. Por esto `PRINT_BRIDGE_URL`/`PRINT_BRIDGE_TOKEN` son variables `NEXT_PUBLIC_` (visibles en el navegador) — el print-bridge solo escucha en la LAN del local, así que ese token no protege nada que un atacante en internet pudiera alcanzar de todos modos.

### 10.3 Configuración

Hoy la configuración de la impresora vive en `print-bridge/.env` (`PRINTER_IP`, `PRINTER_PORT`, un solo valor -- una Cajera, una impresora). La tabla `sedes.impresoras` mencionada en versiones previas de este documento como UI de Admin para registrar impresoras por IP/ancho/copias **no existe todavía** -- se construye si el negocio crece a más sedes o impresoras (fuera de alcance del diseño actual, ver `docs/superpowers/specs/2026-07-15-print-bridge-red-design.md`).

---

## 11. Realtime

Canales Supabase:

- `pedidos:sede_<id>` — INSERT/UPDATE de la tabla `pedidos` y `pedido_items`. Suscriben KDS, Cajera y Vendedora (para ver estados actualizados).
- `mesas:sede_<id>` — cambios de estado de mesas. Suscribe Vendedora.
- `turnos:sede_<id>` — turno abierto/cerrado. Suscribe Admin.

Todas las suscripciones se abren en Client Components montados en el layout del rol. Se cierran en `useEffect` cleanup. Nunca en RSC.

---

## 12. Convenciones de código

- **TypeScript estricto**: `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`.
- **Nunca `any`**. Si no hay tipo, usar `unknown` y estrechar.
- **Server Actions** para toda mutación de datos. No `route.ts` para mutaciones salvo integraciones externas (print-bridge).
- **Validación Zod** en el borde de cada Server Action. El tipo TS se deriva de Zod, no al revés.
- **Errores**: nunca `throw new Error("string")` en dominio. Usar `Result<T, DomainError>` con union discriminada. `DomainError` es un enum tipado.
- **Nombres en español para el dominio** (`pedido`, `mesa`, `vendedora`, `arqueo`), inglés para infraestructura (`middleware`, `client`, `service`). Consistencia > pureza.
- **Componentes**: PascalCase, un componente por archivo salvo variantes íntimamente ligadas.
- **Server vs Client**: por defecto Server. Marcar `"use client"` solo si hay interactividad, estado local, o hooks del navegador.
- **Imports**: alias `@/` para la raíz. Orden: externos → `@/lib` → `@/components` → relativos.
- **Commits**: Conventional Commits en español (`feat: agregar cobro con pago mixto`).
- **Ramas**: `main` protegida, PRs desde `feature/*`, `fix/*`, `chore/*`.

---

## 13. Guardarraíles — qué NO hacer

Estas son líneas rojas. Si una tarea implica cruzarlas, **detente y pregunta**.

1. **No** exponer la Service Role Key de Supabase al cliente. Vive solo en Edge Functions y variables del servidor.
2. **No** confiar en el rol del cliente para autorizar. Toda autorización se hace en RLS o en la Server Action con `getUser()`.
3. **No** usar `number` para dinero. `bigint` en centavos o `Dinero`, siempre.
4. **No** hacer cálculos de reportes en el cliente. Vistas SQL o funciones RPC.
5. **No** manejar zonas horarias distintas a `America/Bogota`. Todo timestamp se guarda `timestamptz` y se muestra en Bogotá.
6. **No** persistir sesiones sin PIN validado en dispositivos de operación.
7. **No** permitir edición de pedidos ya cobrados. Solo reversión completa con motivo, por Admin.
8. **No** eliminar productos ni categorías. Soft delete con `activo = false`. La integridad histórica de reportes lo exige.
9. **No** enviar comandos de impresión sin registrar en `impresiones` primero.
10. **No** introducir dependencias nuevas sin justificar en el PR (bundle size, mantenimiento, alternativa nativa).
11. **No** escribir texto visible al usuario en inglés. Todo en español de Colombia. Formatos: `es-CO`, moneda `COP` con separador de miles `.` y sin decimales (`$ 12.500`).
12. **No** desactivar tests para hacer merge. Si un test falla, se arregla el código o el test, con justificación.

---

## 14. Variables de entorno

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=            # solo servidor

NEXT_PUBLIC_PRINT_BRIDGE_URL=http://192.168.x.x:7070  # el navegador de la Cajera llama esto directo, ver §10.2
NEXT_PUBLIC_PRINT_BRIDGE_TOKEN=

NEXT_PUBLIC_APP_TZ=America/Bogota
NEXT_PUBLIC_APP_LOCALE=es-CO
NEXT_PUBLIC_APP_CURRENCY=COP
NEXT_PUBLIC_SEDE_ID=
```

Nunca commitear `.env.local`. `.env.example` sí, con placeholders.

---

## 15. Comandos de desarrollo

```bash
pnpm install
pnpm dev                     # Next.js en :3000
pnpm supabase:start          # Supabase local con Docker
pnpm supabase:migrate        # aplicar migraciones
pnpm supabase:types          # regenerar lib/supabase/types.ts
pnpm supabase:seed           # data de prueba (1 sede, menú demo, 5 mesas, usuarios)
                              # Sin Docker local, el flujo actual es `supabase link` +
                              # `supabase db push` contra el proyecto cloud deliarepas.
pnpm test                    # unitarios (vitest)
pnpm test:e2e                # end-to-end (playwright)
pnpm lint
pnpm build
```

Print-bridge:

```bash
cd print-bridge
pnpm install
pnpm dev                     # levanta el servicio en :7070
```

---

## 16. Roadmap del MVP

Orden sugerido; cada bloque se aborda con Superpowers `planning-execution-workflow` y sale a `main` con tests verdes.

1. **Infraestructura**: Next.js + Supabase local + tokens y componentes base Claymorphism (`ClayButton`, `ClayCard`, `ClayInput`).
2. **Auth**: registro de usuarios por Admin, login email/password, pantalla PIN, Edge Function `login-pin` con rate limit.
3. **Menú**: CRUD categorías, productos, modificadores. Subida de imágenes a Supabase Storage.
4. **Mesas**: CRUD y vista de estado. Realtime.
5. **Toma de pedido (Vendedora)**: selector origen, editor de pedido, envío a cocina.
6. **KDS**: vista Realtime, transición de estados de ítem.
7. **Cobro (Cajera)**: cola de pedidos, cobro simple, pago mixto, impresión ESC/POS vía print-bridge.
8. **Turnos**: apertura, movimientos, cierre con arqueo.
9. **Reportes**: dashboard admin con todos los reportes de §2.7, export CSV/XLSX.
10. **Auditoría y anulaciones**.
11. **Endurecimiento**: pruebas E2E de los 3 flujos críticos, revisión de RLS, revisión de accesibilidad con UX/UI Pro Max, revisión de rendimiento (LCP < 2.5s en 3G lento para Vendedora en tablet).

---

## 17. Cómo trabajar tarea por tarea

Para cada tarea que Claude Code aborde:

1. Cargar los skills relevantes (§4).
2. Ejecutar `brainstorming` breve si la tarea no es trivial.
3. Escribir el plan con `planning-execution-workflow` en un comentario del PR o issue.
4. Para lógica de negocio, empezar por el test (TDD).
5. Implementar respetando §12 y §13.
6. Antes de dar la tarea por terminada, correr `pnpm lint && pnpm test && pnpm build`.
7. Auditar la UI resultante con la checklist del UX/UI Pro Max Skill.
8. Dejar en el PR: qué cambió, por qué, cómo se probó, capturas si toca UI, y cualquier decisión que amerite quedar en este `CLAUDE.md` (proponer edit).

Fin del documento.
