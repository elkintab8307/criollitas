import { VistaProductos } from "./VistaProductos";

export default function ProductosPage() {
  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Productos más vendidos</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">
        Top de productos por unidades o por ingreso en el rango seleccionado.
      </p>
      <VistaProductos />
    </main>
  );
}
