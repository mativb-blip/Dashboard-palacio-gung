"use client";

import { DEFAULT_TEXT_SIZE, TEXT_SIZES, type TextAlign } from "@/lib/dashboard/rich-text";
import type { MoodboardElement } from "@/types/moodboard";

/** Colores de letra. El primero ("Automático") deja que el elemento use el
 * color que le corresponde por su tipo (tinta en el post-it, texto normal en
 * el panel), en vez de clavar un hex. */
const TEXT_COLORS = [
  { value: null, label: "Automático", swatch: "currentColor" },
  { value: "#E81F35", label: "Rojo" },
  { value: "#F0A202", label: "Ámbar" },
  { value: "#2E9E5B", label: "Verde" },
  { value: "#163F6B", label: "Azul" },
  { value: "#8A8A8A", label: "Gris" },
] as const;

interface TextFormatToolbarProps {
  element: MoodboardElement;
  /** Ejecuta un comando inline (negrita, cursiva, listas…) sobre la selección
   * actual del contentEditable. */
  onInlineCommand: (command: string) => void;
  onFontSize: (size: number) => void;
  onAlign: (align: TextAlign) => void;
  onColor: (color: string | null) => void;
  onDone: () => void;
}

/** Barra de formato del texto — aparece mientras se edita un post-it o una
 * ventana de texto. Se posiciona en pantalla (fixed) y no dentro del canvas:
 * así no la deforma el zoom ni la rotación del elemento. */
export default function TextFormatToolbar({
  element,
  onInlineCommand,
  onFontSize,
  onAlign,
  onColor,
  onDone,
}: TextFormatToolbarProps) {
  const size = element.fontSize ?? DEFAULT_TEXT_SIZE;
  const align = element.textAlign ?? "left";

  return (
    <div
      // mousedown/pointerdown con preventDefault: sin esto, apretar un botón
      // saca el foco del contentEditable y se pierde la selección justo antes
      // de aplicarle el formato.
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
      className="flex flex-wrap items-center gap-1 rounded border border-line-2 bg-[var(--bg)]/95 p-1.5 shadow-lg backdrop-blur"
    >
      <Group>
        <FormatButton label="Negrita" onClick={() => onInlineCommand("bold")}>
          <span className="font-bold">B</span>
        </FormatButton>
        <FormatButton label="Cursiva" onClick={() => onInlineCommand("italic")}>
          <span className="font-serif italic">I</span>
        </FormatButton>
        <FormatButton label="Subrayado" onClick={() => onInlineCommand("underline")}>
          <span className="underline">U</span>
        </FormatButton>
        <FormatButton label="Tachado" onClick={() => onInlineCommand("strikeThrough")}>
          <span className="line-through">S</span>
        </FormatButton>
      </Group>

      <Divider />

      <Group>
        <FormatButton label="Lista con viñetas" onClick={() => onInlineCommand("insertUnorderedList")}>
          <BulletsIcon />
        </FormatButton>
        <FormatButton label="Lista numerada" onClick={() => onInlineCommand("insertOrderedList")}>
          <NumbersIcon />
        </FormatButton>
      </Group>

      <Divider />

      <Group>
        {TEXT_SIZES.map((option) => (
          <FormatButton
            key={option.value}
            label={`Tamaño ${option.label}`}
            active={size === option.value}
            onClick={() => onFontSize(option.value)}
          >
            {option.label}
          </FormatButton>
        ))}
      </Group>

      <Divider />

      <Group>
        {(["left", "center", "right"] as TextAlign[]).map((value) => (
          <FormatButton
            key={value}
            label={`Alinear ${value === "left" ? "izquierda" : value === "center" ? "centro" : "derecha"}`}
            active={align === value}
            onClick={() => onAlign(value)}
          >
            <AlignIcon align={value} />
          </FormatButton>
        ))}
      </Group>

      <Divider />

      <Group>
        {TEXT_COLORS.map((color) => (
          <button
            key={color.label}
            type="button"
            onClick={() => onColor(color.value)}
            title={color.label}
            aria-label={`Color ${color.label}`}
            style={color.value ? { background: color.value } : undefined}
            className={`h-5 w-5 rounded-full border transition-transform duration-150 hover:scale-110 ${
              color.value ? "border-black/20" : "border-line-2 bg-panel-2"
            } ${
              (element.textColor ?? null) === color.value
                ? "ring-2 ring-brand-blue ring-offset-1 ring-offset-[var(--bg)]"
                : ""
            }`}
          >
            {!color.value && <span className="text-[9px] font-bold text-tx-3">A</span>}
          </button>
        ))}
      </Group>

      <Divider />

      <button
        type="button"
        onClick={onDone}
        className="rounded bg-brand-blue px-2.5 py-1 text-[10px] font-bold tracking-label text-[var(--bg)] uppercase"
      >
        Listo
      </button>
    </div>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-line" />;
}

function FormatButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-6 min-w-6 items-center justify-center rounded px-1 text-[11px] leading-none transition-colors duration-[200ms] ${
        active ? "bg-brand-blue text-[var(--bg)]" : "text-tx-2 hover:bg-panel-2 hover:text-brand-blue"
      }`}
    >
      {children}
    </button>
  );
}

function AlignIcon({ align }: { align: TextAlign }) {
  // La línea corta cambia de lado según la alineación — se lee de un vistazo.
  const short = align === "left" ? "M3 12h10" : align === "center" ? "M7 12h10" : "M11 12h10";
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 6h18" />
      <path d={short} />
      <path d="M3 18h18" />
    </svg>
  );
}

function BulletsIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <circle cx="3.5" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function NumbersIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M9 6h12" />
      <path d="M9 12h12" />
      <path d="M9 18h12" />
      <path d="M3 6h1.5v4" strokeWidth="1.5" />
      <path d="M3 12.5h2v1.5H3.5V16H5" strokeWidth="1.5" />
    </svg>
  );
}
