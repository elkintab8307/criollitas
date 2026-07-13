import { TablaAuditoria } from "@/components/admin/TablaAuditoria";
import { listarAuditoria } from "@/app/(admin)/auditoria/actions";

export default async function AuditoriaPage() {
  const resultado = await listarAuditoria({ pagina: 1 });
  const filasIniciales = resultado.ok ? resultado.valor : [];

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Auditoría</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">
        Historial de cambios sobre pedidos, pagos, turnos y usuarios.
      </p>
      <TablaAuditoria filasIniciales={filasIniciales} />
    </main>
  );
}
