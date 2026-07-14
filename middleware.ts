import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { verificarAccessTokenLocal } from "@/lib/auth/jwtLocal";
import { esRutaPublica, normalizarRol, resolverAccesoRuta, type Rol } from "@/lib/auth/roles";
import {
  COOKIE_SESION_OFFLINE,
  crearTokenSesionOffline,
  verificarTokenSesionOffline,
} from "@/lib/auth/sesionOffline";
import { esErrorDeRed } from "@/lib/conectividad/errorRed";
import { reportarExito, reportarFalloDeRed } from "@/lib/conectividad/estado";

// better-sqlite3/jose con caché en disco (Fase 1+) requieren Node, no Edge.
export const runtime = "nodejs";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const ruta = request.nextUrl.pathname;
  const esPublica = esRutaPublica(ruta);

  let rol: Rol | null = null;
  let hayUsuario = false;

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error && esErrorDeRed(error)) {
      throw error;
    }
    reportarExito();
    hayUsuario = Boolean(data.user);
    if (data.user) {
      rol = normalizarRol(data.user.app_metadata?.rol);
      // Contacto online exitoso: renueva la ventana de sesión offline para
      // que, si la red se cae después, la sesión siga viva hasta 12h desde
      // AHORA (nunca se extiende a partir de una validación offline previa).
      // Aislado en su propio try/catch: si OFFLINE_SESSION_SECRET falta o
      // falla la firma, eso NUNCA debe tumbar el login online normal.
      if (rol) {
        try {
          const token = await crearTokenSesionOffline({
            usuarioId: data.user.id,
            rol,
            sedeId: (data.user.app_metadata?.sede_id as string | undefined) ?? "",
          });
          response.cookies.set(COOKIE_SESION_OFFLINE, token, {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 12,
          });
        } catch {
          // Sin OFFLINE_SESSION_SECRET configurado (o error de firma): la
          // sesión offline extendida simplemente no queda disponible esta
          // vez. El login online sigue funcionando con normalidad.
        }
      }
    }
  } catch (error) {
    if (!esErrorDeRed(error)) {
      // Error real de dominio/auth (token corrupto, etc.), no de red:
      // comportamiento sin cambios respecto a hoy — sesión inválida.
      hayUsuario = false;
      rol = null;
    } else {
      reportarFalloDeRed();
      const resultado = await resolverIdentidadOffline(supabase, request);
      hayUsuario = resultado !== null;
      rol = resultado?.rol ?? null;
    }
  }

  if (!hayUsuario) {
    return esPublica ? response : NextResponse.redirect(new URL("/login", request.url));
  }

  const pinValidado = request.cookies.get("pin_validado")?.value === "1";
  if (!pinValidado && !esPublica) {
    return NextResponse.redirect(new URL("/pin", request.url));
  }
  if (esPublica) return response;

  // Bloque F: la cajera debe declarar el dinero base (abrir turno) antes de
  // usar cualquier otra ruta suya -- incluidas /inicio, /pedido, /mis-pedidos
  // del Bloque E. turno_abierto es una cookie (mismo patrón que
  // pin_validado) para no consultar base de datos en cada request.
  const turnoAbierto = request.cookies.get("turno_abierto")?.value === "1";
  const rutaExentaDeTurno = ruta === "/turno/abrir" || ruta === "/mi-turno" || ruta.startsWith("/mi-turno/");
  if (rol === "cajera" && !turnoAbierto && !rutaExentaDeTurno) {
    // Bug real encontrado en uso: la cookie expira a las 12h (mismo maxAge
    // que pin_validado), pero un turno de restaurante puede durar más --
    // cuando expira con el turno todavía abierto en base de datos, un
    // Server Component (/turno/abrir) no puede volver a fijarla (solo se
    // puede desde Server Actions/Route Handlers/middleware), así que su
    // auto-redirección a /mi-turno dejaba a la cajera atascada: cualquier
    // clic que disparara un Server Action en /cobrar o /turno/movimientos
    // volvía a chocar contra este mismo bloqueo, sin ningún error visible.
    // Autocuración: antes de bloquear, se verifica una sola vez si de
    // verdad no hay turno abierto -- si sí lo hay, se refresca la cookie
    // aquí (el middleware sí puede fijarla) y se deja pasar.
    const { data: turnoFila } = await supabase
      .from("turnos_caja")
      .select("id")
      .eq("cajera_id", user.id)
      .eq("estado", "abierto")
      .maybeSingle();
    if (turnoFila) {
      response.cookies.set("turno_abierto", "1", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 12,
      });
    } else {
      return NextResponse.redirect(new URL("/turno/abrir", request.url));
    }
  }

  const decision = resolverAccesoRuta(rol, ruta);
  if (decision.tipo === "redirigir") {
    return NextResponse.redirect(new URL(decision.destino, request.url));
  }
  return response;
}

/**
 * Sin red hacia Supabase: intenta reconstruir la identidad sin llamar a
 * getUser(). Dos niveles, del más al menos estricto:
 *
 * 1. El access_token todavía presente en la cookie de sesión (leído vía
 *    getSession(), que a diferencia de getUser() NUNCA llama a la red —
 *    solo decodifica lo que ya está en la cookie) se valida localmente
 *    (firma + expiración) con lib/auth/jwtLocal.ts.
 * 2. Si ese token ya expiró (jwt_expiry=3600, y sin red no hay refresh
 *    posible), se cae a la cookie `sesion_offline`: una ventana extendida
 *    de hasta 12h desde el último contacto online exitoso.
 *
 * Si ninguno es válido, la sesión se trata como no autenticada — "offline"
 * nunca significa "saltarse la autenticación".
 */
async function resolverIdentidadOffline(
  supabase: ReturnType<typeof createServerClient>,
  request: NextRequest,
): Promise<{ rol: Rol | null } | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (accessToken) {
      const payload = await verificarAccessTokenLocal(accessToken);
      if (payload) {
        const appMetadata = payload.app_metadata as Record<string, unknown> | undefined;
        return { rol: normalizarRol(appMetadata?.rol) };
      }
    }
  } catch {
    // getSession() no debería llamar a la red, pero si de todos modos
    // falla, se cae a la ventana de sesión offline de abajo.
  }

  const sesionOffline = await verificarTokenSesionOffline(
    request.cookies.get(COOKIE_SESION_OFFLINE)?.value,
  );
  if (sesionOffline) {
    return { rol: sesionOffline.rol };
  }

  return null;
}

// Las rutas /api/* quedan excluidas del middleware: deben autenticarse
// a sí mismas con getUser() (relevante para el futuro /api/print).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
