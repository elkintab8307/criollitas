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
