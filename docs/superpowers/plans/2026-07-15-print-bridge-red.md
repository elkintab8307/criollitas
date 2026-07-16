# Print-bridge (impresora de red) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir `print-bridge/`, el servicio Node.js local que recibe el POST del navegador de la Cajera (`enviarAlPrintBridgeDesdeNavegador`, ya existente y sin cambios) y entrega el ticket ESC/POS a la impresora térmica de red (IP propia en la LAN, puerto 9100) vía socket TCP.

**Architecture:** Servidor HTTP nativo (`node:http`, sin framework) con dos endpoints (`GET /salud`, `POST /print`). La impresión es un socket TCP directo (`node:net`) a `PRINTER_IP:PRINTER_PORT`: se escriben los bytes ESC/POS decodificados y se cierra la conexión. Se empaqueta como `print-bridge.exe` con `pkg` para que el usuario no necesite instalar Node.js.

**Tech Stack:** Node.js ≥20, TypeScript estricto (compilado a CommonJS, más compatible con `pkg`), vitest para unitarios, `pkg` para el empaquetado a `.exe`. Proyecto standalone (su propio `package.json`/lockfile, no es miembro del pnpm workspace de la raíz).

## Global Constraints

- TypeScript estricto: `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true` (CLAUDE.md §12). Nunca `any`.
- Nombres en español para el dominio (`paqueteImpresion`, `tokenValido`), inglés para infraestructura pura (`servidor`, `config`) — consistencia > pureza (CLAUDE.md §12).
- Package manager: `pnpm` (CLAUDE.md §3). Node ≥ 20 LTS.
- `vitest` para todo test unitario, mismo runner que el proyecto principal (CLAUDE.md §3).
- Commits Conventional Commits en español (CLAUDE.md §12).
- Cero dependencias externas para el envío del ticket (solo módulos built-in de Node) — condición explícita del spec para que el empaquetado con `pkg` sea confiable.
- Lógica pura lleva TDD; wrappers de I/O real (socket TCP, socket HTTP) no llevan test automatizado — mismo criterio ya establecido en el proyecto principal (`hacerPing`, etc.) — se verifican manualmente.
- Fuera de alcance (spec, sección "Fuera de alcance"): integración con `sedes.impresoras`, soporte de impresora USB, cola de reintentos en disco, instalador/registro como servicio de Windows.

---

### Task 1: Scaffolding del proyecto + autenticación por token

**Files:**
- Create: `print-bridge/package.json`
- Create: `print-bridge/tsconfig.json`
- Create: `print-bridge/vitest.config.ts`
- Create: `print-bridge/.gitignore`
- Create: `print-bridge/src/resultado.ts`
- Create: `print-bridge/src/autenticacion.ts`
- Test: `print-bridge/tests/autenticacion.test.ts`

**Interfaces:**
- Produces: `Resultado<T> = { ok: true; valor: T } | { ok: false; error: string }`, `ok<T>(valor: T): Resultado<T>`, `err<T>(error: string): Resultado<T>` (en `src/resultado.ts`) — usados por las Tasks 2-4.
- Produces: `tokenValido(headerToken: string | undefined, tokenEsperado: string): boolean` (en `src/autenticacion.ts`) — usado por Task 4 (`servidor.ts`).

- [ ] **Step 1: Crear `print-bridge/package.json`**

```json
{
  "name": "print-bridge",
  "version": "0.1.0",
  "private": true,
  "description": "Servicio local que recibe tickets ESC/POS desde Criollitas OS y los imprime en la impresora térmica de red del local.",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "test": "vitest run",
    "package": "pnpm build && pkg dist/index.js --targets node18-win-x64 --output print-bridge.exe"
  },
  "devDependencies": {
    "@types/node": "^20",
    "pkg": "^5.8.1",
    "tsx": "^4.19.2",
    "typescript": "^5",
    "vitest": "^4.1.10"
  }
}
```

- [ ] **Step 2: Crear `print-bridge/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": false,
    "sourceMap": false
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Crear `print-bridge/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Crear `print-bridge/.gitignore`**

El `.gitignore` de la raíz del repo ignora `.env*` a cualquier profundidad, pero `/node_modules` solo en la raíz (con `/` inicial) — `print-bridge/node_modules` necesita su propia entrada.

```
node_modules/
dist/
*.exe
.env
```

- [ ] **Step 5: Instalar dependencias**

Run: `cd print-bridge && pnpm install`
Expected: Se crea `print-bridge/node_modules/` y `print-bridge/pnpm-lock.yaml` sin errores.

- [ ] **Step 6: Crear `print-bridge/src/resultado.ts`**

Sin test — son constructores triviales sin lógica que verificar (mismo criterio que un type helper).

```typescript
export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string };

export function ok<T>(valor: T): Resultado<T> {
  return { ok: true, valor };
}

export function err<T>(error: string): Resultado<T> {
  return { ok: false, error };
}
```

- [ ] **Step 7: Escribir el test que falla para `tokenValido`**

Create `print-bridge/tests/autenticacion.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { tokenValido } from "../src/autenticacion";

describe("tokenValido", () => {
  it("acepta cuando el token coincide exactamente", () => {
    expect(tokenValido("abc123", "abc123")).toBe(true);
  });

  it("rechaza cuando el token no coincide", () => {
    expect(tokenValido("otro-token", "abc123")).toBe(false);
  });

  it("rechaza cuando no se envía token (undefined)", () => {
    expect(tokenValido(undefined, "abc123")).toBe(false);
  });

  it("rechaza un token vacío aunque el esperado también esté vacío (config incompleta)", () => {
    expect(tokenValido("", "")).toBe(false);
  });
});
```

- [ ] **Step 8: Correr el test y verificar que falla**

Run: `cd print-bridge && pnpm test`
Expected: FAIL — `Cannot find module '../src/autenticacion'` (el archivo todavía no existe).

- [ ] **Step 9: Implementar `print-bridge/src/autenticacion.ts`**

```typescript
/** Compara el header X-Bridge-Token contra el token configurado
 *  (PRINT_BRIDGE_TOKEN en .env). Un header ausente o vacío siempre se
 *  rechaza, incluso si el token esperado también está vacío -- eso indica
 *  una configuración incompleta, nunca una autorización válida. */
export function tokenValido(headerToken: string | undefined, tokenEsperado: string): boolean {
  return typeof headerToken === "string" && headerToken.length > 0 && headerToken === tokenEsperado;
}
```

- [ ] **Step 10: Correr el test y verificar que pasa**

Run: `cd print-bridge && pnpm test`
Expected: PASS — 4 tests verdes.

- [ ] **Step 11: Commit**

```bash
git add print-bridge/package.json print-bridge/tsconfig.json print-bridge/vitest.config.ts print-bridge/.gitignore print-bridge/src/resultado.ts print-bridge/src/autenticacion.ts print-bridge/tests/autenticacion.test.ts
git commit -m "feat: scaffolding de print-bridge y autenticacion por token"
```

---

### Task 2: Paquete de impresión (lógica pura)

**Files:**
- Create: `print-bridge/src/paqueteImpresion.ts`
- Test: `print-bridge/tests/paqueteImpresion.test.ts`

**Interfaces:**
- Consumes: `Resultado<T>`, `ok`, `err` de `src/resultado.ts` (Task 1).
- Produces: `interface PaqueteImpresion { ip: string; puerto: number; bytes: Buffer }` y `construirPaqueteImpresion(escposBase64: string, ip: string, puerto: number): Resultado<PaqueteImpresion>` (en `src/paqueteImpresion.ts`) — usado por Task 4 (`servidor.ts`, `imprimir.ts`).

- [ ] **Step 1: Escribir los tests que fallan**

Create `print-bridge/tests/paqueteImpresion.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { construirPaqueteImpresion } from "../src/paqueteImpresion";

const BASE64_HOLA = "aG9sYQ=="; // Buffer.from("hola").toString("base64")

describe("construirPaqueteImpresion", () => {
  it("arma el paquete con ip, puerto y los bytes decodificados", () => {
    const resultado = construirPaqueteImpresion(BASE64_HOLA, "192.168.1.50", 9100);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.valor.ip).toBe("192.168.1.50");
    expect(resultado.valor.puerto).toBe(9100);
    expect(resultado.valor.bytes.toString()).toBe("hola");
  });

  it("rechaza base64 inválido", () => {
    const resultado = construirPaqueteImpresion("esto no es base64 !!", "192.168.1.50", 9100);
    expect(resultado.ok).toBe(false);
  });

  it("rechaza contenido vacío", () => {
    const resultado = construirPaqueteImpresion("", "192.168.1.50", 9100);
    expect(resultado.ok).toBe(false);
  });

  it("rechaza cuando falta la IP", () => {
    const resultado = construirPaqueteImpresion(BASE64_HOLA, "", 9100);
    expect(resultado.ok).toBe(false);
  });

  it("rechaza un puerto fuera de rango", () => {
    const resultado = construirPaqueteImpresion(BASE64_HOLA, "192.168.1.50", 0);
    expect(resultado.ok).toBe(false);
  });

  it("rechaza un puerto no entero", () => {
    const resultado = construirPaqueteImpresion(BASE64_HOLA, "192.168.1.50", 9100.5);
    expect(resultado.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd print-bridge && pnpm test`
Expected: FAIL — `Cannot find module '../src/paqueteImpresion'`.

- [ ] **Step 3: Implementar `print-bridge/src/paqueteImpresion.ts`**

```typescript
import { err, ok, type Resultado } from "./resultado";

export interface PaqueteImpresion {
  ip: string;
  puerto: number;
  bytes: Buffer;
}

const BASE64_VALIDO = /^[A-Za-z0-9+/]+={0,2}$/;

function esBase64Valido(valor: string): boolean {
  return valor.length > 0 && valor.length % 4 === 0 && BASE64_VALIDO.test(valor);
}

function esPuertoValido(puerto: number): boolean {
  return Number.isInteger(puerto) && puerto > 0 && puerto <= 65535;
}

/** Decodifica el ticket y valida el destino antes de que imprimir.ts
 *  (Task 4) abra el socket TCP real. Pura: no toca la red, solo decide
 *  si hay algo válido que enviar y a dónde (ver
 *  docs/superpowers/specs/2026-07-15-print-bridge-red-design.md). */
export function construirPaqueteImpresion(
  escposBase64: string,
  ip: string,
  puerto: number,
): Resultado<PaqueteImpresion> {
  if (!ip.trim()) {
    return err("Falta configurar la IP de la impresora (PRINTER_IP en .env)");
  }
  if (!esPuertoValido(puerto)) {
    return err("El puerto de la impresora no es válido (PRINTER_PORT en .env)");
  }
  if (!esBase64Valido(escposBase64)) {
    return err("El contenido del ticket no es base64 válido");
  }
  const bytes = Buffer.from(escposBase64, "base64");
  return ok({ ip, puerto, bytes });
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `cd print-bridge && pnpm test`
Expected: PASS — 10 tests verdes en total (4 de Task 1 + 6 de este).

- [ ] **Step 5: Commit**

```bash
git add print-bridge/src/paqueteImpresion.ts print-bridge/tests/paqueteImpresion.test.ts
git commit -m "feat: validar y armar el paquete de impresion para la impresora de red"
```

---

### Task 3: Configuración desde `.env`

**Files:**
- Create: `print-bridge/src/config.ts`
- Create: `print-bridge/config.example.env`
- Test: `print-bridge/tests/config.test.ts`

**Interfaces:**
- Produces: `interface Config { token: string; printerIp: string; printerPuerto: number; puerto: number }`, `parsearEnv(contenido: string): Record<string, string>` (pura, testeada), `cargarConfig(directorioBase: string): Config` (I/O, lee `.env` del disco, no testeada) — en `src/config.ts`, usado por Task 4 (`index.ts`).

- [ ] **Step 1: Escribir los tests que fallan**

Create `print-bridge/tests/config.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { parsearEnv } from "../src/config";

describe("parsearEnv", () => {
  it("lee pares CLAVE=valor", () => {
    const resultado = parsearEnv("PRINT_BRIDGE_TOKEN=abc123\nPRINTER_IP=192.168.1.50\n");
    expect(resultado).toEqual({ PRINT_BRIDGE_TOKEN: "abc123", PRINTER_IP: "192.168.1.50" });
  });

  it("ignora líneas vacías y comentarios", () => {
    const resultado = parsearEnv("# comentario\n\nPUERTO=7070\n");
    expect(resultado).toEqual({ PUERTO: "7070" });
  });

  it("recorta espacios alrededor de clave y valor", () => {
    const resultado = parsearEnv("  PUERTO = 7070  \n");
    expect(resultado).toEqual({ PUERTO: "7070" });
  });

  it("conserva el signo = dentro del valor (solo el primero separa clave de valor)", () => {
    const resultado = parsearEnv("PRINTER_IP=192.168.1.50=x\n");
    expect(resultado).toEqual({ PRINTER_IP: "192.168.1.50=x" });
  });

  it("retorna vacío para contenido vacío", () => {
    expect(parsearEnv("")).toEqual({});
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd print-bridge && pnpm test`
Expected: FAIL — `Cannot find module '../src/config'`.

- [ ] **Step 3: Implementar `print-bridge/src/config.ts`**

```typescript
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Config {
  token: string;
  printerIp: string;
  printerPuerto: number;
  puerto: number;
}

/** Parsea un archivo .env simple (CLAVE=valor por línea; líneas vacías o
 *  que empiezan con # se ignoran). Sin comillas ni interpolación -- basta
 *  para las variables que usa este servicio. Pura y testeada aparte de
 *  `cargarConfig` para no depender del filesystem en el test. */
export function parsearEnv(contenido: string): Record<string, string> {
  return Object.fromEntries(
    contenido
      .split("\n")
      .map((linea) => linea.trim())
      .filter((linea) => linea.length > 0 && !linea.startsWith("#") && linea.includes("="))
      .map((linea) => {
        const indice = linea.indexOf("=");
        return [linea.slice(0, indice).trim(), linea.slice(indice + 1).trim()];
      }),
  );
}

/** Lee `.env` desde `directorioBase` (la carpeta donde vive el .exe, o
 *  la raíz del proyecto en desarrollo -- ver index.ts). I/O real, sin
 *  test automatizado (mismo criterio que el resto del proyecto). */
export function cargarConfig(directorioBase: string): Config {
  const rutaEnv = join(directorioBase, ".env");
  const variables = existsSync(rutaEnv) ? parsearEnv(readFileSync(rutaEnv, "utf-8")) : {};
  return {
    token: variables.PRINT_BRIDGE_TOKEN ?? "",
    printerIp: variables.PRINTER_IP ?? "",
    printerPuerto: Number(variables.PRINTER_PORT ?? "9100"),
    puerto: Number(variables.PUERTO ?? "7070"),
  };
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `cd print-bridge && pnpm test`
Expected: PASS — 15 tests verdes en total.

- [ ] **Step 5: Crear `print-bridge/config.example.env`**

```
PRINT_BRIDGE_TOKEN=cambia-esto-por-un-valor-secreto
PRINTER_IP=192.168.1.50
PRINTER_PORT=9100
PUERTO=7070
```

- [ ] **Step 6: Commit**

```bash
git add print-bridge/src/config.ts print-bridge/config.example.env print-bridge/tests/config.test.ts
git commit -m "feat: cargar configuracion de print-bridge desde .env"
```

---

### Task 4: Servidor HTTP, impresión real por TCP y punto de entrada

**Files:**
- Create: `print-bridge/src/imprimir.ts`
- Create: `print-bridge/src/servidor.ts`
- Create: `print-bridge/src/index.ts`

**Interfaces:**
- Consumes: `tokenValido` (Task 1), `construirPaqueteImpresion`, `PaqueteImpresion` (Task 2), `cargarConfig`, `Config` (Task 3), `ok`, `err`, `Resultado` (Task 1).
- Produces: `ejecutarImpresion(paquete: PaqueteImpresion): Promise<Resultado<null>>` (`src/imprimir.ts`); `crearServidor(config: { token: string; printerIp: string; printerPuerto: number }): http.Server` (`src/servidor.ts`) — usado por `index.ts` y por la verificación manual de este task.

Sin test automatizado (I/O real: socket TCP, socket HTTP) — mismo criterio ya aplicado en el proyecto principal. Se verifica manualmente con `curl` (y un listener TCP de prueba) al final del task.

- [ ] **Step 1: Implementar `print-bridge/src/imprimir.ts`**

```typescript
import { connect } from "node:net";
import { err, ok, type Resultado } from "./resultado";
import type { PaqueteImpresion } from "./paqueteImpresion";

const TIMEOUT_MS = 5000;

/** Abre un socket TCP a la impresora, escribe los bytes ESC/POS y cierra
 *  la conexión (protocolo "raw"/JetDirect, puerto 9100 típico) -- la
 *  impresora imprime todo lo recibido hasta el cierre. Resuelve una sola
 *  vez sin importar qué evento dispare primero (close/error/timeout). */
export async function ejecutarImpresion(paquete: PaqueteImpresion): Promise<Resultado<null>> {
  return new Promise((resolve) => {
    let resuelto = false;
    function resolverUnaVez(resultado: Resultado<null>) {
      if (resuelto) return;
      resuelto = true;
      resolve(resultado);
    }

    const socket = connect({ host: paquete.ip, port: paquete.puerto, timeout: TIMEOUT_MS });

    socket.on("connect", () => {
      socket.end(paquete.bytes);
    });
    socket.on("close", () => resolverUnaVez(ok(null)));
    socket.on("timeout", () => {
      socket.destroy();
      resolverUnaVez(err("Tiempo de espera agotado conectando a la impresora"));
    });
    socket.on("error", (error) => {
      resolverUnaVez(err(error.message));
    });
  });
}
```

- [ ] **Step 2: Implementar `print-bridge/src/servidor.ts`**

```typescript
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { tokenValido } from "./autenticacion";
import { construirPaqueteImpresion } from "./paqueteImpresion";
import { ejecutarImpresion } from "./imprimir";

const CABECERAS_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-bridge-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface ConfigServidor {
  token: string;
  printerIp: string;
  printerPuerto: number;
}

function responderJson(res: ServerResponse, status: number, cuerpo: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json", ...CABECERAS_CORS });
  res.end(JSON.stringify(cuerpo));
}

async function leerCuerpo(req: IncomingMessage): Promise<string> {
  const trozos: Buffer[] = [];
  for await (const trozo of req) trozos.push(trozo as Buffer);
  return Buffer.concat(trozos).toString("utf-8");
}

interface CuerpoImprimir {
  printer?: unknown;
  escpos_base64?: unknown;
}

/** Servidor HTTP del print-bridge: CORS abierto (solo alcanzable desde la
 *  LAN del local -- mismo criterio que login-pin, CLAUDE.md §10.2), token
 *  compartido en X-Bridge-Token, y un único camino de impresión real vía
 *  paqueteImpresion.ts + imprimir.ts (socket TCP a la impresora de red).
 *  Sin test automatizado (servidor HTTP real) -- se verifica manualmente
 *  con curl. */
export function crearServidor(config: ConfigServidor): Server {
  return createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CABECERAS_CORS);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/salud") {
      responderJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && req.url === "/print") {
      if (!tokenValido(req.headers["x-bridge-token"] as string | undefined, config.token)) {
        responderJson(res, 401, { ok: false, error: "Token inválido" });
        return;
      }

      let cuerpo: CuerpoImprimir;
      try {
        cuerpo = JSON.parse(await leerCuerpo(req)) as CuerpoImprimir;
      } catch {
        responderJson(res, 400, { ok: false, error: "Cuerpo inválido" });
        return;
      }
      if (typeof cuerpo.escpos_base64 !== "string" || typeof cuerpo.printer !== "string" || !cuerpo.printer) {
        responderJson(res, 400, { ok: false, error: "Faltan campos" });
        return;
      }

      const paqueteResultado = construirPaqueteImpresion(cuerpo.escpos_base64, config.printerIp, config.printerPuerto);
      if (!paqueteResultado.ok) {
        responderJson(res, 400, { ok: false, error: paqueteResultado.error });
        return;
      }

      const resultadoImpresion = await ejecutarImpresion(paqueteResultado.valor);
      if (!resultadoImpresion.ok) {
        responderJson(res, 500, { ok: false, error: resultadoImpresion.error });
        return;
      }

      responderJson(res, 200, { ok: true });
      return;
    }

    responderJson(res, 404, { ok: false, error: "No encontrado" });
  });
}
```

- [ ] **Step 3: Implementar `print-bridge/src/index.ts`**

```typescript
import { dirname, join } from "node:path";
import { cargarConfig } from "./config";
import { crearServidor } from "./servidor";

// pkg inyecta `process.pkg` cuando el código corre empaquetado como .exe;
// ahí __dirname apunta al snapshot virtual de solo lectura del binario,
// no a la carpeta real donde vive el .exe -- por eso el .env se busca
// junto a process.execPath en ese caso (ver spec: ".env se lee de la
// carpeta donde vive el .exe, no embebido").
const empaquetado = "pkg" in process;
const directorioBase = empaquetado ? dirname(process.execPath) : join(__dirname, "..");

const config = cargarConfig(directorioBase);

if (!config.token) {
  console.error("Falta PRINT_BRIDGE_TOKEN en el archivo .env. Revisa config.example.env.");
  process.exit(1);
}
if (!config.printerIp) {
  console.error("Falta PRINTER_IP en el archivo .env. Revisa config.example.env.");
  process.exit(1);
}

const servidor = crearServidor(config);
servidor.listen(config.puerto, () => {
  console.log(`print-bridge escuchando en http://localhost:${config.puerto}`);
  console.log(`Imprimiendo en: ${config.printerIp}:${config.printerPuerto}`);
});
```

- [ ] **Step 4: Verificar que el proyecto compila**

Run: `cd print-bridge && pnpm build`
Expected: Termina sin errores, se crea `print-bridge/dist/index.js` (y el resto de `dist/*.js`).

- [ ] **Step 5: Verificación manual con `curl` (con o sin impresora real)**

Crear un `.env` de prueba:

```bash
cd print-bridge
cp config.example.env .env
```

Editar `.env`: `PRINT_BRIDGE_TOKEN=token-de-prueba`. Si no hay una impresora real disponible en este momento, dejar `PRINTER_IP=192.168.1.50` (o cualquier IP) — las primeras verificaciones no dependen de que responda.

Levantar el servidor:

Run: `pnpm dev` (déjalo corriendo, abre otra terminal para las siguientes verificaciones)

Verificar salud:
Run: `curl -s http://localhost:7070/salud`
Expected: `{"ok":true}`

Verificar CORS preflight:
Run: `curl -s -i -X OPTIONS http://localhost:7070/print`
Expected: `204`, con headers `Access-Control-Allow-Origin: *` y `Access-Control-Allow-Headers` incluyendo `x-bridge-token`.

Verificar rechazo sin token:
Run: `curl -s -X POST http://localhost:7070/print -H "Content-Type: application/json" -d "{\"printer\":\"caja-01\",\"escpos_base64\":\"aG9sYQ==\"}"`
Expected: `{"ok":false,"error":"Token inválido"}` con status `401`.

Verificar token correcto pero body incompleto:
Run: `curl -s -X POST http://localhost:7070/print -H "Content-Type: application/json" -H "X-Bridge-Token: token-de-prueba" -d "{\"printer\":\"caja-01\"}"`
Expected: `{"ok":false,"error":"Faltan campos"}` con status `400`.

Verificar el camino completo contra un listener TCP de prueba (si no hay impresora real a mano): en una terminal aparte, levantar un servidor TCP simple que solo confirme que llegaron bytes:

Run: `node -e "require('net').createServer(s => { let n=0; s.on('data', d => n+=d.length); s.on('end', () => { console.log('recibidos', n, 'bytes'); s.end(); }); }).listen(9100, () => console.log('listener TCP de prueba en :9100'))"`

Ajustar `.env` para que `PRINTER_IP=127.0.0.1` y `PRINTER_PORT=9100`, reiniciar `pnpm dev`, y:

Run: `curl -s -i -X POST http://localhost:7070/print -H "Content-Type: application/json" -H "X-Bridge-Token: token-de-prueba" -d "{\"printer\":\"caja-01\",\"escpos_base64\":\"aG9sYQ==\"}"`
Expected: status `200`, `{"ok":true}`; la terminal del listener TCP debe mostrar `recibidos 4 bytes` (el contenido de "hola" decodificado).

Detener ambos procesos (`Ctrl+C`) y borrar el `.env` de prueba si no corresponde a la config real: `rm .env` (o dejarlo si ya es la config real del local, apuntando a la impresora verdadera).

- [ ] **Step 6: Commit**

```bash
git add print-bridge/src/imprimir.ts print-bridge/src/servidor.ts print-bridge/src/index.ts
git commit -m "feat: servidor HTTP de print-bridge con impresion TCP a impresora de red"
```

---

### Task 5: Empaquetado a .exe, README y actualizar CLAUDE.md

**Files:**
- Create: `print-bridge/README.md`
- Modify: `CLAUDE.md:5` (estructura de carpetas, sección 5)
- Modify: `CLAUDE.md:10.1-10.3` (arquitectura de impresión)

**Interfaces:**
- Consumes: el script `package` de `print-bridge/package.json` (Task 1).
- No produce interfaces nuevas — task de documentación y empaquetado.

- [ ] **Step 1: Generar el ejecutable**

Run: `cd print-bridge && pnpm package`
Expected: Se genera `print-bridge/print-bridge.exe`. Si `pkg` falla por falta de mantenimiento del paquete (error de resolución de binarios base para el target), reintentar con el fork mantenido:

```bash
cd print-bridge
pnpm remove pkg
pnpm add -D @yao-pkg/pkg
```

Y cambiar el script `package` en `package.json` de `pkg dist/index.js ...` a `@yao-pkg/pkg dist/index.js --targets node18-win-x64 --output print-bridge.exe`, luego repetir `pnpm package`.

- [ ] **Step 2: Verificar el ejecutable generado**

Con el `.env` real (o el de prueba de la Task 4) en la misma carpeta que `print-bridge.exe`:

Run: `./print-bridge.exe` (déjalo corriendo)
Run (otra terminal): `curl -s http://localhost:7070/salud`
Expected: `{"ok":true}` — confirma que el `.exe` arranca, lee `.env` desde su propia carpeta (no desde el snapshot embebido) y escucha correctamente.

Detener con `Ctrl+C`.

- [ ] **Step 3: Crear `print-bridge/README.md`**

```markdown
# print-bridge

Servicio local que recibe tickets desde Criollitas OS y los envía a la impresora térmica de red del local. Corre en el PC de caja, no en la nube — ver `docs/superpowers/specs/2026-07-15-print-bridge-red-design.md` para el diseño completo.

## Uso en el PC de caja (sin instalar nada técnico)

1. Copia `print-bridge.exe` y `config.example.env` a una carpeta en el PC de caja.
2. Renombra `config.example.env` a `.env` y edítalo con Bloc de notas:
   - `PRINT_BRIDGE_TOKEN`: cualquier texto secreto, debe ser igual al que se configure en `NEXT_PUBLIC_PRINT_BRIDGE_TOKEN` de la app.
   - `PRINTER_IP`: la IP de la impresora en la red del local (fija o reservada en el router, para que no cambie).
   - `PRINTER_PORT`: `9100` salvo que el manual de la impresora diga otro.
   - `PUERTO`: déjalo en `7070` salvo que ya esté ocupado por otra cosa.
3. Doble clic en `print-bridge.exe`. Debe mostrar "print-bridge escuchando en http://localhost:7070".
4. Para probar que funciona, abre esa misma dirección (`http://localhost:7070/salud`) en el navegador del PC de caja — debe mostrar `{"ok":true}`.

**Para que arranque solo al encender el PC** (opcional): crea un acceso directo a `print-bridge.exe` y ponlo en la carpeta de inicio de Windows (`Win+R`, escribe `shell:startup`, Enter, pega el acceso directo ahí).

## Desarrollo

```bash
pnpm install
cp config.example.env .env   # y edítalo
pnpm dev                     # corre con recarga automática
pnpm test                    # unitarios
pnpm build                   # compila a dist/
pnpm package                 # genera print-bridge.exe
```
```

- [ ] **Step 4: Actualizar CLAUDE.md §5 (estructura de carpetas)**

En `CLAUDE.md`, la sección 5 ya lista `print-bridge/` con `src/` y `package.json`. Verificar que siga siendo consistente (ya lo es, no hace falta editar contenido salvo que la estructura real difiera — en ese caso, ajustar los nombres de archivo listados a `servidor.ts`, `autenticacion.ts`, `paqueteImpresion.ts`, `imprimir.ts`, `config.ts`, `resultado.ts`, `index.ts`).

- [ ] **Step 5: Actualizar CLAUDE.md §10.1 (arquitectura de print-bridge)**

Buscar el texto actual de §10.1 sobre "Internamente abre un socket TCP contra la IP de la impresora térmica (puerto 9100 típico) y escribe los bytes. Reintentos con backoff. Cola en disco (SQLite) para no perder tickets si la impresora está offline." y reemplazarlo por:

```
Internamente, al recibir `POST /print`, abre un socket TCP contra `PRINTER_IP:PRINTER_PORT` (puerto 9100 típico, protocolo raw/JetDirect) y escribe los bytes ESC/POS decodificados -- la IP de la impresora vive en `print-bridge/.env`, no en el body de la petición. Sin cola en disco ni reintentos propios: la app ya absorbe un fallo de impresión a su nivel (`impresiones.exito = false`, reintento manual). Se distribuye como `print-bridge.exe` empaquetado con `pkg` -- el usuario no necesita instalar Node.js. Ver `docs/superpowers/specs/2026-07-15-print-bridge-red-design.md` para el diseño completo y `print-bridge/README.md` para la puesta en marcha.
```

- [ ] **Step 6: Actualizar CLAUDE.md §10.3 (Configuración)**

Reemplazar el párrafo actual (que describe `sedes.impresoras` con IP/ancho/copias como si ya existiera) por una nota que aclare el estado real:

```
### 10.3 Configuración

Hoy la configuración de la impresora vive en `print-bridge/.env` (`PRINTER_IP`, `PRINTER_PORT`, un solo valor -- una Cajera, una impresora). La tabla `sedes.impresoras` mencionada en versiones previas de este documento como UI de Admin para registrar impresoras por IP/ancho/copias **no existe todavía** -- se construye si el negocio crece a más sedes o impresoras (fuera de alcance del diseño actual, ver `docs/superpowers/specs/2026-07-15-print-bridge-red-design.md`).
```

- [ ] **Step 7: Commit**

```bash
git add print-bridge/README.md CLAUDE.md
git commit -m "docs: documentar print-bridge (README, empaquetado) y actualizar CLAUDE.md"
```

**Nota:** `print-bridge.exe` no se versiona (ya está en `print-bridge/.gitignore` de la Task 1) — si el usuario prefiere distribuirlo de otra forma (ej. como release adjunto en GitHub), ese paso queda fuera de este plan.

---

## Verificación final del branch completo

```bash
cd print-bridge && pnpm test && pnpm build
cd .. && pnpm lint && pnpm test && pnpm build
```

Expected: todo verde, sin afectar los 183 tests existentes del proyecto principal (print-bridge es un proyecto separado, no debería tocar nada de la app Next.js).
