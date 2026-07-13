import { VistaAnulaciones } from "./VistaAnulaciones";

export default function AnulacionesPage() {
  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Anulaciones</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">
        Pedidos anulados y su motivo en el rango seleccionado.
      </p>
      <VistaAnulaciones />
    </main>
  );
}
