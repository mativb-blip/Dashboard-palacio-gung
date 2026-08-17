"use client";

import { useState } from "react";
import { PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import { EXPORT_DPI, PAPER_PRESETS, paperSize, type Orientation, type PaperPreset } from "./export-image";

interface ExportDialogProps {
  onCancel: () => void;
  onConfirm: (preset: PaperPreset, orientation: Orientation) => void;
}

/** Primer paso de la exportación: elegir hoja y orientación. Después de
 * aceptar, el canvas muestra el recuadro rojo para encuadrar (ver
 * MoodboardCanvas). */
export default function ExportDialog({ onCancel, onConfirm }: ExportDialogProps) {
  const [preset, setPreset] = useState<PaperPreset>(PAPER_PRESETS[0]);
  const [orientation, setOrientation] = useState<Orientation>("vertical");

  const { widthIn, heightIn } = paperSize(preset, orientation);

  return (
    <div
      className="modal-backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="glass-strong modal-card-in flex w-full max-w-[380px] flex-col overflow-hidden rounded-lg border border-line-2 font-sans text-brand-ink shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-sm font-bold">Exportar como imagen</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cerrar"
            className={`text-lg leading-none text-tx-3 transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-4 p-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[11px] tracking-label text-tx-3 uppercase">Tamaño</legend>
            {PAPER_PRESETS.map((option) => (
              <OptionRow
                key={option.key}
                label={option.label}
                selected={preset.key === option.key}
                onSelect={() => setPreset(option)}
              />
            ))}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[11px] tracking-label text-tx-3 uppercase">Orientación</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["vertical", "horizontal"] as Orientation[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setOrientation(value)}
                  aria-pressed={orientation === value}
                  className={`flex flex-col items-center gap-2 rounded border px-3 py-3 text-xs font-bold transition-colors duration-[400ms] ${PRESS_SCALE_CLASS} ${
                    orientation === value
                      ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                      : "border-line-2 bg-panel-2 text-tx-2 hover:border-brand-blue"
                  }`}
                >
                  <span
                    aria-hidden
                    style={{
                      width: value === "vertical" ? 22 : 30,
                      height: value === "vertical" ? 30 : 22,
                    }}
                    className="rounded-sm border-2 border-current"
                  />
                  {value === "vertical" ? "Vertical" : "Horizontal"}
                </button>
              ))}
            </div>
          </fieldset>

          <p className="rounded border border-line-2 bg-panel-2 px-3 py-2 text-[11px] leading-relaxed text-tx-3">
            Se exporta a {widthIn} × {heightIn} pulgadas ·{" "}
            <span className="tabular-nums">
              {Math.round(widthIn * EXPORT_DPI)} × {Math.round(heightIn * EXPORT_DPI)} px
            </span>{" "}
            ({EXPORT_DPI} ppp).
          </p>

          <button
            type="button"
            onClick={() => onConfirm(preset, orientation)}
            className={`rounded bg-brand-blue px-4 py-2.5 text-xs font-bold tracking-label text-[var(--bg)] uppercase ${PRESS_SCALE_CLASS}`}
          >
            Continuar y encuadrar
          </button>
        </div>
      </div>
    </div>
  );
}

function OptionRow({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex items-center gap-2.5 rounded border px-3 py-2.5 text-left text-sm transition-colors duration-[400ms] ${PRESS_SCALE_CLASS} ${
        selected ? "border-brand-blue bg-brand-blue/10" : "border-line-2 bg-panel-2 hover:border-brand-blue"
      }`}
    >
      <span
        aria-hidden
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
          selected ? "border-brand-blue" : "border-line-2"
        }`}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-brand-blue" />}
      </span>
      {label}
    </button>
  );
}
