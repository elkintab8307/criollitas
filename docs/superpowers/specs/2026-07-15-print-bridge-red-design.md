# Print-bridge (impresora USB): Diseño

## Contexto

`print-bridge/` está descrito en CLAUDE.md §5/§10 pero nunca se construyó — hoy no existe ni una línea de código. El diseño original asumía una impresora térmica de **red** (socket TCP directo al puerto 9100 de la IP de la impresora). El usuario aclaró: su impresora está conectada por **USB** al PC de caja, ya instalada y reconocida por Windows (aparece en "Dispositivos e impresoras").

La app ya sabe hablarle a print-bridge correctamente: tras el fix de este mismo día (`lib/escpos/clienteBridge.ts`), el **navegador de la Cajera** hace `POST http://<PRINT_BRIDGE_URL>/print` con `{ printer, escpos_base64 }` y header `X-Bridge-Token` — eso no cambia. Lo que falta construir es el servicio que recibe esa petición y entrega los bytes a la impresora física, y ahí el camino es USB, no TCP.

## Decisiones confirmadas con el usuario

1. **Impresora ya instalada en Windows** — no hay que lidiar con drivers ni reconocimiento de dispositivo, solo con enviarle bytes crudos a través de la cola de impresión que Windows ya expone.
2. **Distribución: ejecutable único** (`print-bridge.exe`) — el usuario no quiere instalar Node.js ni correr comandos de terminal en el PC de caja. Solo abre el .exe.

## Enfoque para imprimir (y por qué, sobre las alternativas)

**Elegido: copiar los bytes ESC/POS directo a la cola de Windows** vía `\\localhost\<NombreImpresora>` (técnica estándar de impresión RAW en Windows — bypassa el procesamiento de texto/GDI, entrega los bytes tal cual).

Alternativas descartadas:
- **`node-printer` (addon nativo)**: requiere compilación (node-gyp); un `.node` compilado no empaqueta de forma confiable en un `.exe` con `pkg`, y el riesgo de que falle en la máquina del usuario (versión de Node/arquitectura distinta a la de build) es alto para alguien no técnico que no podría diagnosticarlo.
- **PowerShell `Out-Printer`**: pensado para texto plano, no para pasar bytes ESC/POS crudos sin que Windows los reinterprete/corrompa.

Consecuencia de este enfoque: **cero dependencias nativas** en el servicio — solo módulos built-in de Node (`http`, `fs`, `child_process`, `os`, `crypto`) — lo que hace el empaquetado con `pkg` trivial y confiable.

## Arquitectura

### Estructura de archivos

```
print-bridge/
├── src/
│   ├── servidor.ts        # Servidor HTTP (http nativo), enrutamiento, CORS
│   ├── autenticacion.ts   # Verificación de X-Bridge-Token (función pura)
│   ├── comandoImpresion.ts # Construye el comando de impresión (función pura, testeable)
│   └── imprimir.ts        # Ejecuta el comando contra la impresora real (I/O, sin test)
├── config.example.env     # Plantilla: PRINT_BRIDGE_TOKEN, WINDOWS_PRINTER_NAME, PUERTO
├── package.json
├── tsconfig.json
└── tests/
    ├── autenticacion.test.ts
    └── comandoImpresion.test.ts
```

Config real vive en `print-bridge/.env` (no versionado, igual que `.env.local` en la app principal), leído por el `.exe` desde su propia carpeta al arrancar.

### Flujo de una petición

1. `POST /print` con body `{ printer: string, escpos_base64: string }` y header `X-Bridge-Token`.
2. **CORS primero** (mismo motivo que el fix de `login-pin` este mismo día: el navegador de la Cajera llama a un origen distinto — `http://192.168.x.x:7070` — así que hay preflight `OPTIONS` por el header custom `X-Bridge-Token`). Responde `Access-Control-Allow-Origin: *` (servicio solo alcanzable desde la LAN del local, mismo criterio ya aplicado a `login-pin`) y maneja `OPTIONS` con `204`.
3. `autenticacion.ts`: compara `X-Bridge-Token` contra `PRINT_BRIDGE_TOKEN` del `.env`. Si no coincide → `401`.
4. Valida body (`printer` no vacío, `escpos_base64` es base64 válido) → si no, `400`.
5. `comandoImpresion.ts` (pura): decodifica el base64 a un `Buffer`, arma la ruta de un archivo temporal (`os.tmpdir()`) y el comando `copy /b "<tmp>" "\\localhost\<WINDOWS_PRINTER_NAME>"`. El `printer` del body identifica lógicamente la impresora (hoy solo existe `"caja-01"`, coincide con el valor ya hardcodeado en `clienteBridge.ts`); el nombre real de Windows sale de `WINDOWS_PRINTER_NAME` en el `.env`, no del body — así el usuario ajusta el nombre real sin tocar código si cambia de impresora.
6. `imprimir.ts` (I/O): escribe el buffer al archivo temporal, ejecuta el comando (`child_process.exec`), borra el archivo temporal, y responde `200 { ok: true }` o `500 { ok: false, error }` según el resultado.

### Sin cola en disco ni reintentos en el bridge

La app ya absorbe el fallo a su nivel: `impresiones.exito = false` queda registrado y hay reintento manual (`prepararReintentoImpresion`). Un print-bridge que intenta una vez y responde éxito/error es suficiente y más simple — evita construir una cola SQLite (mencionada como aspiración en CLAUDE.md §10.1) que hoy no resuelve un problema real. Si en el futuro hace falta (ej. impresora frecuentemente apagada), se agrega como iteración separada.

### Endpoints

- `POST /print` — el descrito arriba.
- `GET /salud` — responde `200 { ok: true }` sin auth, para que el usuario (o quien lo ayude a diagnosticar) confirme desde el navegador que el servicio está corriendo, sin necesitar herramientas técnicas.

### Empaquetado

`pkg` (evaluar `@yao-pkg/pkg` si el paquete original está sin mantenimiento activo al momento de implementar) genera `print-bridge.exe` para Windows x64 desde `src/servidor.ts` ya compilado. El `.env` se lee de la carpeta donde vive el `.exe` (no embebido en el binario), para que el usuario pueda editar el nombre de su impresora sin recompilar nada.

Arranque automático al encender el PC: fuera de alcance de esta iteración — el usuario puede crear manualmente un acceso directo en `shell:startup` de Windows si lo quiere. Se documenta el paso en el README del servicio, no se automatiza.

## Testing

- `autenticacion.ts` y `comandoImpresion.ts` son funciones puras → TDD normal (vitest, igual que el resto del proyecto): token correcto/incorrecto/ausente; base64 válido/inválido; construcción del comando con distintos nombres de impresora (incluye caracteres que necesiten escape en la ruta UNC).
- `imprimir.ts` y `servidor.ts` (I/O real: filesystem, proceso hijo, socket HTTP) sin test automatizado — mismo criterio ya establecido en el proyecto para wrappers de red/hardware (`hacerPing`, `enviarAlPrintBridge` original, `lib/offline/db.ts`). Se verifica manualmente contra una impresora real al finalizar.

## Fuera de alcance

- Integración con `sedes.impresoras` (CLAUDE.md §10.3, UI de Admin para registrar impresoras) — no existe esa tabla/UI todavía; hoy hay una sola Cajera con una sola impresora, y el nombre vive en el `.env` del bridge. Se revisita si el negocio crece a más sedes/impresoras.
- Soporte para impresoras de red (TCP:9100) — el diseño original de CLAUDE.md §10.1 queda reemplazado por este documento para el caso real (USB). Si en el futuro hay una sede con impresora de red, se vuelve a evaluar como su propia iteración.
- Instalador/registro como servicio de Windows — el usuario abre el `.exe` manualmente (o vía acceso directo en inicio de sesión); no se construye un instalador ni un Windows Service.
