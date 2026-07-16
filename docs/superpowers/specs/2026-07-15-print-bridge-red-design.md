# Print-bridge (impresora de red): Diseño

## Contexto

`print-bridge/` está descrito en CLAUDE.md §5/§10 pero nunca se construyó — hoy no existe ni una línea de código. La impresora térmica tiene su propia IP en la red del local (Ethernet/WiFi), no está conectada por USB al PC de caja — print-bridge le habla directo por TCP.

La app ya sabe hablarle a print-bridge correctamente: tras el fix de este mismo día (`lib/escpos/clienteBridge.ts`), el **navegador de la Cajera** hace `POST http://<PRINT_BRIDGE_URL>/print` con `{ printer, escpos_base64 }` y header `X-Bridge-Token` — eso no cambia. Este camino ya funciona igual sin importar si la app principal está en la nube (Vercel) o si el POS está operando en modo offline: tanto el navegador de la Cajera como la impresora están siempre en la misma red local del restaurante, algo que nunca dependió de que Vercel sea alcanzable. Lo que falta construir es el servicio que recibe esa petición del navegador y entrega los bytes a la impresora física por la red.

## Decisiones confirmadas con el usuario

1. **Impresora de red** — tiene su propia IP fija (o reservada) en la LAN del local, puerto 9100 (estándar de facto para impresión ESC/POS "raw"/JetDirect, CLAUDE.md §10.1 ya lo mencionaba).
2. **Distribución: ejecutable único** (`print-bridge.exe`) — el usuario no quiere instalar Node.js ni correr comandos de terminal en el PC de caja. Solo abre el .exe.

## Enfoque para imprimir

**Socket TCP directo a `<PRINTER_IP>:<PRINTER_PORT>`** usando el módulo nativo `node:net`: se conecta, escribe los bytes ESC/POS decodificados, y cierra la conexión (`socket.end(bytes)`) — la impresora recibe todo el flujo hasta el cierre e imprime. Es el protocolo "raw"/JetDirect estándar que casi todas las impresoras térmicas de red soportan en el puerto 9100.

Esto es más simple que la alternativa USB descartada en una iteración anterior de este mismo diseño: sin archivos temporales, sin comandos de shell, sin nada específico de Windows — `node:net` es built-in y multiplataforma, así que el empaquetado con `pkg` es igual de trivial y además el código no depende del sistema operativo donde corra.

Consecuencia: **cero dependencias externas** en el servicio — solo módulos built-in de Node (`http`, `net`, `crypto`, `fs`) — el empaquetado con `pkg` es confiable.

## Arquitectura

### Estructura de archivos

```
print-bridge/
├── src/
│   ├── servidor.ts          # Servidor HTTP (http nativo), enrutamiento, CORS
│   ├── autenticacion.ts     # Verificación de X-Bridge-Token (función pura)
│   ├── paqueteImpresion.ts  # Valida y prepara los bytes + destino (función pura, testeable)
│   ├── imprimir.ts          # Abre el socket TCP y envía los bytes (I/O, sin test)
│   └── config.ts            # Carga .env (parseo puro testeable + lectura de disco sin test)
├── config.example.env       # Plantilla: PRINT_BRIDGE_TOKEN, PRINTER_IP, PRINTER_PORT, PUERTO
├── package.json
├── tsconfig.json
└── tests/
    ├── autenticacion.test.ts
    ├── paqueteImpresion.test.ts
    └── config.test.ts
```

Config real vive en `print-bridge/.env` (no versionado, igual que `.env.local` en la app principal), leído por el `.exe` desde su propia carpeta al arrancar.

### Flujo de una petición

1. `POST /print` con body `{ printer: string, escpos_base64: string }` y header `X-Bridge-Token`.
2. **CORS primero** (mismo motivo que el fix de `login-pin` este mismo día: el navegador de la Cajera llama a un origen distinto — `http://192.168.x.x:7070` — así que hay preflight `OPTIONS` por el header custom `X-Bridge-Token`). Responde `Access-Control-Allow-Origin: *` (servicio solo alcanzable desde la LAN del local, mismo criterio ya aplicado a `login-pin`) y maneja `OPTIONS` con `204`.
3. `autenticacion.ts`: compara `X-Bridge-Token` contra `PRINT_BRIDGE_TOKEN` del `.env`. Si no coincide → `401`.
4. Valida body (`printer` no vacío, `escpos_base64` es base64 válido) → si no, `400`.
5. `paqueteImpresion.ts` (pura): decodifica el base64 a un `Buffer` y valida que `PRINTER_IP`/`PRINTER_PORT` (del `.env`, no del body) estén configurados. El `printer` del body identifica lógicamente la impresora (hoy solo existe `"caja-01"`, coincide con el valor ya hardcodeado en `clienteBridge.ts`) — la IP/puerto reales salen del `.env`, así el usuario los ajusta sin tocar código si cambia de impresora.
6. `imprimir.ts` (I/O): abre el socket TCP a `PRINTER_IP:PRINTER_PORT`, escribe los bytes, espera el cierre de la conexión, y responde `200 { ok: true }` o `500 { ok: false, error }` según el resultado (timeout de conexión a los 5s si la impresora no responde).

### Sin cola en disco ni reintentos en el bridge

La app ya absorbe el fallo a su nivel: `impresiones.exito = false` queda registrado y hay reintento manual (`prepararReintentoImpresion`). Un print-bridge que intenta una vez y responde éxito/error es suficiente y más simple — evita construir una cola SQLite (mencionada como aspiración en CLAUDE.md §10.1) que hoy no resuelve un problema real. Si en el futuro hace falta (ej. impresora frecuentemente apagada), se agrega como iteración separada.

### Endpoints

- `POST /print` — el descrito arriba.
- `GET /salud` — responde `200 { ok: true }` sin auth, para que el usuario (o quien lo ayude a diagnosticar) confirme desde el navegador que el servicio está corriendo, sin necesitar herramientas técnicas.

### Empaquetado

`pkg` (evaluar `@yao-pkg/pkg` si el paquete original está sin mantenimiento activo al momento de implementar) genera `print-bridge.exe` para Windows x64 desde `src/servidor.ts` ya compilado. El `.env` se lee de la carpeta donde vive el `.exe` (no embebido en el binario), para que el usuario pueda editar la IP de su impresora sin recompilar nada.

Arranque automático al encender el PC: fuera de alcance de esta iteración — el usuario puede crear manualmente un acceso directo en `shell:startup` de Windows si lo quiere. Se documenta el paso en el README del servicio, no se automatiza.

## Testing

- `autenticacion.ts`, `paqueteImpresion.ts` y la función de parseo de `config.ts` son funciones puras → TDD normal (vitest, igual que el resto del proyecto): token correcto/incorrecto/ausente; base64 válido/inválido; validación de IP/puerto configurados o faltantes; parseo de líneas `.env`.
- `imprimir.ts` y `servidor.ts` (I/O real: socket TCP, socket HTTP) sin test automatizado — mismo criterio ya establecido en el proyecto para wrappers de red/hardware (`hacerPing`, `enviarAlPrintBridge` original). Se verifica manualmente contra una impresora real al finalizar (o contra un listener TCP de prueba si no hay impresora disponible en el momento de implementar).

## Fuera de alcance

- Integración con `sedes.impresoras` (CLAUDE.md §10.3, UI de Admin para registrar impresoras) — no existe esa tabla/UI todavía; hoy hay una sola Cajera con una sola impresora, y la IP vive en el `.env` del bridge. Se revisita si el negocio crece a más sedes/impresoras.
- Soporte para impresora USB — evaluado y descartado en una iteración anterior de este mismo diseño; la impresora real del usuario es de red. Si en el futuro hace falta soporte USB además, se vuelve a evaluar como su propia iteración.
- Instalador/registro como servicio de Windows — el usuario abre el `.exe` manualmente (o vía acceso directo en inicio de sesión); no se construye un instalador ni un Windows Service.
