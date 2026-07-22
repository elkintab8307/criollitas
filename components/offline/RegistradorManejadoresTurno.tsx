"use client";

import { useEffect } from "react";
import { registrarManejador } from "@/lib/offline/sync";
import { createClient } from "@/lib/supabase/client";

/** Registra en el motor de sincronización (Bloque J3a) cómo reproducir
 *  contra Supabase cada operación de turno encolada offline. Llama
 *  directo a Supabase desde el navegador (mismas políticas RLS que ya
 *  protegen al Server Action equivalente cuando hay conexión -- RLS no
 *  distingue el origen de la petición). Sin test unitario (efectos de
 *  navegador/Supabase). */
export function RegistradorManejadoresTurno() {
  useEffect(() => {
    registrarManejador("abrir_turno", async (payload) => {
      const supabase = createClient();
      const { error } = await supabase.from("turnos_caja").insert({
        id: payload.turnoId as string,
        sede_id: payload.sedeId as string,
        cajera_id: payload.cajeraId as string,
        efectivo_inicial_cop: payload.efectivoInicialCop as number,
      });
      if (error) {
        return {
          ok: false,
          mensaje: error.code === "23505" ? "Ya tienes un turno abierto." : error.message,
        };
      }
      return { ok: true };
    });

    registrarManejador("registrar_movimiento", async (payload) => {
      const supabase = createClient();
      const { error } = await supabase.from("movimientos_caja").insert({
        turno_id: payload.turnoId as string,
        tipo: payload.tipo as "retiro" | "gasto" | "ingreso_extra",
        concepto: payload.concepto as string,
        monto_cop: payload.montoCop as number,
      });
      if (error) return { ok: false, mensaje: error.message };
      // El comprobante (si se pudo armar offline -- ver
      // FormularioMovimiento.tsx) ya se imprimió al registrar el
      // movimiento; aquí solo se persiste el registro en `impresiones`.
      if (payload.contenidoHtml) {
        await supabase.from("impresiones").insert({
          turno_id: payload.turnoId as string,
          tipo: "comprobante_movimiento",
          contenido_html: payload.contenidoHtml as string,
          enviado_en: new Date().toISOString(),
          exito: payload.impresionExito as boolean,
          error: (payload.impresionError as string | null) ?? null,
        });
      }
      return { ok: true };
    });

    registrarManejador("cerrar_turno", async (payload) => {
      const supabase = createClient();
      const { error } = await supabase.rpc("cerrar_turno", {
        p_turno_id: payload.turnoId as string,
        p_efectivo_declarado_cop: payload.efectivoDeclaradoCop as number,
      });
      if (error) return { ok: false, mensaje: error.message };
      // La tirilla de arqueo (si se pudo armar offline -- ver
      // FormularioCerrarTurno.tsx) ya se imprimió en el momento del cierre;
      // aquí solo se persiste el registro en `impresiones`, igual que
      // sincronizarCobroOffline hace con la tirilla de cobro.
      if (payload.contenidoHtml) {
        await supabase.from("impresiones").insert({
          turno_id: payload.turnoId as string,
          tipo: "tirilla_arqueo",
          contenido_html: payload.contenidoHtml as string,
          enviado_en: new Date().toISOString(),
          exito: payload.impresionExito as boolean,
          error: (payload.impresionError as string | null) ?? null,
        });
      }
      return { ok: true };
    });

    // Apertura del cajón de dinero para contar efectivo (botón "Abrir
    // caja" en /turno/cerrar): la impresión ya ocurrió al momento del
    // clic (es una acción 100% local, no necesita internet); esto solo
    // persiste el registro de auditoría al reconectar.
    registrarManejador("registrar_apertura_cajon", async (payload) => {
      const supabase = createClient();
      const { error } = await supabase.from("impresiones").insert({
        turno_id: payload.turnoId as string,
        tipo: "apertura_cajon",
        contenido_html: payload.contenidoHtml as string,
        enviado_en: new Date().toISOString(),
        exito: payload.exito as boolean,
        error: (payload.error as string | null) ?? null,
      });
      if (error) return { ok: false, mensaje: error.message };
      return { ok: true };
    });
  }, []);

  return null;
}
