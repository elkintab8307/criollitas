import { createClient } from "npm:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2";

// NOTA: esta ventana de rate limit (5 intentos / 5 minutos) está duplicada
// en lib/auth/pin.ts porque esta función (Deno, runtime aislado) no puede
// importar ese módulo hoy. Si se cambia aquí, replicar el cambio allá.
// Diferencia de borde conocida: aquí se filtra con `gte` sobre `desde`
// (límite inferior de la ventana); en lib/auth/pin.ts se filtra con `<`
// sobre la diferencia en milisegundos (equivalente en la práctica, pero no
// idéntico bit a bit). Unificar está pendiente para la próxima tarea de auth.
const MAX_INTENTOS = 5;
const VENTANA_MS = 5 * 60_000;

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// CORS: /pin (Bloque J2) llama a GET .../usuarios directo desde el
// navegador para poder mostrar la lista de usuarios cacheada si falla
// (offline) -- eso dispara un preflight OPTIONS por el header `apikey`
// (no es "simple header" para CORS). Sin esto, el navegador bloquea la
// respuesta aunque el servidor sí la entregue (bug real encontrado con
// verificación en navegador: `net::ERR_FAILED` en la consola, la función
// nunca tuvo que lidiar con esto porque hasta el Bloque J2 solo se
// llamaba server-to-server, donde CORS no aplica).
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);

  // Lista de usuarios para la pantalla PIN (sin pin_hash)
  if (req.method === "GET" && url.pathname.endsWith("/usuarios")) {
    const sedeId = url.searchParams.get("sede_id");
    if (!sedeId) return json(400, { error: "Falta sede_id" });
    const { data, error } = await admin
      .from("usuarios")
      .select("id, nombre, avatar_url, rol")
      .eq("sede_id", sedeId)
      .eq("activo", true)
      .order("nombre");
    if (error) return json(500, { error: "No se pudo cargar la lista de usuarios" });
    return json(200, data);
  }

  if (req.method !== "POST") return json(405, { error: "Método no permitido" });

  const { usuario_id, pin } = await req.json().catch(() => ({}));
  if (typeof usuario_id !== "string" || !/^\d{4,6}$/.test(String(pin))) {
    return json(400, { error: "Solicitud inválida" });
  }

  // Nota: el conteo y el insert no son atómicos (TOCTOU). Con un solo teclado
  // de PIN por sede el riesgo real es despreciable; si algún día hay muchos
  // clientes concurrentes, mover el conteo+insert a una función SQL atómica.
  // Rate limit: fallos de los últimos 5 minutos
  const desde = new Date(Date.now() - VENTANA_MS).toISOString();
  const { data: fallos } = await admin
    .from("pin_intentos")
    .select("creado_en")
    .eq("usuario_id", usuario_id)
    .eq("exito", false)
    .gte("creado_en", desde)
    .order("creado_en", { ascending: true });

  if ((fallos ?? []).length >= MAX_INTENTOS) {
    const masAntiguo = new Date(fallos![0]!.creado_en).getTime();
    const segundos = Math.ceil((masAntiguo + VENTANA_MS - Date.now()) / 1000);
    return json(429, {
      error: "Demasiados intentos. Espera un momento e inténtalo de nuevo.",
      segundos_restantes: Math.max(segundos, 1),
    });
  }

  // Verificar PIN
  const { data: usuario } = await admin
    .from("usuarios")
    .select("id, pin_hash, activo, sede_id")
    .eq("id", usuario_id)
    .single();

  // Hash bcrypt de relleno para igualar el tiempo de respuesta cuando el
  // usuario no existe o no tiene PIN (evita enumerar usuarios por timing).
  const HASH_RELLENO = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

  const hashAComparar =
    usuario && usuario.activo && usuario.pin_hash ? usuario.pin_hash : HASH_RELLENO;
  const coincide = bcrypt.compareSync(String(pin), hashAComparar);
  const valido = !!usuario && usuario.activo && !!usuario.pin_hash && coincide;

  await admin.from("pin_intentos").insert({ usuario_id, exito: valido });
  if (!valido) return json(401, { error: "PIN incorrecto" });

  // Emitir sesión: magic link consumido server-side
  const { data: au } = await admin.auth.admin.getUserById(usuario_id);
  const email = au?.user?.email;
  if (!email) return json(500, { error: "Usuario sin correo asociado" });

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError || !link?.properties?.hashed_token) {
    return json(500, { error: "No se pudo iniciar la sesión" });
  }

  const { data: session, error: otpError } = await admin.auth.verifyOtp({
    type: "email",
    token_hash: link.properties.hashed_token,
  });
  if (otpError || !session.session) {
    return json(500, { error: "No se pudo iniciar la sesión" });
  }

  return json(200, {
    access_token: session.session.access_token,
    refresh_token: session.session.refresh_token,
    pin_hash: usuario!.pin_hash,
    sede_id: usuario!.sede_id,
  });
});
