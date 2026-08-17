"use client";

import { ELEMENT_COLORS, isTextElement, type MoodboardElement } from "@/types/moodboard";

interface ElementMenuProps {
  element: MoodboardElement;
  /** Coordenadas de pantalla (clientX/clientY) — el menú vive en un portal
   * visual fijo, fuera del transform de pan/zoom del canvas. */
  x: number;
  y: number;
  onClose: () => void;
  onDuplicate: () => void;
  onColor: (color: string | null) => void;
  onBringToFront: () => void;
  onEditNote: () => void;
  onOpenSource: () => void;
  onUseAsProposal: () => void;
  onDelete: () => void;
}

const MENU_WIDTH = 232;

export default function ElementMenu({
  element,
  x,
  y,
  onClose,
  onDuplicate,
  onColor,
  onBringToFront,
  onEditNote,
  onOpenSource,
  onUseAsProposal,
  onDelete,
}: ElementMenuProps) {
  const isText = isTextElement(element.type);
  const hasFile = Boolean(element.url);
  const source = element.url ?? element.embedUrl;

  // Que no se salga de la ventana cuando se abre cerca del borde.
  const left = Math.min(x, window.innerWidth - MENU_WIDTH - 12);
  const top = Math.min(y, window.innerHeight - 320);

  return (
    <>
      <div className="fixed inset-0 z-40" onPointerDown={onClose} onContextMenu={(e) => e.preventDefault()} />
      <div
        style={{ left, top, width: MENU_WIDTH }}
        className="glass-strong fixed z-50 flex flex-col gap-0.5 rounded border border-line-2 p-1.5 shadow-lg"
      >
        {isText && <MenuRow label="Editar texto" onClick={onEditNote} />}
        <MenuRow label="Duplicar" onClick={onDuplicate} />
        <MenuRow label="Traer al frente" onClick={onBringToFront} />
        {source && <MenuRow label="Abrir en pestaña nueva" onClick={onOpenSource} />}

        <div className="my-1 h-px bg-line" />

        <div className="px-2 py-1 text-[10px] tracking-label text-tx-3 uppercase">Etiqueta</div>
        <div className="flex items-center gap-1.5 px-2 pb-1">
          {ELEMENT_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              onClick={() => onColor(color.value)}
              title={color.label}
              aria-label={color.label}
              style={{ background: color.value }}
              className={`h-5 w-5 rounded-full transition-transform duration-150 hover:scale-110 ${
                element.color === color.value ? "ring-2 ring-brand-blue ring-offset-2 ring-offset-[var(--bg)]" : ""
              }`}
            />
          ))}
          <button
            type="button"
            onClick={() => onColor(null)}
            title="Sin etiqueta"
            aria-label="Sin etiqueta"
            className="flex h-5 w-5 items-center justify-center rounded-full border border-line-2 text-[10px] leading-none text-tx-3 transition-transform duration-150 hover:scale-110"
          >
            ×
          </button>
        </div>

        {hasFile && (
          <>
            <div className="my-1 h-px bg-line" />
            <MenuRow label="Usar como base para una propuesta" onClick={onUseAsProposal} accent />
          </>
        )}

        <div className="my-1 h-px bg-line" />
        <MenuRow label="Eliminar" onClick={onDelete} danger />
      </div>
    </>
  );
}

function MenuRow({
  label,
  onClick,
  danger,
  accent,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2 py-1.5 text-left text-xs transition-colors duration-[400ms] hover:bg-panel-2 ${
        danger ? "text-brand-red" : accent ? "font-bold text-brand-blue" : "text-tx-2"
      }`}
    >
      {label}
    </button>
  );
}
