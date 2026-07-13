import { VistaCanales } from "./VistaCanales";

export default function CanalesPage() {
  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Ventas por canal</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">
        Participación de mesa, domicilio y para llevar en el rango seleccionado.
      </p>
      <VistaCanales />
    </main>
  );
}
