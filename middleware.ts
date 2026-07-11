import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { esRutaPublica, reglaDePrefijo, rutaPorRol, type Rol } from "@/lib/auth/roles";

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
  const rol = (user.user_metadata?.rol ?? null) as Rol | null;

  if (!pinValidado && !esPublica) {
    return NextResponse.redirect(new URL("/pin", request.url));
  }
  if (esPublica || !rol) return response;

  const regla = reglaDePrefijo(ruta);
  if (regla && !regla.roles.includes(rol)) {
    return NextResponse.redirect(new URL(rutaPorRol(rol), request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
