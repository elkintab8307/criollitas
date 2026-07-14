import { cerrarSesion } from "@/app/(auth)/pin/actions";
import { ClayButton } from "@/components/ui/ClayButton";

/** Form con Server Action -- funciona sin JS del lado del cliente. Vive en
 *  el header de cada layout por rol para que cualquiera pueda ceder el
 *  dispositivo a otro miembro del staff sin cerrar sesión completa desde
 *  otro lado. */
export function BotonCerrarSesion() {
  return (
    <form action={cerrarSesion}>
      <ClayButton type="submit" variant="ghost" size="sm">
        Cambiar de usuario
      </ClayButton>
    </form>
  );
}
