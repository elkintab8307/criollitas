import { VistaMetodosPago } from "./VistaMetodosPago";

export default function MetodosPagoPage() {
  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Ventas por método de pago</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">
        Participación de cada método de pago en el rango seleccionado.
      </p>
      <VistaMetodosPago />
    </main>
  );
}
