import { NextResponse, type NextRequest } from "next/server";
import { pinSchema } from "@/lib/validations/auth";

export async function POST(request: NextRequest) {
  const raw = await request.json().catch(() => null);
  const parsed = pinSchema.safeParse({ usuarioId: raw?.usuario_id, pin: raw?.pin });
  if (!parsed.success) {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
  const upstream = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/login-pin`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario_id: parsed.data.usuarioId, pin: parsed.data.pin }),
    },
  );
  return NextResponse.json(await upstream.json(), { status: upstream.status });
}
