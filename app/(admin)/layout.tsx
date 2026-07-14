import { AdminNav } from "@/components/admin/AdminNav";
import { BotonCerrarSesion } from "@/components/auth/BotonCerrarSesion";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-brand-chocolate">
      <header className="flex items-center justify-between border-b border-white/10 px-8 py-6">
        <span className="font-display text-lg text-brand-crema/70">Administración</span>
        <BotonCerrarSesion />
      </header>
      <div className="flex flex-1 flex-col sm:flex-row">
        <AdminNav />
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
