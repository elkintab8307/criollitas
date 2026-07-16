"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayCard } from "@/components/ui/ClayCard";
import { cn } from "@/lib/cn";
import { rutaPorRol, type Rol } from "@/lib/auth/roles";
import { marcarPinValidado } from "@/app/(auth)/pin/actions";
import { guardarIdentidad } from "@/lib/offline/identidad";
import { precargarRutasOffline } from "@/lib/offline/precargaRutas";
import { useConectividadStore } from "@/lib/offline/conectividadStore";
import { verificarPinLocal } from "@/lib/offline/pinLocal";
import { useSesionOfflineStore } from "@/lib/offline/sesionOfflineStore";

export interface UsuarioPin {
  id: string;
  nombre: string;
  avatar_url: string | null;
  rol: Rol;
}

const ROL_LABEL: Record<Rol, string> = {
  admin: "Administrador",
  cajera: "Cajera",
  vendedora: "Vendedora",
  cocina: "Cocina",
};

const PIN_MAX = 6;
const PIN_MIN = 4;
const DIGITOS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

interface PinPadProps {
  usuarios: UsuarioPin[];
}

export function PinPad({ usuarios }: PinPadProps) {
  const router = useRouter();
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState<UsuarioPin | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [segundosRestantes, setSegundosRestantes] = useState(0);
  const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const usuarioEnCursoRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (intervaloRef.current) clearInterval(intervaloRef.current);
    };
  }, []);

  function iniciarBloqueo(segundos: number) {
    setSegundosRestantes(segundos);
    if (intervaloRef.current) clearInterval(intervaloRef.current);
    intervaloRef.current = setInterval(() => {
      setSegundosRestantes((actual) => {
        if (actual <= 1) {
          if (intervaloRef.current) clearInterval(intervaloRef.current);
          return 0;
        }
        return actual - 1;
      });
    }, 1000);
  }

  function seleccionarUsuario(usuario: UsuarioPin) {
    usuarioEnCursoRef.current = usuario.id;
    setUsuarioSeleccionado(usuario);
    setPin("");
    setError(null);
  }

  function cambiarUsuario() {
    if (enviando) return;
    usuarioEnCursoRef.current = null;
    setUsuarioSeleccionado(null);
    setPin("");
    setError(null);
    setEnviando(false);
    if (intervaloRef.current) clearInterval(intervaloRef.current);
    setSegundosRestantes(0);
  }

  function agregarDigito(digito: string) {
    if (enviando || segundosRestantes > 0) return;
    if (pin.length >= PIN_MAX) return;
    setError(null);
    setPin((actual) => actual + digito);
  }

  function borrarDigito() {
    if (enviando || segundosRestantes > 0) return;
    setPin((actual) => actual.slice(0, -1));
  }

  async function confirmarPin() {
    if (!usuarioSeleccionado || pin.length < PIN_MIN || enviando || segundosRestantes > 0) return;
    const usuarioId = usuarioSeleccionado.id;
    const rolUsuario = usuarioSeleccionado.rol;
    setEnviando(true);
    setError(null);

    if (useConectividadStore.getState().estado === "offline") {
      const resultado = await verificarPinLocal(usuarioId, pin);
      if (usuarioEnCursoRef.current !== usuarioId) return;
      if (resultado.tipo === "sin_credencial_local") {
        setError("No hay una entrada guardada para este usuario en este equipo.");
        setPin("");
        setEnviando(false);
        return;
      }
      if (resultado.tipo === "bloqueado") {
        setError(`Demasiados intentos. Espera ${resultado.segundosRestantes} segundos.`);
        setPin("");
        iniciarBloqueo(resultado.segundosRestantes);
        setEnviando(false);
        return;
      }
      if (resultado.tipo === "incorrecto") {
        setError("PIN incorrecto. Intenta de nuevo.");
        setPin("");
        setEnviando(false);
        return;
      }
      // resultado.tipo === "correcto"
      useSesionOfflineStore.getState().iniciar({
        usuarioId,
        nombre: usuarioSeleccionado.nombre,
        rol: resultado.identidad.rol,
        sedeId: resultado.identidad.sedeId,
      });
      router.push(rutaPorRol(rolUsuario));
      return;
    }

    try {
      const respuesta = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario_id: usuarioId, pin }),
      });
      const datos = await respuesta.json().catch(() => ({}));

      // Si el usuario cambió mientras la petición estaba en vuelo, esta
      // respuesta ya no aplica a la selección actual.
      if (usuarioEnCursoRef.current !== usuarioId) return;

      if (respuesta.status === 200) {
        const supabase = createClient();
        const { error: sesionError } = await supabase.auth.setSession({
          access_token: datos.access_token,
          refresh_token: datos.refresh_token,
        });
        if (usuarioEnCursoRef.current !== usuarioId) return;
        if (sesionError) {
          setError("No se pudo iniciar sesión. Intenta de nuevo.");
          setPin("");
          setEnviando(false);
          return;
        }

        try {
          await marcarPinValidado();
          if (usuarioEnCursoRef.current !== usuarioId) return;
          if (rolUsuario === "cajera" || rolUsuario === "admin") {
            await guardarIdentidad({
              usuarioId,
              nombre: usuarioSeleccionado.nombre,
              rol: rolUsuario,
              sedeId: datos.sede_id,
              pinHash: datos.pin_hash,
              refreshToken: datos.refresh_token,
            });
            useSesionOfflineStore.getState().iniciar({
              usuarioId,
              nombre: usuarioSeleccionado.nombre,
              rol: rolUsuario,
              sedeId: datos.sede_id,
            });
            // La cookie pin_validado ya quedó fijada por marcarPinValidado()
            // -- este es uno de los dos únicos momentos en que se puede
            // precargar con certeza de que las rutas protegidas no
            // redirigen (ver lib/offline/precargaRutas.ts). No se espera
            // (fire-and-forget): no debe demorar la navegación normal.
            precargarRutasOffline();
          }
          router.push(rutaPorRol(rolUsuario));
        } catch {
          // scope "local": no revocar sesiones del usuario en otros
          // dispositivos (equipo compartido de POS).
          await supabase.auth.signOut({ scope: "local" });
          if (usuarioEnCursoRef.current !== usuarioId) return;
          setError(
            "Tu PIN es correcto, pero no pudimos completar el ingreso. Inténtalo de nuevo.",
          );
          setPin("");
          setEnviando(false);
        }
        return;
      }

      if (respuesta.status === 401) {
        setError("PIN incorrecto. Intenta de nuevo.");
        setPin("");
        setEnviando(false);
        return;
      }

      if (respuesta.status === 429) {
        const segundosCrudo = Number(datos.segundos_restantes);
        const segundos = Number.isFinite(segundosCrudo) && segundosCrudo > 0 ? segundosCrudo : 60;
        setError(`Demasiados intentos. Espera ${segundos} segundos.`);
        setPin("");
        iniciarBloqueo(segundos);
        setEnviando(false);
        return;
      }

      setError("Ocurrió un error. Intenta de nuevo.");
      setPin("");
      setEnviando(false);
    } catch {
      if (usuarioEnCursoRef.current !== usuarioId) return;
      setError("No pudimos conectar con el servidor. Revisa tu conexión.");
      setPin("");
      setEnviando(false);
    }
  }

  const padDeshabilitado = enviando || segundosRestantes > 0;

  return (
    <ClayCard className="w-full max-w-md">
      {!usuarioSeleccionado ? (
        <div className="flex flex-col gap-6">
          <h1 className="text-center font-display text-2xl font-semibold text-text-primary">
            ¿Quién eres?
          </h1>
          {usuarios.length === 0 ? (
            <p className="text-center text-base text-text-secondary">
              No hay usuarios activos en esta sede.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {usuarios.map((usuario) => (
                <button
                  key={usuario.id}
                  type="button"
                  onClick={() => seleccionarUsuario(usuario)}
                  className={cn(
                    "flex min-h-[48px] flex-col items-center gap-2 rounded-clay-md bg-surface-elevated p-4",
                    "shadow-clay-sm transition-all duration-150 hover:shadow-clay-md",
                    "active:shadow-clay-pressed active:translate-y-px",
                    "focus-visible:outline-3 focus-visible:outline-brand-mostaza focus-visible:outline-offset-2",
                  )}
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-mostaza font-display text-2xl font-semibold text-brand-chocolate">
                    {usuario.nombre.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-base font-medium text-text-primary">{usuario.nombre}</span>
                  <span className="text-sm text-text-secondary">{ROL_LABEL[usuario.rol]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="text-center">
            <p className="text-sm text-text-secondary">Ingresa tu PIN</p>
            <h1 className="font-display text-2xl font-semibold text-text-primary">
              {usuarioSeleccionado.nombre}
            </h1>
          </div>

          <div
            className="flex justify-center gap-3"
            role="status"
            aria-label={`${pin.length} de ${PIN_MAX} dígitos ingresados`}
          >
            {Array.from({ length: PIN_MAX }).map((_, indice) => (
              <span
                key={indice}
                className={cn(
                  "h-4 w-4 rounded-full border-2 border-brand-chocolate/40",
                  indice < pin.length && "border-brand-mostaza bg-brand-mostaza",
                )}
                aria-hidden="true"
              />
            ))}
          </div>

          {error ? (
            <p className="text-center text-sm font-medium text-brand-tomate" role="alert">
              {error}
            </p>
          ) : null}

          <div className="grid grid-cols-3 gap-3">
            {DIGITOS.map((digito) => (
              <ClayButton
                key={digito}
                type="button"
                variant="secondary"
                size="xl"
                disabled={padDeshabilitado}
                onClick={() => agregarDigito(digito)}
                aria-label={`Dígito ${digito}`}
              >
                {digito}
              </ClayButton>
            ))}
            <ClayButton
              type="button"
              variant="secondary"
              size="xl"
              disabled={padDeshabilitado || pin.length === 0}
              onClick={borrarDigito}
              aria-label="Borrar dígito"
            >
              Borrar
            </ClayButton>
            <ClayButton
              type="button"
              variant="secondary"
              size="xl"
              disabled={padDeshabilitado}
              onClick={() => agregarDigito("0")}
              aria-label="Dígito 0"
            >
              0
            </ClayButton>
            <ClayButton
              type="button"
              variant="primary"
              size="xl"
              disabled={padDeshabilitado || pin.length < PIN_MIN}
              onClick={confirmarPin}
              aria-label="Confirmar PIN"
            >
              {enviando ? "…" : "Entrar"}
            </ClayButton>
          </div>

          <ClayButton
            type="button"
            variant="secondary"
            size="md"
            disabled={enviando}
            onClick={cambiarUsuario}
          >
            Cambiar de usuario
          </ClayButton>
        </div>
      )}
    </ClayCard>
  );
}
