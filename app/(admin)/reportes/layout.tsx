"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

interface TabReporte {
  href: string;
  etiqueta: string;
}

const TABS: TabReporte[] = [
  { href: "/reportes/ventas", etiqueta: "Ventas" },
  { href: "/reportes/metodos-pago", etiqueta: "Métodos de pago" },
  { href: "/reportes/canales", etiqueta: "Canales" },
  { href: "/reportes/productos", etiqueta: "Productos" },
  { href: "/reportes/categorias", etiqueta: "Categorías" },
  { href: "/reportes/arqueos", etiqueta: "Arqueos" },
  { href: "/reportes/anulaciones", etiqueta: "Anulaciones" },
];

function esActivo(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Sub-navegación por tabs entre los reportes de admin (CLAUDE.md §2.7, §5). */
export default function ReportesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      <nav
        aria-label="Navegación de reportes"
        className="flex flex-wrap gap-2 border-b border-white/10 px-8 pt-8"
      >
        {TABS.map(({ href, etiqueta }) => {
          const activo = esActivo(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={activo ? "page" : undefined}
              className={cn(
                "rounded-t-clay-md px-4 py-2 font-display text-sm font-semibold transition-colors duration-150",
                "focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2",
                activo
                  ? "bg-brand-crema text-brand-chocolate"
                  : "text-brand-crema/70 hover:bg-brand-chocolate-2 hover:text-brand-crema",
              )}
            >
              {etiqueta}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
