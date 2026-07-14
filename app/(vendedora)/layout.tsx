import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { BotonCerrarSesion } from "@/components/auth/BotonCerrarSesion";

export default async function VendedoraLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Estas rutas (/inicio, /pedido/*, /mis-pedidos) son compartidas con la
  // cajera desde el bloque E -- cuando toma un pedido, necesita un camino
  // de regreso a caja (cobro) que la vendedora no necesita, porque ella no
  // tiene turno/caja propios.
  const esCajera = user?.app_metadata?.rol === "cajera";

  return (
    <div className="min-h-dvh bg-brand-chocolate">
      <header className="flex items-center justify-between border-b border-white/10 px-8 py-6">
        <Link
          href="/inicio"
          className="inline-flex items-center gap-2 font-display text-lg text-brand-crema/70 transition-colors duration-150 hover:text-brand-crema focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2"
        >
          <ArrowLeft size={20} aria-hidden="true" />
          Ventas
        </Link>
        <div className="flex items-center gap-6">
          {esCajera ? (
            <Link
              href="/pedidos"
              className="font-display text-sm text-brand-crema/70 transition-colors duration-150 hover:text-brand-crema focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2"
            >
              Volver a caja
            </Link>
          ) : null}
          <Link
            href="/mis-pedidos"
            className="font-display text-sm text-brand-crema/70 transition-colors duration-150 hover:text-brand-crema focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2"
          >
            Domicilios y para llevar
          </Link>
          <BotonCerrarSesion />
        </div>
      </header>
      {children}
    </div>
  );
}
