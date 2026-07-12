export default function CajeraLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-brand-chocolate">
      <header className="border-b border-white/10 px-8 py-6">
        <span className="font-display text-lg text-brand-crema/70">Caja</span>
      </header>
      {children}
    </div>
  );
}
