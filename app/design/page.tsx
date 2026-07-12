import { ClayBadge, type ClayBadgeProps } from "@/components/ui/ClayBadge";
import { ClayButton, type ClayButtonProps } from "@/components/ui/ClayButton";
import { ClayCard, type ClayCardProps } from "@/components/ui/ClayCard";
import { ClayInput } from "@/components/ui/ClayInput";
import { DemoModal } from "@/components/ui/DemoModal";

const VARIANTES_BOTON: NonNullable<ClayButtonProps["variant"]>[] = [
  "primary",
  "secondary",
  "ghost",
  "destructive",
  "success",
];

const ETIQUETA_VARIANTE_BOTON: Record<NonNullable<ClayButtonProps["variant"]>, string> = {
  primary: "Primario",
  secondary: "Secundario",
  ghost: "Fantasma",
  destructive: "Destructivo",
  success: "Éxito",
};

const TAMANOS_BOTON: NonNullable<ClayButtonProps["size"]>[] = ["sm", "md", "lg", "xl"];

const ETIQUETA_TAMANO_BOTON: Record<NonNullable<ClayButtonProps["size"]>, string> = {
  sm: "Pequeño",
  md: "Mediano",
  lg: "Grande",
  xl: "Extra grande",
};

const VARIANTES_CARD: {
  variant: NonNullable<ClayCardProps["variant"]>;
  titulo: string;
  descripcion: string;
}[] = [
  {
    variant: "default",
    titulo: "Tarjeta por defecto",
    descripcion: "Superficie crema elevada, uso general en listas y menús.",
  },
  {
    variant: "elevated",
    titulo: "Tarjeta elevada",
    descripcion: "Mayor profundidad, para modales o contenido destacado.",
  },
  {
    variant: "flat",
    titulo: "Tarjeta plana",
    descripcion: "Sin sombra externa, solo borde suave, para contenido secundario.",
  },
  {
    variant: "sunken",
    titulo: "Tarjeta hundida",
    descripcion: "Sombra interna, para paneles de resumen o contenedores anidados.",
  },
];

const VARIANTES_BADGE: { variant: NonNullable<ClayBadgeProps["variant"]>; etiqueta: string }[] = [
  { variant: "neutral", etiqueta: "Pendiente" },
  { variant: "exito", etiqueta: "Listo" },
  { variant: "alerta", etiqueta: "En preparación" },
  { variant: "peligro", etiqueta: "Anulado" },
];

const SWATCHES: { nombre: string; className: string; hex: string; textoOscuro: boolean }[] = [
  { nombre: "Chocolate", className: "bg-brand-chocolate", hex: "#3D1F14", textoOscuro: false },
  { nombre: "Chocolate 2", className: "bg-brand-chocolate-2", hex: "#52281A", textoOscuro: false },
  { nombre: "Chocolate 3", className: "bg-brand-chocolate-3", hex: "#2A1409", textoOscuro: false },
  { nombre: "Mostaza", className: "bg-brand-mostaza", hex: "#F5B822", textoOscuro: true },
  { nombre: "Mostaza 2", className: "bg-brand-mostaza-2", hex: "#FFC94A", textoOscuro: true },
  { nombre: "Mostaza 3", className: "bg-brand-mostaza-3", hex: "#D69A0C", textoOscuro: true },
  { nombre: "Crema", className: "bg-brand-crema", hex: "#FFF8E7", textoOscuro: true },
  { nombre: "Crema 2", className: "bg-brand-crema-2", hex: "#FFEFD1", textoOscuro: true },
  { nombre: "Crema 3", className: "bg-brand-crema-3", hex: "#F5E4BE", textoOscuro: true },
  { nombre: "Verde", className: "bg-brand-verde", hex: "#7CB342", textoOscuro: true },
  { nombre: "Verde 2", className: "bg-brand-verde-2", hex: "#9CCC65", textoOscuro: true },
  { nombre: "Tomate", className: "bg-brand-tomate", hex: "#D84315", textoOscuro: false },
  { nombre: "Tomate 2", className: "bg-brand-tomate-2", hex: "#E85D2E", textoOscuro: false },
];

export default function DesignPage() {
  return (
    <main className="min-h-screen bg-brand-chocolate px-6 py-12 sm:px-10 lg:px-16">
      <header className="mx-auto mb-12 max-w-5xl text-center">
        <h1 className="font-display text-4xl font-semibold text-brand-mostaza sm:text-5xl">
          Criollitas — Sistema de diseño Claymorphism
        </h1>
        <p className="mt-3 font-body text-base text-text-inverse sm:text-lg">
          Página de verificación de los componentes base: ClayButton, ClayCard y ClayInput.
        </p>
      </header>

      <div className="mx-auto flex max-w-5xl flex-col gap-16">
        {/* Botones */}
        <section aria-labelledby="seccion-botones" className="flex flex-col gap-6">
          <h2 id="seccion-botones" className="font-display text-2xl font-semibold text-text-inverse">
            ClayButton
          </h2>
          <div className="flex flex-col gap-8">
            {VARIANTES_BOTON.map((variant) => (
              <div key={variant} className="flex flex-col gap-3">
                <h3 className="font-display text-lg text-brand-crema-2">
                  {ETIQUETA_VARIANTE_BOTON[variant]}
                </h3>
                <div className="flex flex-wrap items-center gap-4">
                  {TAMANOS_BOTON.map((size) => (
                    <ClayButton key={size} variant={variant} size={size}>
                      {ETIQUETA_TAMANO_BOTON[size]}
                    </ClayButton>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex flex-col gap-3">
              <h3 className="font-display text-lg text-brand-crema-2">Deshabilitado</h3>
              <div className="flex flex-wrap items-center gap-4">
                <ClayButton variant="primary" size="md" disabled>
                  No disponible
                </ClayButton>
              </div>
            </div>
          </div>
        </section>

        {/* Tarjetas */}
        <section aria-labelledby="seccion-tarjetas" className="flex flex-col gap-6">
          <h2 id="seccion-tarjetas" className="font-display text-2xl font-semibold text-text-inverse">
            ClayCard
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {VARIANTES_CARD.map(({ variant, titulo, descripcion }) => (
              <ClayCard key={variant} variant={variant}>
                <h3 className="font-display text-lg font-semibold text-text-primary">{titulo}</h3>
                <p className="mt-2 font-body text-sm text-text-secondary">{descripcion}</p>
              </ClayCard>
            ))}
          </div>
        </section>

        {/* Inputs */}
        <section aria-labelledby="seccion-inputs" className="flex flex-col gap-6">
          <h2 id="seccion-inputs" className="font-display text-2xl font-semibold text-text-inverse">
            ClayInput
          </h2>
          <ClayCard variant="default" className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <ClayInput
              label="Nombre completo"
              placeholder="Ej: María Pérez"
              name="nombre"
            />
            <ClayInput
              label="Correo electrónico"
              placeholder="correo@ejemplo.com"
              name="correo"
              error="El correo electrónico ingresado no es válido."
            />
          </ClayCard>
        </section>

        {/* Modal */}
        <section aria-labelledby="seccion-modal" className="flex flex-col gap-6">
          <h2 id="seccion-modal" className="font-display text-2xl font-semibold text-text-inverse">
            ClayModal
          </h2>
          <ClayCard variant="default" className="flex flex-col items-start gap-4">
            <p className="font-body text-sm text-text-secondary">
              Modal nativo sobre <code className="font-mono">&lt;dialog&gt;</code>, con cierre por
              Esc, clic fuera del panel o los botones de la muestra.
            </p>
            <DemoModal />
          </ClayCard>
        </section>

        {/* Badges */}
        <section aria-labelledby="seccion-badges" className="flex flex-col gap-6">
          <h2 id="seccion-badges" className="font-display text-2xl font-semibold text-text-inverse">
            ClayBadge
          </h2>
          <div className="flex flex-wrap items-center gap-4">
            {VARIANTES_BADGE.map(({ variant, etiqueta }) => (
              <ClayBadge key={variant} variant={variant}>
                {etiqueta}
              </ClayBadge>
            ))}
          </div>
        </section>

        {/* Swatches de color */}
        <section aria-labelledby="seccion-colores" className="flex flex-col gap-6">
          <h2 id="seccion-colores" className="font-display text-2xl font-semibold text-text-inverse">
            Paleta de marca
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {SWATCHES.map(({ nombre, className, hex, textoOscuro }) => (
              <div
                key={nombre}
                className={`flex h-28 flex-col justify-end rounded-clay-md p-3 shadow-clay-sm ${className}`}
              >
                <span
                  className={`font-display text-sm font-semibold ${
                    textoOscuro ? "text-brand-chocolate" : "text-brand-crema"
                  }`}
                >
                  {nombre}
                </span>
                <span
                  className={`font-mono text-xs ${
                    textoOscuro ? "text-brand-chocolate" : "text-brand-crema"
                  }`}
                >
                  {hex}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
