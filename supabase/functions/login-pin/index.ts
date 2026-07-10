import { createClient } from "npm:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2";

const MAX_INTENTOS = 5;
const VENTANA_MS = 5 * 60_000;

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
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
    .select("id, pin_hash, activo")
    .eq("id", usuario_id)
    .single();

  const valido =
    !!usuario &&
    usuario.activo &&
    !!usuario.pin_hash &&
    bcrypt.compareSync(String(pin), usuario.pin_hash);

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
  });
});
