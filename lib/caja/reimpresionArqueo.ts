import type { createServerSupabase } from "@/lib/supabase/server";

type SupabaseServer = Awaited<ReturnType<typeof createServerSupabase>>;

/** Ventana durante la cual /turno/abrir ofrece reimprimir la tirilla del
 *  último cierre: 12 h, igual que la vida de la cookie `turno_abierto`.
 *  Pasada esa ventana el botón desaparece para no quedar apuntando
 *  indefinidamente a un arqueo viejo. */
export const REIMPRESION_ARQUEO_VENTANA_MS = 12 * 60 * 60 * 1000;

export type ArqueoReimprimible =
  | { estado: "ok"; impresionId: string; html: string }
  | { estado: "sin_cierre" }
  | { estado: "sin_tirilla" }
  | { estado: "formato_viejo" };

/** Busca la tirilla de arqueo del último turno que `cajeraId` cerró dentro
 *  de la ventana reciente. La usan la Server Action `prepararReimpresionArqueo`
 *  (para servir el HTML) y la página /turno/abrir (para decidir si muestra
 *  el botón de reimprimir). El RLS ya limita las dos consultas a los turnos
 *  e impresiones de la propia cajera (`turnos_caja_cajera_select`,
 *  `impresiones_cajera_select`), así que aquí no se repite esa regla. */
export async function buscarArqueoReimprimible(
  supabase: SupabaseServer,
  cajeraId: string,
): Promise<ArqueoReimprimible> {
  const desde = new Date(Date.now() - REIMPRESION_ARQUEO_VENTANA_MS).toISOString();
  const { data: turnoFila } = await supabase
    .from("turnos_caja")
    .select("id")
    .eq("cajera_id", cajeraId)
    .eq("estado", "cerrado")
    .gte("cerrado_en", desde)
    .order("cerrado_en", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!turnoFila) return { estado: "sin_cierre" };

  const { data: impresionFila } = await supabase
    .from("impresiones")
    .select("id, contenido_html")
    .eq("turno_id", turnoFila.id)
    .eq("tipo", "tirilla_arqueo")
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!impresionFila) return { estado: "sin_tirilla" };
  if (!impresionFila.contenido_html) return { estado: "formato_viejo" };
  return { estado: "ok", impresionId: impresionFila.id, html: impresionFila.contenido_html };
}
