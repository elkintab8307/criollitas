import Link from "next/link";
import { LogoCriollitas } from "@/components/ui/LogoCriollitas";
import { BotonCerrarSesion } from "@/components/auth/BotonCerrarSesion";

export default function CajeraLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-brand-chocolate">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-brand-chocolate px-8 py-4">
        {/* Enlace al logo -> /pedidos: reemplaza al antiguo enlace "Caja"
            (retirado del menú a pedido del usuario, junto con "Domicilios
            y para llevar"). */}
        <Link
          href="/pedidos"
          aria-label="Ir a la caja"
          className="focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2"
        >
          <LogoCriollitas size="md" />
        </Link>
        <div className="flex flex-wrap items-center gap-6">
          <Link
            href="/inicio"
            className="font-display text-sm text-brand-crema/70 transition-colors duration-150 hover:text-brand-crema focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2"
          >
            Tomar pedido
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
          <BotonCerrarSesion />
        </div>
      </header>
      {children}
    </div>
  );
}
