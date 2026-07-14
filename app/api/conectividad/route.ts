import { NextResponse } from "next/server";

import { obtenerEstadoConectividad } from "@/lib/conectividad/estado";

export async function GET() {
  return NextResponse.json({ estado: obtenerEstadoConectividad() });
}
