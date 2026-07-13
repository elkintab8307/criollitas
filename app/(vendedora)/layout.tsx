import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function VendedoraLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-brand-chocolate">
      <header className="border-b border-white/10 px-8 py-6">
        <Link
          href="/inicio"
          className="inline-flex items-center gap-2 font-display text-lg text-brand-crema/70 transition-colors duration-150 hover:text-brand-crema focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2"
        >
          <ArrowLeft size={20} aria-hidden="true" />
          Ventas
        </Link>
      </header>
      {children}
    </div>
  );
}
