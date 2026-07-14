import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BotonCerrarSesion } from "@/components/auth/BotonCerrarSesion";

export default function CajeraLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-brand-chocolate">
      <header className="flex items-center justify-between border-b border-white/10 px-8 py-6">
        <Link
          href="/pedidos"
          className="inline-flex items-center gap-2 font-display text-lg text-brand-crema/70 transition-colors duration-150 hover:text-brand-crema focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2"
        >
          <ArrowLeft size={20} aria-hidden="true" />
          Caja
        </Link>
        <div className="flex items-center gap-6">
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
            Domicilios y para llevar
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
