import { VistaVentas } from "./VistaVentas";

export default function VentasPage() {
  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Ventas</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">
        Ventas por rango de fecha, mapa de calor semanal y comparativo período contra período.
      </p>
      <VistaVentas />
    </main>
  );
}
