"use client";

import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { DEFAULT_TEXT_SIZE, sanitizeRichText } from "@/lib/dashboard/rich-text";
import { isTextElement, toEmbedSrc, type MoodboardElement } from "@/types/moodboard";

/** Listas y saltos de línea dentro del texto con formato. Tailwind resetea
 * los marcadores de <ul>/<ol>, así que hay que devolvérselos acá; el
 * whitespace-pre-wrap mantiene los saltos de las notas viejas, que se
 * guardaron como texto plano antes de que existiera el editor. */
const RICH_TEXT_CLASS =
  "whitespace-pre-wrap [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-0.5";

/** Las 8 asas de redimensión. `sx`/`sy` dicen qué borde mueve cada una
 * (-1 = el de arriba/izquierda, 1 = el de abajo/derecha, 0 = ese eje no se
 * toca) — la matemática del resize las usa tal cual, ver applyResize en
 * MoodboardCanvas. */
export const RESIZE_HANDLES = [
  { key: "nw", sx: -1, sy: -1, cursor: "nwse-resize", pos: "top-0 left-0 -translate-x-1/2 -translate-y-1/2" },
  { key: "n", sx: 0, sy: -1, cursor: "ns-resize", pos: "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2" },
  { key: "ne", sx: 1, sy: -1, cursor: "nesw-resize", pos: "top-0 right-0 translate-x-1/2 -translate-y-1/2" },
  { key: "e", sx: 1, sy: 0, cursor: "ew-resize", pos: "top-1/2 right-0 translate-x-1/2 -translate-y-1/2" },
  { key: "se", sx: 1, sy: 1, cursor: "nwse-resize", pos: "bottom-0 right-0 translate-x-1/2 translate-y-1/2" },
  { key: "s", sx: 0, sy: 1, cursor: "ns-resize", pos: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2" },
  { key: "sw", sx: -1, sy: 1, cursor: "nesw-resize", pos: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2" },
  { key: "w", sx: -1, sy: 0, cursor: "ew-resize", pos: "top-1/2 left-0 -translate-x-1/2 -translate-y-1/2" },
] as const;

export type ResizeHandle = (typeof RESIZE_HANDLES)[number];

interface CanvasItemProps {
  element: MoodboardElement;
  selected: boolean;
  /** Es el ÚNICO seleccionado: solo entonces se muestran las asas de tamaño
   * y rotación (con varios elegidos el gesto disponible es mover el grupo). */
  soloSelected: boolean;
  /** Solo para video-embed: deja pasar el mouse al iframe. Mientras está en
   * false una capa transparente lo tapa, así el elemento se puede arrastrar
   * desde cualquier punto (un iframe se come todos los eventos). */
  interactive: boolean;
  editing: boolean;
  /** Inverso del zoom — mantiene asas y bordes del mismo grosor en pantalla
   * sin importar cuánto se acercó la vista. */
  inverseScale: number;
  /** El canvas guarda acá el nodo del editor activo para poder aplicarle los
   * comandos de la barra de formato (negrita, listas…) sobre la selección. */
  editorRef: RefObject<HTMLDivElement | null>;
  onPointerDownBody: (e: ReactPointerEvent<HTMLElement>, element: MoodboardElement) => void;
  onPointerDownHandle: (
    e: ReactPointerEvent<HTMLElement>,
    element: MoodboardElement,
    handle: ResizeHandle,
  ) => void;
  onPointerDownRotate: (e: ReactPointerEvent<HTMLElement>, element: MoodboardElement) => void;
  onOpenMenu: (clientX: number, clientY: number, element: MoodboardElement) => void;
  onCommitText: (id: string, text: string) => void;
  onEndEdit: () => void;
  onStartEdit: (id: string) => void;
  onToggleInteractive: (id: string) => void;
}

export default function CanvasItem({
  element,
  selected,
  soloSelected,
  interactive,
  editing,
  inverseScale,
  editorRef,
  onPointerDownBody,
  onPointerDownHandle,
  onPointerDownRotate,
  onOpenMenu,
  onCommitText,
  onEndEdit,
  onStartEdit,
  onToggleInteractive,
}: CanvasItemProps) {
  const isNote = element.type === "text-note";
  const isText = isTextElement(element.type);
  const isEmbed = element.type === "video-embed";
  const embedSrc = isEmbed && element.embedUrl ? toEmbedSrc(element.embedUrl) : null;

  const textStyle = {
    fontSize: element.fontSize ?? DEFAULT_TEXT_SIZE,
    textAlign: element.textAlign ?? "left",
    color: element.textColor || undefined,
  } as const;

  return (
    <div
      data-el-id={element.id}
      style={{
        transform: `translate3d(${element.x}px, ${element.y}px, 0) rotate(${element.rotation}deg)`,
        width: element.width,
        height: element.height,
        zIndex: element.zIndex,
      }}
      className="group absolute top-0 left-0 will-change-transform"
      onPointerDown={(e) => onPointerDownBody(e, element)}
      onContextMenu={(e) => {
        e.preventDefault();
        onOpenMenu(e.clientX, e.clientY, element);
      }}
      onDoubleClick={() => {
        if (isText) onStartEdit(element.id);
      }}
    >
      <div
        className={`relative h-full w-full overflow-hidden rounded ${
          isNote
            ? "bg-[#F5E9A9] text-[#1A1A1A] shadow-md"
            : element.type === "text-panel"
              ? "border border-line-2 bg-panel-2 text-brand-ink shadow-sm"
              : "bg-panel-2 shadow-sm"
        }`}
      >
        {element.type === "image" && element.url && (
          // eslint-disable-next-line @next/next/no-img-element -- referencia cargada por el usuario, no un asset del sitio
          <img
            src={element.url}
            alt={element.filename ?? "Referencia"}
            draggable={false}
            className="pointer-events-none h-full w-full object-cover select-none"
          />
        )}

        {element.type === "video" && element.url && (
          // Preview mudo en loop (sin `controls`): en un tablero el video es
          // una referencia visual, y los controles nativos competirían con el
          // arrastre por el mismo pointerdown. Para verlo completo está
          // "Abrir en pestaña nueva" en el menú contextual.
          <video
            src={element.url}
            muted
            loop
            playsInline
            autoPlay
            className="pointer-events-none h-full w-full object-cover"
          />
        )}

        {isEmbed && (
          <div className="relative h-full w-full bg-panel-2">
            {embedSrc ? (
              <iframe
                src={embedSrc}
                className="h-full w-full"
                style={{ border: 0 }}
                allow="autoplay; encrypted-media; fullscreen"
                allowFullScreen
                scrolling="no"
                title={element.embedUrl ?? "Video"}
              />
            ) : (
              <LinkCard url={element.embedUrl ?? ""} />
            )}
            {!interactive && <div className="absolute inset-0" aria-hidden />}
          </div>
        )}

        {isText &&
          (editing ? (
            <RichTextEditor
              editorRef={editorRef}
              initialHtml={element.text ?? ""}
              style={textStyle}
              onChange={(html) => onCommitText(element.id, html)}
              onDone={onEndEdit}
            />
          ) : element.text ? (
            <div
              style={textStyle}
              className={`h-full w-full overflow-hidden p-3 leading-relaxed ${RICH_TEXT_CLASS}`}
              // Saneado en el servidor al leer y al escribir (ver
              // sanitizeRichText); se repite acá por si el HTML llegó por
              // otro camino — es barato y es la última línea antes del DOM.
              dangerouslySetInnerHTML={{ __html: sanitizeRichText(element.text) }}
            />
          ) : (
            <p style={textStyle} className="h-full w-full p-3 leading-relaxed opacity-40">
              Doble clic para escribir…
            </p>
          ))}

        {element.color && (
          <span
            aria-hidden
            style={{ background: element.color, transform: `scale(${inverseScale})` }}
            className="absolute top-1.5 left-1.5 h-2.5 w-2.5 origin-top-left rounded-full ring-2 ring-black/20"
          />
        )}
      </div>

      {/* Chrome de selección — fuera del contenedor con overflow-hidden para
          que las asas puedan sobresalir del borde. */}
      <div
        aria-hidden={!selected}
        className={`pointer-events-none absolute inset-0 rounded transition-opacity duration-150 ${
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-60"
        }`}
        style={{ outline: `${2 * inverseScale}px solid var(--color-brand-blue)`, outlineOffset: 0 }}
      />

      {soloSelected && (
        <>
          {RESIZE_HANDLES.map((handle) => (
            <span
              key={handle.key}
              onPointerDown={(e) => onPointerDownHandle(e, element, handle)}
              style={{ cursor: handle.cursor, transform: `scale(${inverseScale})` }}
              className={`absolute ${handle.pos} h-2.5 w-2.5 rounded-[2px] border border-brand-blue bg-[var(--bg)]`}
            />
          ))}

          <span
            onPointerDown={(e) => onPointerDownRotate(e, element)}
            title="Rotar"
            style={{ transform: `translateX(-50%) scale(${inverseScale})`, top: -28 * inverseScale }}
            className="absolute left-1/2 flex h-4 w-4 cursor-grab items-center justify-center rounded-full border border-brand-blue bg-[var(--bg)] text-brand-blue"
          >
            <RotateIcon />
          </span>

          <div
            style={{ transform: `scale(${inverseScale})`, bottom: -30 * inverseScale }}
            className="absolute right-0 flex origin-bottom-right items-center gap-1"
          >
            {isEmbed && embedSrc && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onToggleInteractive(element.id)}
                className={`rounded border px-2 py-1 text-[10px] font-bold tracking-label uppercase ${
                  interactive
                    ? "border-brand-blue bg-brand-blue text-[var(--bg)]"
                    : "border-line-2 bg-[var(--bg)] text-tx-2"
                }`}
              >
                {interactive ? "Interactuando" : "Interactuar"}
              </button>
            )}
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => onOpenMenu(e.clientX, e.clientY, element)}
              aria-label="Opciones del elemento"
              className="flex h-6 w-6 items-center justify-center rounded border border-line-2 bg-[var(--bg)] text-tx-2 hover:border-brand-blue hover:text-brand-blue"
            >
              <DotsIcon />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Superficie de edición del texto con formato.
 *
 * El HTML inicial se inyecta UNA sola vez al montar y después el DOM queda
 * fuera del control de React: si re-renderizáramos el contenido en cada
 * tecleo (que es cuando se guarda), el cursor saltaría al principio en cada
 * letra. React solo vuelve a montar esto cuando cambia el elemento editado. */
function RichTextEditor({
  editorRef,
  initialHtml,
  style,
  onChange,
  onDone,
}: {
  editorRef: RefObject<HTMLDivElement | null>;
  initialHtml: string;
  style: React.CSSProperties;
  onChange: (html: string) => void;
  onDone: () => void;
}) {
  const localRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = localRef.current;
    if (!node) return;
    node.innerHTML = sanitizeRichText(initialHtml);
    editorRef.current = node;
    node.focus();

    // Cursor al final de lo que ya había escrito, no al principio.
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    return () => {
      if (editorRef.current === node) editorRef.current = null;
    };
    // Solo al montar: ver el comentario de arriba.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={localRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label="Contenido del texto"
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
      onInput={(e) => onChange(sanitizeRichText(e.currentTarget.innerHTML))}
      onKeyDown={(e) => {
        // Escape cierra la edición; el resto de las teclas (incluido Delete)
        // tiene que quedarse acá y no llegar a los atajos del canvas.
        e.stopPropagation();
        if (e.key === "Escape") {
          e.currentTarget.blur();
          onDone();
        }
      }}
      className={`h-full w-full overflow-y-auto p-3 leading-relaxed outline-none ${RICH_TEXT_CLASS}`}
    />
  );
}

/** Fallback para links sin iframe libre (TikTok, o cualquier URL que no
 * reconozcamos): tarjeta con el dominio y un enlace real. */
function LinkCard({ url }: { url: string }) {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // URL mal formada — mostramos el texto crudo, no rompemos el canvas.
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center">
      <LinkIcon />
      <span className="text-[11px] tracking-label text-tx-3 uppercase">{host}</span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onPointerDown={(e) => e.stopPropagation()}
        className="max-w-full truncate text-xs font-bold text-brand-blue underline"
      >
        Abrir link
      </a>
    </div>
  );
}

function RotateIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-tx-3">
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </svg>
  );
}
