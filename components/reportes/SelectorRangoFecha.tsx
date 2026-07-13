"use client";

import { useState } from "react";
import { addDays } from "date-fns";
import { ClayButton } from "@/components/ui/ClayButton";
import { ClayInput } from "@/components/ui/ClayInput";
import { resolverRangoPreset, type PresetRango, type RangoFechas } from "@/lib/reportes/rangosFecha";

const PRESETS: { valor: PresetRango; etiqueta: string }[] = [
  { valor: "dia", etiqueta: "Hoy" },
  { valor: "semana", etiqueta: "Esta semana" },
  { valor: "mes", etiqueta: "Este mes" },
  { valor: "anio", etiqueta: "Este año" },
];

interface SelectorRangoFechaProps {
  onCambiar: (rango: RangoFechas) => void;
}

export function SelectorRangoFecha({ onCambiar }: SelectorRangoFechaProps) {
  const [modo, setModo] = useState<PresetRango | "libre">("mes");
  const [desdeLibre, setDesdeLibre] = useState("");
  const [hastaLibre, setHastaLibre] = useState("");

  function elegirPreset(preset: PresetRango) {
    setModo(preset);
    onCambiar(resolverRangoPreset(preset));
  }

  function aplicarLibre() {
    if (!desdeLibre || !hastaLibre) return;
    setModo("libre");
    const desde = new Date(`${desdeLibre}T00:00:00-05:00`);
    const hastaInclusive = new Date(`${hastaLibre}T00:00:00-05:00`);
    onCambiar({ desde, hasta: addDays(hastaInclusive, 1) });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      {PRESETS.map((p) => (
        <ClayButton
          key={p.valor}
          type="button"
          variant={modo === p.valor ? "primary" : "secondary"}
          size="sm"
          onClick={() => elegirPreset(p.valor)}
        >
          {p.etiqueta}
        </ClayButton>
      ))}
      <div className="flex items-end gap-2">
        <ClayInput label="Desde" type="date" value={desdeLibre} onChange={(e) => setDesdeLibre(e.target.value)} />
        <ClayInput label="Hasta" type="date" value={hastaLibre} onChange={(e) => setHastaLibre(e.target.value)} />
        <ClayButton
          type="button"
          variant={modo === "libre" ? "primary" : "secondary"}
          size="sm"
          onClick={aplicarLibre}
        >
          Aplicar
        </ClayButton>
      </div>
    </div>
  );
}
