import Image from "next/image";

export interface LogoCriollitasProps {
  /** "md": integrado en una barra con navegación (Cajera/Vendedora).
   *  "sm": barra delgada de solo logo (Admin/Auth). */
  size?: "sm" | "md";
}

const ALTURA_PX: Record<"sm" | "md", number> = { sm: 36, md: 48 };
const RATIO_ANCHO_ALTO = 1536 / 1024;

/** Logo de Criollitas (public/logo.png, PNG con transparencia real, sin
 *  recorte necesario). Tamaño fijo por altura -- el ancho se deriva de la
 *  proporción real del archivo (3:2) para no deformarlo. */
export function LogoCriollitas({ size = "md" }: LogoCriollitasProps) {
  const altura = ALTURA_PX[size];
  return (
    <Image
      src="/logo.png"
      alt="Criollitas — Arepas Rellenas"
      width={Math.round(altura * RATIO_ANCHO_ALTO)}
      height={altura}
      priority
    />
  );
}
