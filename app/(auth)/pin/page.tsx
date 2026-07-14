import { PinPad, type UsuarioPin } from "@/components/auth/PinPad";
import { SEDE_DEFAULT_ID } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

const SEDE_ID = process.env.NEXT_PUBLIC_SEDE_ID ?? SEDE_DEFAULT_ID;

export default async function PinPage() {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/login-pin/usuarios?sede_id=${SEDE_ID}`,
    {
      cache: "no-store",
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
    },
  );
  const usuarios: UsuarioPin[] = res.ok ? await res.json() : [];
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <PinPad usuarios={usuarios} />
    </main>
  );
}
