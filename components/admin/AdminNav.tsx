"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  UtensilsCrossed,
  Grid3x3,
  BarChart3,
  History,
  Ban,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface EnlaceNav {
  href: string;
  etiqueta: string;
  icono: LucideIcon;
}

const ENLACES: EnlaceNav[] = [
  { href: "/dashboard", etiqueta: "Panel", icono: LayoutDashboard },
  { href: "/menu", etiqueta: "Menú", icono: UtensilsCrossed },
  { href: "/mesas", etiqueta: "Mesas", icono: Grid3x3 },
  { href: "/reportes/ventas", etiqueta: "Reportes", icono: BarChart3 },
  { href: "/auditoria", etiqueta: "Auditoría", icono: History },
  { href: "/anular", etiqueta: "Anular pedido", icono: Ban },
];

function esActivo(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Navegación lateral del panel de administración (CLAUDE.md §5, §8.4). */
export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación de administración"
      className="flex shrink-0 flex-col gap-2 border-r border-white/10 bg-brand-chocolate-3 p-4 sm:w-56"
    >
      {ENLACES.map(({ href, etiqueta, icono: Icono }) => {
        const activo = esActivo(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={activo ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-clay-md px-4 py-3 font-display text-sm font-semibold transition-colors duration-150",
              "focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2",
              activo
                ? "bg-brand-chocolate-2 text-brand-mostaza"
                : "text-brand-crema/70 hover:bg-brand-chocolate-2 hover:text-brand-crema",
            )}
          >
            <Icono size={20} aria-hidden="true" />
            {etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
