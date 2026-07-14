import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const JWKS_URL = () => new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/.well-known/jwks.json`);

type ModoVerificacion = "jwks" | "hs256" | "sin_configurar";

type CacheGlobal = {
  modoDetectado: ModoVerificacion | null;
  jwks: ReturnType<typeof createRemoteJWKSet> | null;
};

// Igual que en lib/conectividad/estado.ts: se guarda en globalThis porque
// Next.js empaqueta middleware.ts, instrumentation.ts y las Server Actions
// en grafos de módulos separados — una variable de módulo "normal" aquí
// terminaría duplicada (cada bundle con su propia caché nunca compartida),
// y el punto entero de precalentar la detección desde el healthcheck es
// que middleware.ts vea el resultado ya cacheado sin tener que golpear la
// red él mismo estando offline.
const KEY = Symbol.for("criollitas.auth.jwtLocal");

function cache(): CacheGlobal {
  const global = globalThis as unknown as Record<symbol, CacheGlobal>;
  if (!global[KEY]) {
    global[KEY] = { modoDetectado: null, jwks: null };
  }
  return global[KEY];
}

/**
 * Detecta una sola vez (por proceso) si el proyecto de Supabase usa llaves
 * asimétricas (JWKS) o el esquema legado HS256 con secreto compartido.
 * Pensado para llamarse mientras hay red (arranque del servidor, o tras un
 * healthcheck exitoso) — si se llama estando offline y aún no hay modo
 * detectado, simplemente no logra determinarlo todavía y se reintenta en
 * la próxima oportunidad con red.
 */
export async function detectarModoVerificacion(): Promise<ModoVerificacion> {
  const c = cache();
  if (c.modoDetectado === "jwks" || c.modoDetectado === "hs256") return c.modoDetectado;

  try {
    const respuesta = await fetch(JWKS_URL(), { signal: AbortSignal.timeout(3_000) });
    if (respuesta.ok) {
      const cuerpo = (await respuesta.json()) as { keys?: unknown[] };
      if (Array.isArray(cuerpo.keys) && cuerpo.keys.length > 0) {
        c.jwks = createRemoteJWKSet(JWKS_URL(), { cooldownDuration: 30_000, timeoutDuration: 3_000 });
        c.modoDetectado = "jwks";
        return c.modoDetectado;
      }
    }
  } catch {
    // Sin red todavía: no se puede decidir. Se reintenta en la próxima
    // llamada (arranque del servidor o próximo healthcheck exitoso).
  }

  if (process.env.SUPABASE_JWT_SECRET) {
    c.modoDetectado = "hs256";
    return c.modoDetectado;
  }

  return "sin_configurar";
}

/**
 * Verifica localmente (sin red) el access_token de Supabase ya presente en
 * la cookie de sesión. Devuelve el payload decodificado si la firma y
 * expiración son válidas, o null si no se puede verificar (modo no
 * detectado aún, firma inválida, o token expirado).
 */
export async function verificarAccessTokenLocal(token: string): Promise<JWTPayload | null> {
  const modo = await detectarModoVerificacion();
  const c = cache();

  try {
    if (modo === "jwks" && c.jwks) {
      const { payload } = await jwtVerify(token, c.jwks);
      return payload;
    }
    if (modo === "hs256" && process.env.SUPABASE_JWT_SECRET) {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET), {
        algorithms: ["HS256"],
      });
      return payload;
    }
  } catch {
    return null;
  }
  return null;
}
