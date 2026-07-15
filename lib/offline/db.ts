import Dexie, { type Table } from "dexie";

/** Una operación (abrir turno, cobrar, etc.) pendiente de subir a Supabase.
 *  El contenido real de `tipo`/`payload` lo definen los bloques que
 *  encolan operaciones (J3b/J3c/J3d) -- aquí solo vive el esquema de la
 *  tabla. `estado` distingue "todavía no se intentó" de "falló de verdad,
 *  necesita revisión" -- antes era un booleano que no podía representar
 *  esa diferencia. */
export interface OperacionCola {
  id?: number;
  tipo: string;
  payload: Record<string, unknown>;
  creadaEn: string;
  estado: "pendiente" | "sincronizada" | "fallida";
  errorMensaje?: string;
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

/** Marca de tiempo de un intento de PIN offline fallido, para reconstruir
 *  localmente el mismo límite de 5 intentos / 5 minutos que ya aplica el
 *  servidor (lib/auth/pin.ts) cuando hay conexión. */
export interface IntentoPin {
  id?: number;
  usuarioId: string;
  intentoEn: string;
}

/** Un ítem dentro de un pedido guardado localmente -- espejo simplificado
 *  de `pedido_items` (sin `id` propio, se referencian solo por posición
 *  en el arreglo; este proyecto no permite editar/quitar un ítem ya
 *  confirmado ni online ni offline, solo agregar más). */
export interface ItemPedidoLocal {
  productoId: string;
  nombre: string;
  cantidad: number;
  precioUnitCop: number;
  modificadores: { modificadorId: string; nombre: string; precioDeltaCop: number }[];
  nota: string | null;
}

/** Copia local completa de un pedido creado y/o modificado sin conexión
 *  -- no solo la intención de crearlo (eso vive en `colaSync`), sino su
 *  contenido real, para que las pantallas de detalle y cobro (Bloques
 *  J3e/J3f) puedan mostrarlo y seguir operando sobre él sin depender del
 *  servidor. `pedidoId` es el mismo identificador que se usará como `id`
 *  real en Supabase al sincronizar (ver crearPedidoConItems, Bloque J3d). */
export interface PedidoLocal {
  pedidoId: string;
  origen: { canal: "mesa"; mesaId: string } | { canal: "domicilio"; clienteId: string } | { canal: "llevar" };
  items: ItemPedidoLocal[];
  estado: "abierto" | "cobrado";
  sedeId: string;
  vendedoraId: string;
  creadoEn: string;
}

class BaseDatosOffline extends Dexie {
  colaSync!: Table<OperacionCola, number>;
  catalogoCache!: Table<EntradaCatalogo, string>;
  identidadLocal!: Table<IdentidadLocal, string>;
  informesCache!: Table<InformeCache, string>;
  intentosPin!: Table<IntentoPin, number>;
  pedidosLocales!: Table<PedidoLocal, string>;

  constructor() {
    super("criollitas-offline");
    this.version(1).stores({
      colaSync: "++id, creadaEn",
      catalogoCache: "clave",
      identidadLocal: "usuarioId",
      informesCache: "clave",
    });
    this.version(2).stores({
      intentosPin: "++id, usuarioId, intentoEn",
    });
    this.version(3).stores({
      pedidosLocales: "pedidoId",
    });
  }
}

/** Instancia única de la base de datos local (IndexedDB vía Dexie).
 *  Sin test unitario -- Dexie requiere IndexedDB real, no disponible en el
 *  entorno Node de vitest (mismo criterio que lib/reportes/exportar.ts). */
export const baseDatosOffline = new BaseDatosOffline();
