"use server";

import { cookies } from "next/headers";

export async function marcarPinValidado(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set("pin_validado", "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}
