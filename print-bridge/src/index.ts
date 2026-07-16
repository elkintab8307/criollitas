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
