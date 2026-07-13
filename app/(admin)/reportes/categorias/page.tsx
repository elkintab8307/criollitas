import { VistaCategorias } from "./VistaCategorias";

export default function CategoriasPage() {
  return (
    <main className="p-8">
      <h1 className="font-display text-3xl text-brand-mostaza">Categorías más vendidas</h1>
      <p className="mt-2 mb-6 text-brand-crema/80">
        Participación de cada categoría en el rango seleccionado.
      </p>
      <VistaCategorias />
    </main>
  );
}
