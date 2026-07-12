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

  const decision = resolverAccesoRuta(rol, ruta);
  if (decision.tipo === "redirigir") {
    return NextResponse.redirect(new URL(decision.destino, request.url));
  }
  return response;
}

// Las rutas /api/* quedan excluidas del middleware: deben autenticarse
// a sí mismas con getUser() (relevante para el futuro /api/print).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
