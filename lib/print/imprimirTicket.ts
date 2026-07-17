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

// Se inyecta dentro del documento del ticket: la impresión se dispara EN LA
// PROPIA VENTANA cuando su evento load ya corrió -- es decir, con el logo
// (data URI) ya decodificado y pintado. Llamar ventana.print() desde afuera
// justo tras document.close() capturaba la página antes de que la imagen
// terminara de pintarse y la tirilla salía sin logo (bug real reportado por
// el usuario). Correr dentro de la ventana también la hace independiente de
// que la página que la abrió navegue inmediatamente después (flujo offline).
const SCRIPT_AUTOIMPRESION = `<script>
  window.addEventListener("load", function () {
    setTimeout(function () { window.print(); }, 80);
  });
  window.addEventListener("afterprint", function () { window.close(); });
</script>`;

/** Abre una ventana con el ticket ya formateado; la ventana se imprime sola
 *  al terminar de cargar (ver SCRIPT_AUTOIMPRESION) y se cierra al salir
 *  del diálogo. Nunca lanza: un fallo aquí no debe romper el flujo de
 *  cobro, que ya quedó confirmado antes de llegar a este paso. Sin test
 *  unitario (efectos de navegador: window.open/print). */
export function solicitarImpresionTicket(html: string): ResultadoSolicitudImpresion {
  try {
    const ventana = window.open("", "_blank", "width=380,height=600");
    if (!ventana) {
      return {
        exito: false,
        error: "El navegador bloqueó la ventana de impresión (revisa el bloqueador de ventanas emergentes)",
      };
    }
    const htmlConAutoimpresion = html.includes("</body>")
      ? html.replace("</body>", `${SCRIPT_AUTOIMPRESION}</body>`)
      : html + SCRIPT_AUTOIMPRESION;
    ventana.document.open();
    ventana.document.write(htmlConAutoimpresion);
    ventana.document.close();
    ventana.focus();
    return { exito: true, error: null };
  } catch (error) {
    return {
      exito: false,
      error: error instanceof Error ? error.message : "No se pudo abrir la ventana de impresión",
    };
  }
}
