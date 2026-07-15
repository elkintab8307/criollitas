import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { esRutaPublica, normalizarRol, resolverAccesoRuta } from "@/lib/auth/roles";

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ruta = request.nextUrl.pathname;
  const esPublica = esRutaPublica(ruta);

  if (!user) {
    return esPublica ? response : NextResponse.redirect(new URL("/login", request.url));
  }

  const pinValidado = request.cookies.get("pin_validado")?.value === "1";
  // Se valida el claim contra los roles conocidos: un valor corrupto o
  // legado (ej. "gerente") se trata como sesión sin rol, nunca se castea
  // a ciegas (evita llegar a rutaPorRol() con un rol inexistente).
  // Se lee de app_metadata (no user_metadata): solo el service role puede
  // escribirlo, así que el propio usuario no puede autopromoverse.
  const rol = normalizarRol(user.app_metadata?.rol);

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

// Las rutas /api/* quedan excluidas del middleware: deben autenticarse
// a sí mismas con getUser() (relevante para el futuro /api/print).
// sw.js también queda excluido (Bloque J1, Task 4): el navegador lo pide
// sin cookies de sesión útiles para el registro del Service Worker, y si
// el middleware lo redirige a /login o /pin, el navegador recibe HTML en
// vez de JavaScript y el registro falla en silencio.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
