import { VistaArqueos } from "./VistaArqueos";

export default function ArqueosPage() {
  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Historial de arqueos</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">
        Turnos cerrados y su diferencia de caja en el rango seleccionado.
      </p>
      <VistaArqueos />
    </main>
  );
}
