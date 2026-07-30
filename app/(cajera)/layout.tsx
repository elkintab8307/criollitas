import Link from "next/link";
import { LogoCriollitas } from "@/components/ui/LogoCriollitas";
import { BotonCerrarSesion } from "@/components/auth/BotonCerrarSesion";
import { createServerSupabase } from "@/lib/supabase/server";

/** Con el turno cerrado, la cajera no debe poder hacer nada en el sistema
 *  (CLAUDE.md §2.4, bloque F ya lo bloquea a nivel de ruta en
 *  middleware.ts) -- el menú lo refleja ocultando toda opción que no sea
 *  cambiar de usuario, en vez de mostrar enlaces que solo van a rebotarla
 *  de vuelta a /turno/abrir. */
async function hayTurnoAbierto(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("turnos_caja")
    .select("id")
    .eq("cajera_id", user.id)
    .eq("estado", "abierto")
    .maybeSingle();
  return !!data;
}

export default async function CajeraLayout({ children }: { children: React.ReactNode }) {
  const turnoAbierto = await hayTurnoAbierto();

  return (
    <div className="min-h-dvh bg-brand-chocolate">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-brand-chocolate px-8 py-4">
        {/* Enlace al logo -> /pedidos: reemplaza al antiguo enlace "Caja"
            (retirado del menú a pedido del usuario). "Domicilios y llevar"
            también se había retirado con el mismo criterio, pero volvió
            (pedido del usuario, 2026-07-30): sin un enlace en el menú no
            había forma de llegar a /pedidos-en-curso para editar (agregar
            productos a) un pedido ajeno de esos canales. */}
        <Link
          href="/pedidos"
          aria-label="Ir a la caja"
          className="focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2"
        >
          <LogoCriollitas size="md" />
        </Link>
        <div className="flex flex-wrap items-center gap-6">
          {turnoAbierto ? (
            <>
              <Link
                href="/inicio"
                className="font-display text-sm text-brand-crema/70 transition-colors duration-150 hover:text-brand-crema focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2"
              >
                Tomar pedido
              </Link>
              <Link
                href="/pedidos-en-curso"
                className="font-display text-sm text-brand-crema/70 transition-colors duration-150 hover:text-brand-crema focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2"
              >
                Domicilios y llevar
              </Link>
              <Link
                href="/mi-turno"
                className="font-display text-sm text-brand-crema/70 transition-colors duration-150 hover:text-brand-crema focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2"
              >
                Mi turno
              </Link>
              <Link
                href="/turno/cerrar"
                className="font-display text-sm text-brand-crema/70 transition-colors duration-150 hover:text-brand-crema focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2"
              >
                Cerrar turno
              </Link>
            </>
          ) : null}
          <BotonCerrarSesion />
        </div>
      </header>
      {children}
    </div>
  );
}
