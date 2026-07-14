import { LogoCriollitas } from "@/components/ui/LogoCriollitas";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-brand-chocolate">
      <header className="sticky top-0 z-10 flex justify-center border-b border-white/10 bg-brand-chocolate px-8 py-3 sm:justify-start">
        <LogoCriollitas size="sm" />
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
