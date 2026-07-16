import { listarPendientes, marcarFallida, marcarSincronizada } from "@/lib/offline/cola";

export type ResultadoManejador = { ok: true } | { ok: false; mensaje: string };
export type ManejadorOperacion = (payload: Record<string, unknown>) => Promise<ResultadoManejador>;

export type AccionSync = { tipo: "sincronizada" } | { tipo: "fallida"; mensaje: string };

/** Núcleo puro: decide qué hacer con una operación después de intentarla
 *  (o de confirmar que no hay manejador registrado para su tipo) -- sin
 *  tocar IndexedDB, para poder testearlo sin dependencias. */
export function decidirAccionSync(
  manejadorExiste: boolean,
  resultado: ResultadoManejador | undefined,
): AccionSync {
  if (!manejadorExiste) {
    return { tipo: "fallida", mensaje: "No hay un manejador registrado para este tipo de operación." };
  }
  if (resultado?.ok) return { tipo: "sincronizada" };
  return { tipo: "fallida", mensaje: resultado?.ok === false ? resultado.mensaje : "Error desconocido." };
}

const manejadores = new Map<string, ManejadorOperacion>();

/** Registra la función que sabe reproducir un tipo de operación contra
 *  Supabase (ej. "abrir_turno" -> llamar al RPC correspondiente). La
 *  registran los bloques que encolan operaciones reales (J3b/J3c/J3d). */
export function registrarManejador(tipo: string, manejador: ManejadorOperacion): void {
  manejadores.set(tipo, manejador);
}

export interface ResultadoSincronizacion {
  sincronizadas: number;
  fallidas: number;
}

/** Orquestación: reproduce toda la cola pendiente, en orden, contra
 *  Supabase. Sin test unitario dedicado (requiere IndexedDB real) -- la
 *  lógica de decisión que importa vive en decidirAccionSync, ya testeada
 *  arriba. */
export async function sincronizarPendientes(): Promise<ResultadoSincronizacion> {
  const pendientes = await listarPendientes();
  let sincronizadas = 0;
  let fallidas = 0;
  for (const op of pendientes) {
    const manejador = manejadores.get(op.tipo);
    let resultado: ResultadoManejador | undefined;
    if (manejador) {
      try {
        resultado = await manejador(op.payload);
      } catch (error) {
        // Un manejador que lanza (en vez de retornar {ok:false}) no debe
        // abortar el resto de la cola -- cada operación pendiente merece
        // su propio intento (hallazgo del review final del Bloque J3a).
        resultado = { ok: false, mensaje: error instanceof Error ? error.message : "Error inesperado al sincronizar" };
      }
    }
    const accion = decidirAccionSync(!!manejador, resultado);
    if (accion.tipo === "sincronizada") {
      await marcarSincronizada(op.id!);
      sincronizadas++;
    } else {
      await marcarFallida(op.id!, accion.mensaje);
      fallidas++;
    }
  }
  return { sincronizadas, fallidas };
}
