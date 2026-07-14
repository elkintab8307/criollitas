import Link from "next/link";
import { BotonCerrarSesion } from "@/components/auth/BotonCerrarSesion";

export default function CajeraLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-brand-chocolate">
      <header className="flex items-center justify-between border-b border-white/10 px-8 py-6">
        <span className="font-display text-lg text-brand-crema/70">Caja</span>
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
          <BotonCerrarSesion />
        </div>
      </header>
      {children}
    </div>
  );
}
