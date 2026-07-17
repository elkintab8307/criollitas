export interface ResultadoSolicitudImpresion {
  exito: boolean;
  error: string | null;
}

// Documental: la impresora térmica se instala en Windows como impresora
// local normal, no de red -- Panel de impresoras > Agregar > puerto USB001,
// nombre PRINTER_CRIOLLITAS, marcada como predeterminada. Las APIs web no
// permiten elegir una impresora por código (bloqueado por seguridad en todos
// los navegadores), así que queda preseleccionada en el diálogo del sistema
// solo si es la predeterminada de Windows.
export const NOMBRE_IMPRESORA_ESPERADA = "PRINTER_CRIOLLITAS";

/** Abre una ventana con el ticket ya formateado y dispara el diálogo nativo
 *  de impresión del navegador (CLAUDE.md §10.2: reemplaza el envío ESC/POS
 *  por red -- ahora la impresora es una impresora USB normal que Windows ya
 *  sabe manejar). Llama a print() de forma síncrona (sin setTimeout): el
 *  ticket es HTML/CSS inline sin recursos externos, así que document.write
 *  + document.close() lo deja completamente pintado antes de continuar --
 *  un delay asíncrono se perdería en el flujo offline, que navega a otra
 *  página (window.location.href) justo después de llamar a esta función.
 *  Nunca lanza: un fallo aquí no debe romper el flujo de cobro, que ya
 *  quedó confirmado antes de llegar a este paso. Sin test unitario (efectos
 *  de navegador: window.open/print, mismo criterio que
 *  RegistradorManejadoresPedido.tsx). */
export function solicitarImpresionTicket(html: string): ResultadoSolicitudImpresion {
  try {
    const ventana = window.open("", "_blank", "width=380,height=600");
    if (!ventana) {
      return {
        exito: false,
        error: "El navegador bloqueó la ventana de impresión (revisa el bloqueador de ventanas emergentes)",
      };
    }
    ventana.document.open();
    ventana.document.write(html);
    ventana.document.close();
    ventana.onafterprint = () => ventana.close();
    ventana.focus();
    ventana.print();
    return { exito: true, error: null };
  } catch (error) {
    return {
      exito: false,
      error: error instanceof Error ? error.message : "No se pudo abrir la ventana de impresión",
    };
  }
}
