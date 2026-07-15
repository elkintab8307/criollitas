import Dexie, { type Table } from "dexie";

/** Una operación (abrir turno, cobrar, etc.) pendiente de subir a Supabase.
 *  El contenido real de `tipo`/`payload` lo definen los bloques que
 *  encolan operaciones (J3/J4) -- aquí solo vive el esquema de la tabla. */
export interface OperacionCola {
  id?: number;
  tipo: string;
  payload: Record<string, unknown>;
  creadaEn: string;
  sincronizada: boolean;
}

/** Copia local de un recurso de solo lectura (productos, categorías,
 *  modificadores, mesas) para operar sin conexión. `clave` identifica qué
 *  recurso es (ej. "productos", "mesas"); el refresco real es trabajo de
 *  un bloque posterior. */
export interface EntradaCatalogo {
  clave: string;
  datos: unknown;
  actualizadaEn: string;
}

/** Credencial local de Cajera o Admin para poder iniciar sesión sin
 *  conexión en este equipo. El cacheo real al iniciar sesión con internet
 *  es trabajo del Bloque J2. */
export interface IdentidadLocal {
  usuarioId: string;
  nombre: string;
  rol: "cajera" | "admin";
  sedeId: string;
  pinHash: string;
  refreshToken: string;
  actualizadaEn: string;
}

/** Última versión conocida de un reporte, para que Admin pueda revisarlo
 *  sin conexión. El uso real es trabajo del Bloque J5. */
export interface InformeCache {
  clave: string;
  datos: unknown;
  descargadoEn: string;
}

class BaseDatosOffline extends Dexie {
  colaSync!: Table<OperacionCola, number>;
  catalogoCache!: Table<EntradaCatalogo, string>;
  identidadLocal!: Table<IdentidadLocal, string>;
  informesCache!: Table<InformeCache, string>;

  constructor() {
    super("criollitas-offline");
    this.version(1).stores({
      colaSync: "++id, creadaEn, sincronizada",
      catalogoCache: "clave",
      identidadLocal: "usuarioId",
      informesCache: "clave",
    });
  }
}

/** Instancia única de la base de datos local (IndexedDB vía Dexie).
 *  Sin test unitario -- Dexie requiere IndexedDB real, no disponible en el
 *  entorno Node de vitest (mismo criterio que lib/reportes/exportar.ts). */
export const baseDatosOffline = new BaseDatosOffline();
