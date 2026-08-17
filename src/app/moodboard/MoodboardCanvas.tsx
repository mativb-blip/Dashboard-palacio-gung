"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { makeFileId, uploadBlob } from "@/components/dashboard/ArtUploadZone";
import { isHeic, toDisplayableFile } from "@/lib/dashboard/media-file";
import { sanitizeRichText, type TextAlign } from "@/lib/dashboard/rich-text";
import { PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import {
  DEFAULT_ELEMENT_SIZE,
  DEFAULT_EMBED_SIZE,
  DEFAULT_NOTE_SIZE,
  DEFAULT_PANEL_SIZE,
  detectEmbedProvider,
  fitMediaSize,
  isTextElement,
  MIN_ELEMENT_SIZE,
  type MoodboardElement,
  type MoodboardElementPatch,
  type MoodboardSessionDetail,
} from "@/types/moodboard";
import { createElement, deleteElement, duplicateElement, updateElements } from "./actions";
import CanvasItem, { type ResizeHandle } from "./CanvasItem";
import ElementMenu from "./ElementMenu";
import ExportDialog from "./ExportDialog";
import {
  captureFrameToBlob,
  effectiveDpi,
  paperSize,
  type Orientation,
  type PaperPreset,
} from "./export-image";
import TextFormatToolbar from "./TextFormatToolbar";
import UseAsProposalDialog from "./UseAsProposalDialog";

const MIN_SCALE = 0.15;
const MAX_SCALE = 3;
/** Los movimientos se juntan y se mandan en un solo update — arrastrar un
 * elemento dispararía ~60 escrituras por segundo si cada pixel guardara. */
const SAVE_DEBOUNCE_MS = 700;
/** Separación entre elementos al alinearlos en fila. */
const ARRANGE_GAP = 24;
/** Cuánto se puede mover un dedo y que el gesto siga contando como un toque
 * y no como un arrastre. */
const TAP_TOLERANCE_PX = 8;

interface ViewState {
  x: number;
  y: number;
  scale: number;
}

interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/** Un elemento que se está arrastrando. Con selección múltiple hay varios a
 * la vez y todos se mueven con el mismo delta. */
interface MoveTarget {
  id: string;
  node: HTMLElement;
  start: Geometry;
  live: Geometry;
}

type Interaction =
  | { kind: "pan"; pointerX: number; pointerY: number; viewX: number; viewY: number; moved: boolean }
  | { kind: "move"; pointerX: number; pointerY: number; targets: MoveTarget[]; moved: boolean }
  | {
      kind: "resize" | "rotate";
      id: string;
      node: HTMLElement;
      pointerX: number;
      pointerY: number;
      start: Geometry;
      live: Geometry;
      handle?: ResizeHandle;
      /** Solo resize: el elemento tiene una proporción propia que respetar
       * (imagen o video). Shift la libera. */
      lockAspect?: boolean;
      /** Solo rotate: ángulo del puntero respecto del centro al empezar. */
      grabAngle?: number;
      moved: boolean;
    };

/** Copia de un elemento en el portapapeles. Viaja como texto por el
 * portapapeles del sistema (con este prefijo delante del JSON) en vez de
 * quedarse en memoria: así copiar y pegar funciona entre pestañas y sobrevive
 * a un recargado. `dx`/`dy` son el desplazamiento respecto del primero, para
 * que al pegar un grupo conserve su disposición. */
const CLIPBOARD_PREFIX = "moodboard/v1:";

interface ClipboardElement {
  type: MoodboardElement["type"];
  dx: number;
  dy: number;
  width: number;
  height: number;
  rotation: number;
  url?: string;
  filename?: string;
  embedUrl?: string;
  text?: string;
  color?: string;
  fontSize?: number;
  textAlign?: MoodboardElement["textAlign"];
  textColor?: string;
}

interface UploadChip {
  id: string;
  name: string;
  progress: number;
  error?: string;
}

interface MoodboardCanvasProps {
  session: MoodboardSessionDetail;
  onElementCountChange: (count: number) => void;
}

const RAD = Math.PI / 180;

/** Escribe la geometría directo en el nodo. Durante un arrastre no pasamos
 * por React: son ~60 renders por segundo de todo el canvas, y acá alcanza con
 * tocar transform/width/height del elemento que se está moviendo (las únicas
 * propiedades que no disparan layout del resto). El commit a estado ocurre
 * una sola vez, al soltar. */
function paint(node: HTMLElement, g: Geometry) {
  node.style.transform = `translate3d(${g.x}px, ${g.y}px, 0) rotate(${g.rotation}deg)`;
  node.style.width = `${g.width}px`;
  node.style.height = `${g.height}px`;
}

export default function MoodboardCanvas({ session, onElementCountChange }: MoodboardCanvasProps) {
  const [elements, setElements] = useState<MoodboardElement[]>(session.elements);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  /** Modo de selección múltiple para touch: sin Shift disponible, cada toque
   * suma o saca de la selección mientras está activo. */
  const [multiSelect, setMultiSelect] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [interactiveId, setInteractiveId] = useState<string | null>(null);
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, scale: 1 });
  const [menu, setMenu] = useState<{ element: MoodboardElement; x: number; y: number } | null>(null);
  const [proposalFor, setProposalFor] = useState<MoodboardElement | null>(null);
  const [uploads, setUploads] = useState<UploadChip[]>([]);
  const [linkValue, setLinkValue] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  /** Exportación en dos pasos: "setup" elige hoja y orientación; "frame"
   * muestra el recuadro rojo y deja encuadrar con zoom antes de rasterizar. */
  const [exportStep, setExportStep] = useState<
    | { step: "setup" }
    | { step: "frame"; preset: PaperPreset; orientation: Orientation; busy: boolean }
    | null
  >(null);
  /** Tamaño del viewport, en estado y no medido durante el render: el
   * recuadro de exportación depende de él y tiene que seguir a la ventana. */
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  /** Mientras se dispara la captura no puede quedar nada de la interfaz
   * dentro del recuadro: ni el borde rojo, ni las barras flotantes, ni los
   * bordes de selección — todo eso terminaría impreso. */
  const [capturing, setCapturing] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Nodo del contentEditable que se está editando — la barra de formato lo
   * necesita para aplicar los comandos sobre la selección viva. */
  const editorRef = useRef<HTMLDivElement | null>(null);
  // Espejos del último valor, para leerlos desde callbacks que NO se re-crean
  // en cada render (listeners de window, el bucle de arrastre, temporizadores).
  // Se asignan en un efecto — más abajo, después de definir todo lo que
  // reflejan — y nunca durante el render: escribir un ref en el cuerpo del
  // componente rompe las garantías de React con render concurrente.
  const viewRef = useRef(view);
  const interactionRef = useRef<Interaction | null>(null);
  const pendingRef = useRef<Map<string, MoodboardElementPatch>>(new Map());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Última posición del puntero sobre el canvas — dónde cae lo que se pega
   * con ⌘V (el evento `paste` no trae coordenadas). */
  const pointerCanvasRef = useRef({ x: 200, y: 160 });
  /** Dedos apoyados sobre el lienzo. Hace falta llevar la cuenta para
   * distinguir un arrastre (uno) de un pellizco (dos): los eventos de puntero
   * llegan de a uno y no traen a los hermanos. */
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  /** Estado del pellizco en curso — todo se mide contra el instante en que
   * apoyó el segundo dedo, así el zoom no acumula error cuadro a cuadro.
   *
   * Dos modos según dónde caen los dedos: sobre algo ya seleccionado el
   * gesto escala ESE elemento (`targets`), y sobre el fondo mueve la vista. */
  const pinchRef = useRef<{
    startDist: number;
    startScale: number;
    startView: { x: number; y: number };
    startMid: { x: number; y: number };
    rect: { left: number; top: number };
    /** null = pellizco de vista (zoom del lienzo). */
    targets: MoveTarget[] | null;
    /** Límites del factor para que ningún elemento colapse ni se dispare. */
    minFactor: number;
    maxFactor: number;
  } | null>(null);
  /** Respaldo del portapapeles del sistema: si el navegador no deja leer o
   * escribir el clipboard (permisos), copiar/pegar sigue andando en la
   * pestaña. */
  const localClipboardRef = useRef<ClipboardElement[]>([]);


  // El contador de la barra de sesiones se sincroniza solo cuando cambia la
  // cantidad. El callback va por ref y NO en las dependencias: el padre lo
  // recrea en cada render, y tenerlo en la lista dispara el efecto → setState
  // en el padre → nuevo callback → efecto de nuevo (bucle infinito).
  const countCallbackRef = useRef(onElementCountChange);
  useEffect(() => {
    countCallbackRef.current(elements.length);
  }, [elements.length]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewportSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // ── Persistencia con debounce ───────────────────────────────────────────

  const flush = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!pendingRef.current.size) return;
    const patches = Object.fromEntries(pendingRef.current);
    pendingRef.current = new Map();
    try {
      await updateElements(session.id, patches);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron guardar los cambios.");
    }
  }, [session.id]);

  const queuePatch = useCallback(
    (id: string, patch: MoodboardElementPatch) => {
      const existing = pendingRef.current.get(id);
      pendingRef.current.set(id, { ...existing, ...patch });
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  const queuePatchRef = useRef(queuePatch);
  const flushRef = useRef(flush);
  // El listener de punteros vive fuera de React (se registra una sola vez):
  // necesita leer la selección y los elementos actuales sin re-registrarse.
  const selectedIdsRef = useRef(selectedIds);
  const elementsRef = useRef(elements);

  // Único punto donde se actualizan los espejos (ver el comentario de arriba):
  // sin lista de dependencias, corre después de cada render.
  useEffect(() => {
    viewRef.current = view;
    countCallbackRef.current = onElementCountChange;
    queuePatchRef.current = queuePatch;
    flushRef.current = flush;
    selectedIdsRef.current = selectedIds;
    elementsRef.current = elements;
  });

  // Al desmontar (cambio de sesión, salir de la página) va lo que quede
  // pendiente — sin esto se pierde el último movimiento antes del debounce.
  useEffect(() => {
    return () => {
      // Deliberadamente el valor MÁS RECIENTE, no el del montaje: es el que
      // conoce los cambios que todavía no se guardaron.
      void flushRef.current();
    };
  }, []);

  // ── Coordenadas ─────────────────────────────────────────────────────────

  const toCanvas = useCallback((clientX: number, clientY: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    const v = viewRef.current;
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left - v.x) / v.scale, y: (clientY - rect.top - v.y) / v.scale };
  }, []);

  /** Punto de canvas donde soltar algo nuevo, centrado en lo que se ve — para
   * el botón de Nota y el de link, que no tienen un punto de origen propio. */
  const viewCenter = useCallback(() => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return toCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }, [toCanvas]);

  // ── Alta de elementos ───────────────────────────────────────────────────

  const selectOnly = useCallback((id: string | null) => {
    setSelectedIds(id ? new Set([id]) : new Set());
  }, []);

  /** Suma o saca de la selección — Shift en desktop, modo multi en touch. */
  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const addElement = useCallback(
    async (input: Parameters<typeof createElement>[1]) => {
      try {
        const created = await createElement(session.id, input);
        setElements((prev) => [...prev, created]);
        selectOnly(created.id);
        return created;
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo agregar el elemento.");
        return null;
      }
    },
    [session.id, selectOnly],
  );

  /** Mide el archivo antes de subirlo para poder crear el elemento con la
   * proporción real. Si no se puede leer (formato raro, video sin metadatos),
   * cae al tamaño por defecto en vez de fallar la inserción. */
  const measureMedia = useCallback(async (file: File) => {
    if (file.type.startsWith("image/")) {
      try {
        const bitmap = await createImageBitmap(file);
        const size = fitMediaSize(bitmap.width, bitmap.height);
        bitmap.close();
        return size;
      } catch {
        return { ...DEFAULT_ELEMENT_SIZE };
      }
    }

    const objectUrl = URL.createObjectURL(file);
    try {
      return await new Promise<{ width: number; height: number }>((resolve) => {
        const probe = document.createElement("video");
        probe.preload = "metadata";
        probe.onloadedmetadata = () => resolve(fitMediaSize(probe.videoWidth, probe.videoHeight));
        probe.onerror = () => resolve({ ...DEFAULT_ELEMENT_SIZE });
        probe.src = objectUrl;
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }, []);

  const uploadAndAdd = useCallback(
    async (files: File[], at: { x: number; y: number }) => {
      // isHeic aparte: el iPhone a veces manda esos archivos con el tipo
      // vacío, y sin esto se descartaban en silencio.
      const media = files.filter(
        (f) => f.type.startsWith("image/") || f.type.startsWith("video/") || isHeic(f),
      );
      if (!media.length) return;
      setError("");

      // En cascada desde el punto de origen: dos archivos soltados juntos no
      // se apilan exactamente uno encima del otro.
      await Promise.all(
        media.map(async (file, index) => {
          const chipId = makeFileId();
          setUploads((prev) => [...prev, { id: chipId, name: file.name, progress: 0 }]);
          try {
            // Antes de subir: si es un HEIC del iPhone, se convierte a JPEG
            // (o se avisa). Sin esto se guardaba un archivo que después no
            // se ve en ningún navegador que no sea Safari.
            const usable = await toDisplayableFile(file);

            // Se mide en paralelo con la subida: son independientes y así no
            // se suma la espera de una a la de la otra.
            const [url, size] = await Promise.all([
              uploadBlob(`moodboard/${session.id}`, usable, (percentage) =>
                setUploads((prev) =>
                  prev.map((u) => (u.id === chipId ? { ...u, progress: Math.round(percentage) } : u)),
                ),
              ),
              measureMedia(usable),
            ]);
            await addElement({
              type: usable.type.startsWith("video/") ? "video" : "image",
              x: at.x + index * 28,
              y: at.y + index * 28,
              width: size.width,
              height: size.height,
              url,
              // El nombre ya convertido (.jpg), que es lo que quedó guardado.
              filename: usable.name,
            });
            setUploads((prev) => prev.filter((u) => u.id !== chipId));
          } catch (e) {
            const message = e instanceof Error ? e.message : "No se pudo subir el archivo.";
            setUploads((prev) => prev.map((u) => (u.id === chipId ? { ...u, error: message } : u)));
            setError(message);
          }
        }),
      );
    },
    [addElement, measureMedia, session.id],
  );

  /** Vuelca elementos copiados al tablero, conservando su disposición
   * relativa. Devuelve true si pegó algo. */
  const pasteClipboardElements = useCallback(
    async (copied: ClipboardElement[], at: { x: number; y: number }) => {
      if (!copied.length) return false;

      const created: MoodboardElement[] = [];
      for (const item of copied) {
        try {
          const element = await createElement(session.id, {
            type: item.type,
            x: at.x + item.dx,
            y: at.y + item.dy,
            width: item.width,
            height: item.height,
            url: item.url,
            filename: item.filename,
            embedUrl: item.embedUrl,
            text: item.text,
          });
          // createElement no toma rotación ni formato: se aplican como patch
          // (y se reflejan de una en el estado local, abajo).
          const extras = {
            rotation: item.rotation,
            color: item.color ?? null,
            fontSize: item.fontSize,
            textAlign: item.textAlign,
            textColor: item.textColor ?? null,
          };
          queuePatchRef.current(element.id, extras);
          created.push({ ...element, ...patchToLocal(extras) });
        } catch (e) {
          setError(e instanceof Error ? e.message : "No se pudo pegar el elemento.");
        }
      }

      if (!created.length) return false;
      setElements((prev) => [...prev, ...created]);
      setSelectedIds(new Set(created.map((el) => el.id)));
      return true;
    },
    [session.id],
  );

  /** Corazón del pegado: acepta archivos, elementos copiados del propio
   * tablero, links, HTML con formato y texto suelto — en ese orden de
   * preferencia. Lo usan tanto ⌘V como el botón "Pegar" de mobile. */
  const pasteContent = useCallback(
    async (
      data: { files: File[]; text: string; html: string },
      at: { x: number; y: number },
    ): Promise<boolean> => {
      if (data.files.length) {
        void uploadAndAdd(data.files, at);
        return true;
      }

      const text = data.text.trim();

      if (text.startsWith(CLIPBOARD_PREFIX)) {
        const copied = parseClipboardPayload(text);
        if (copied) return pasteClipboardElements(copied, at);
      }

      if (isHttpUrl(text)) {
        // Cualquier URL entra como tarjeta: si es de un proveedor conocido se
        // ve el video embebido, si no queda el link clicable (ver LinkCard).
        const created = await addElement({
          type: "video-embed",
          x: at.x,
          y: at.y,
          width: DEFAULT_EMBED_SIZE.width,
          height: DEFAULT_EMBED_SIZE.height,
          embedUrl: text,
        });
        return Boolean(created);
      }

      // HTML con formato (de un documento, una web) conserva negrita/listas;
      // texto suelto entra tal cual. Los dos como ventana de texto.
      const body = data.html ? sanitizeRichText(data.html) : escapeToHtml(text);
      if (!body.trim()) return false;

      const created = await addElement({
        type: "text-panel",
        x: at.x,
        y: at.y,
        width: DEFAULT_PANEL_SIZE.width,
        height: DEFAULT_PANEL_SIZE.height,
        text: body,
      });
      return Boolean(created);
    },
    [addElement, pasteClipboardElements, uploadAndAdd],
  );

  // ⌘V en cualquier parte de la página mientras el moodboard está abierto —
  // un listener en el div del canvas solo dispararía con el foco puesto ahí,
  // y el usuario viene de copiar en otra app. Se ignora si está escribiendo.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      // `instanceof Element` y no un cast: el target de un evento puede ser
      // `window` o un nodo de texto, y ahí `closest` no existe.
      const target = e.target;
      if (target instanceof Element && target.closest("input, textarea, [contenteditable='true']")) return;
      if (!e.clipboardData) return;

      const files = Array.from(e.clipboardData.items)
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null && (file.type.startsWith("image/") || file.type.startsWith("video/")));

      const text = e.clipboardData.getData("text/plain") ?? "";
      const html = e.clipboardData.getData("text/html") ?? "";
      if (!files.length && !text.trim() && !html.trim()) return;

      e.preventDefault();
      void pasteContent({ files, text, html }, pointerCanvasRef.current);
    }

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [pasteContent]);

  function handleAddLink() {
    const url = linkValue.trim();
    if (!url) return;
    const at = viewCenter();
    void addElement({
      type: "video-embed",
      x: at.x - DEFAULT_EMBED_SIZE.width / 2,
      y: at.y - DEFAULT_EMBED_SIZE.height / 2,
      width: DEFAULT_EMBED_SIZE.width,
      height: DEFAULT_EMBED_SIZE.height,
      embedUrl: url,
    });
    setLinkValue("");
    setLinkOpen(false);
  }

  // ── Portapapeles ────────────────────────────────────────────────────────

  /** Serializa la selección y la manda al portapapeles del sistema. Si el
   * navegador no lo permite queda igual en el respaldo en memoria. */
  const copySelection = useCallback(async (): Promise<ClipboardElement[]> => {
    const chosen = elements.filter((el) => selectedIds.has(el.id));
    if (!chosen.length) return [];

    const originX = Math.min(...chosen.map((el) => el.x));
    const originY = Math.min(...chosen.map((el) => el.y));
    const payload: ClipboardElement[] = chosen.map((el) => ({
      type: el.type,
      dx: el.x - originX,
      dy: el.y - originY,
      width: el.width,
      height: el.height,
      rotation: el.rotation,
      url: el.url,
      filename: el.filename,
      embedUrl: el.embedUrl,
      text: el.text,
      color: el.color,
      fontSize: el.fontSize,
      textAlign: el.textAlign,
      textColor: el.textColor,
    }));

    localClipboardRef.current = payload;
    try {
      await navigator.clipboard.writeText(CLIPBOARD_PREFIX + JSON.stringify(payload));
    } catch {
      // Sin permiso de escritura al portapapeles: seguimos con el respaldo.
    }
    return payload;
  }, [elements, selectedIds]);

  const deleteSelection = useCallback(async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setElements((prev) => prev.filter((el) => !selectedIds.has(el.id)));
    setSelectedIds(new Set());
    setMenu(null);
    ids.forEach((id) => pendingRef.current.delete(id));
    try {
      await Promise.all(ids.map((id) => deleteElement(id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron eliminar los elementos.");
    }
  }, [selectedIds]);

  const cutSelection = useCallback(async () => {
    const copied = await copySelection();
    if (copied.length) await deleteSelection();
  }, [copySelection, deleteSelection]);

  /** "Pegar" explícito (botón de mobile o ⌘V sin evento de pegado usable):
   * lee el portapapeles del sistema y, si no se puede, usa el respaldo. */
  const pasteFromSystem = useCallback(
    async (at: { x: number; y: number }) => {
      try {
        const items = await navigator.clipboard.read();
        const files: File[] = [];
        let text = "";
        let html = "";
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith("image/") || t.startsWith("video/"));
          if (imageType) {
            const blob = await item.getType(imageType);
            files.push(new File([blob], `pegado.${imageType.split("/")[1] || "bin"}`, { type: imageType }));
            continue;
          }
          if (!text && item.types.includes("text/plain")) text = await (await item.getType("text/plain")).text();
          if (!html && item.types.includes("text/html")) html = await (await item.getType("text/html")).text();
        }
        if (files.length || text.trim() || html.trim()) {
          const pasted = await pasteContent({ files, text, html }, at);
          if (pasted) return;
        }
      } catch {
        // Safari/iOS puede negar la lectura del portapapeles — caemos al
        // respaldo en memoria, que cubre el caso de copiar dentro del tablero.
      }

      if (localClipboardRef.current.length) {
        await pasteClipboardElements(localClipboardRef.current, at);
        return;
      }
      setError("No hay nada para pegar, o el navegador no dio permiso al portapapeles.");
    },
    [pasteClipboardElements, pasteContent],
  );

  /** Post-it amarillo (rápido) o ventana de texto limpia — los dos aceptan el
   * mismo formato, cambia el tamaño por defecto y cómo se ven. */
  function handleAddText(type: "text-note" | "text-panel") {
    const size = type === "text-note" ? DEFAULT_NOTE_SIZE : DEFAULT_PANEL_SIZE;
    const at = viewCenter();
    void addElement({
      type,
      x: at.x - size.width / 2,
      y: at.y - size.height / 2,
      width: size.width,
      height: size.height,
      text: "",
    }).then((created) => {
      if (created) setEditingId(created.id);
    });
  }

  // ── Interacciones de puntero ────────────────────────────────────────────

  const endInteraction = useCallback(() => {
    const it = interactionRef.current;
    interactionRef.current = null;
    if (!it) return;

    if (it.kind === "pan") {
      // Un toque limpio sobre el fondo (sin arrastrar) es "deseleccionar".
      // Va acá y no en el pointerdown a propósito: si arranca un long-press,
      // el menú de portapapeles necesita la selección todavía viva para poder
      // ofrecer Copiar/Cortar.
      if (!it.moved) {
        setSelectedIds(new Set());
        setEditingId(null);
        setInteractiveId(null);
      }
      return;
    }

    // Un click sin desplazamiento es solo seleccionar — no hay nada que guardar.
    if (!it.moved) return;

    // Arrastrar mueve toda la selección; redimensionar y rotar, un elemento.
    const commits = it.kind === "move" ? it.targets : [{ id: it.id, live: it.live }];
    const byId = new Map(commits.map((target) => [target.id, target.live]));

    setElements((prev) =>
      prev.map((el) => {
        const live = byId.get(el.id);
        return live
          ? { ...el, x: live.x, y: live.y, width: live.width, height: live.height, rotation: live.rotation }
          : el;
      }),
    );
    for (const [id, live] of byId) {
      queuePatch(id, {
        x: live.x,
        y: live.y,
        width: live.width,
        height: live.height,
        rotation: live.rotation,
      });
    }
  }, [queuePatch]);

  /** Deja el elemento como estaba y suelta la interacción sin guardar nada.
   * Se usa cuando apoya un segundo dedo: ese gesto pasó a ser un pellizco, y
   * el arrastre que había empezado con el primer dedo no debe quedar. */
  const abortInteraction = useCallback(() => {
    const it = interactionRef.current;
    interactionRef.current = null;
    if (!it || it.kind === "pan") return;
    if (it.kind === "move") {
      for (const target of it.targets) paint(target.node, target.start);
    } else {
      paint(it.node, it.start);
    }
  }, []);

  useEffect(() => {
    /** Solo interesan los dedos que apoyaron sobre el lienzo. Va en fase de
     * captura sobre `window` para verlos todos: los que caen sobre un
     * elemento cortan la propagación del evento de React. */
    function onDown(e: PointerEvent) {
      const node = viewportRef.current;
      if (!node || !(e.target instanceof Node) || !node.contains(e.target)) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointersRef.current.size === 2) {
        abortInteraction();
        const [a, b] = [...pointersRef.current.values()];
        const rect = node.getBoundingClientRect();

        // ¿El gesto empezó sobre algo que ya estaba seleccionado? Alcanza con
        // que UNO de los dos dedos caiga encima: pellizcar una imagen chica
        // deja el otro dedo afuera casi siempre.
        const onSelection = [a, b].some((point) => {
          const hit = document.elementFromPoint(point.x, point.y);
          const owner = hit instanceof Element ? hit.closest<HTMLElement>("[data-el-id]") : null;
          return Boolean(owner?.dataset.elId && selectedIdsRef.current.has(owner.dataset.elId));
        });

        let targets: MoveTarget[] | null = null;
        let minFactor = 0.02;
        let maxFactor = 50;

        if (onSelection) {
          targets = [];
          for (const id of selectedIdsRef.current) {
            const element = elementsRef.current.find((el) => el.id === id);
            const targetNode = node.querySelector<HTMLElement>(`[data-el-id="${CSS.escape(id)}"]`);
            if (!element || !targetNode) continue;
            const start = geometryOf(element);
            targets.push({ id, node: targetNode, start, live: start });
            // Ninguno puede bajar del mínimo agarrable ni pasarse de largo.
            minFactor = Math.max(minFactor, MIN_ELEMENT_SIZE / Math.min(start.width, start.height));
            maxFactor = Math.min(maxFactor, 6000 / Math.max(start.width, start.height));
          }
          if (!targets.length) targets = null;
        }

        pinchRef.current = {
          startDist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
          startScale: viewRef.current.scale,
          startView: { x: viewRef.current.x, y: viewRef.current.y },
          startMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          rect: { left: rect.left, top: rect.top },
          targets,
          minFactor,
          maxFactor: Math.max(minFactor, maxFactor),
        };
      }
    }

    function onMove(e: PointerEvent) {
      if (pointersRef.current.has(e.pointerId)) {
        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      // Pellizco: el punto del tablero que estaba bajo el centro de los dos
      // dedos tiene que seguir ahí, y la separación entre ellos manda la
      // escala. Mover los dos dedos juntos desplaza (el centro se corre), así
      // que el gesto sirve para acercar y para navegar a la vez.
      const pinch = pinchRef.current;
      if (pinch) {
        const points = [...pointersRef.current.values()];
        if (points.length < 2) return;
        const [a, b] = points;
        const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;

        // El punto del tablero que estaba bajo el centro de los dedos.
        const anchorX = (pinch.startMid.x - pinch.rect.left - pinch.startView.x) / pinch.startScale;
        const anchorY = (pinch.startMid.y - pinch.rect.top - pinch.startView.y) / pinch.startScale;

        if (pinch.targets) {
          // Escalar lo seleccionado. Es un escalado uniforme alrededor del
          // ancla, así que la proporción se conserva sola — que es lo que se
          // espera al pellizcar una foto. Si además se corren los dos dedos,
          // el elemento acompaña: en touch escalar y mover es un solo gesto.
          const factor = clamp(distance / pinch.startDist, pinch.minFactor, pinch.maxFactor);
          const shiftX = (midX - pinch.startMid.x) / pinch.startScale;
          const shiftY = (midY - pinch.startMid.y) / pinch.startScale;

          for (const target of pinch.targets) {
            target.live = {
              ...target.start,
              x: anchorX + (target.start.x - anchorX) * factor + shiftX,
              y: anchorY + (target.start.y - anchorY) * factor + shiftY,
              width: target.start.width * factor,
              height: target.start.height * factor,
            };
            paint(target.node, target.live);
          }
          return;
        }

        const nextScale = clamp(
          (pinch.startScale * distance) / pinch.startDist,
          MIN_SCALE,
          MAX_SCALE,
        );
        setView({
          scale: nextScale,
          x: midX - pinch.rect.left - anchorX * nextScale,
          y: midY - pinch.rect.top - anchorY * nextScale,
        });
        return;
      }

      const it = interactionRef.current;
      const v = viewRef.current;

      const rect = viewportRef.current?.getBoundingClientRect();
      if (rect) {
        pointerCanvasRef.current = {
          x: (e.clientX - rect.left - v.x) / v.scale,
          y: (e.clientY - rect.top - v.y) / v.scale,
        };
      }

      if (!it) return;

      if (it.kind === "pan") {
        const shiftX = e.clientX - it.pointerX;
        const shiftY = e.clientY - it.pointerY;
        if (Math.hypot(shiftX, shiftY) > TAP_TOLERANCE_PX) it.moved = true;
        setView((prev) => ({ ...prev, x: it.viewX + shiftX, y: it.viewY + shiftY }));
        return;
      }

      // Delta en unidades de canvas: dividir por la escala hace que el
      // elemento siga al cursor 1:1 sin importar el zoom.
      const dx = (e.clientX - it.pointerX) / v.scale;
      const dy = (e.clientY - it.pointerY) / v.scale;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) it.moved = true;

      if (it.kind === "move") {
        // Mismo delta para todos los seleccionados: el grupo se mueve rígido.
        for (const target of it.targets) {
          target.live = { ...target.start, x: target.start.x + dx, y: target.start.y + dy };
          paint(target.node, target.live);
        }
        return;
      }

      if (it.kind === "resize" && it.handle) {
        // Imagen y video conservan su proporción al agarrar una esquina —
        // se insertan con la del archivo y no tiene sentido deformarlos sin
        // querer. Shift invierte la regla, y las asas de los bordes siguen
        // siendo libres (ahí el recorte es deliberado).
        const keepRatio = it.lockAspect ? !e.shiftKey : e.shiftKey;
        it.live = applyResize(it.start, it.handle, dx, dy, keepRatio);
      } else if (it.kind === "rotate") {
        const center = centerOf(it.start);
        const rectNow = viewportRef.current?.getBoundingClientRect();
        if (!rectNow) return;
        const px = (e.clientX - rectNow.left - v.x) / v.scale;
        const py = (e.clientY - rectNow.top - v.y) / v.scale;
        const angle = Math.atan2(py - center.y, px - center.x) / RAD;
        let rotation = it.start.rotation + (angle - (it.grabAngle ?? 0));
        // Shift = pasos de 15°, para alinear a mano sin pelear con el mouse.
        if (e.shiftKey) rotation = Math.round(rotation / 15) * 15;
        it.live = { ...it.start, rotation };
        it.moved = true;
      }

      paint(it.node, it.live);
    }

    function onUp(e: PointerEvent) {
      pointersRef.current.delete(e.pointerId);

      if (pinchRef.current) {
        if (pointersRef.current.size >= 2) return;
        const finished = pinchRef.current;
        pinchRef.current = null;

        // Un pellizco de vista no deja nada que guardar; uno que escaló
        // elementos sí, y recién acá (durante el gesto se pintó directo en
        // el DOM, sin pasar por el estado).
        if (finished.targets) {
          const byId = new Map(finished.targets.map((t) => [t.id, t.live]));
          setElements((prev) =>
            prev.map((el) => {
              const live = byId.get(el.id);
              return live ? { ...el, x: live.x, y: live.y, width: live.width, height: live.height } : el;
            }),
          );
          for (const [id, live] of byId) {
            // Por ref: este efecto registra los listeners una sola vez y no
            // debe volver a hacerlo cada vez que cambia `queuePatch`.
            queuePatchRef.current(id, { x: live.x, y: live.y, width: live.width, height: live.height });
          }
        }

        // Si queda un dedo apoyado, el gesto sigue como desplazamiento desde
        // donde está ahora — sin esto el lienzo se queda clavado hasta
        // levantar y volver a tocar.
        const [remaining] = [...pointersRef.current.values()];
        if (remaining) {
          interactionRef.current = {
            kind: "pan",
            pointerX: remaining.x,
            pointerY: remaining.y,
            viewX: viewRef.current.x,
            viewY: viewRef.current.y,
            moved: true, // vino de un pellizco: no es un toque para deseleccionar
          };
        }
        return;
      }

      endInteraction();
    }

    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [endInteraction, abortInteraction]);

  function geometryOf(element: MoodboardElement): Geometry {
    return {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      rotation: element.rotation,
    };
  }

  function beginElementInteraction(
    e: ReactPointerEvent<HTMLElement>,
    element: MoodboardElement,
    kind: "move" | "resize" | "rotate",
    handle?: ResizeHandle,
  ) {
    if (e.button !== 0) return;
    if (editingId === element.id) return;
    e.stopPropagation();

    const node = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-el-id]");
    if (!node) return;

    // Shift (desktop) o el modo multi (touch) suman a la selección en vez de
    // reemplazarla — y en ese caso no arrastramos: el gesto fue "elegir".
    const additive = e.shiftKey || multiSelect;
    if (additive) {
      toggleSelected(element.id);
      setMenu(null);
      return;
    }

    // Agarrar algo que NO estaba seleccionado descarta la selección anterior;
    // agarrar algo que sí estaba mueve todo el grupo junto.
    const groupIds = selectedIds.has(element.id) ? [...selectedIds] : [element.id];
    if (!selectedIds.has(element.id)) selectOnly(element.id);

    if (kind === "move") {
      const targets: MoveTarget[] = [];
      for (const id of groupIds) {
        const target = elements.find((el) => el.id === id);
        const targetNode = viewportRef.current?.querySelector<HTMLElement>(`[data-el-id="${CSS.escape(id)}"]`);
        if (!target || !targetNode) continue;
        const start = geometryOf(target);
        targets.push({ id, node: targetNode, start, live: start });
      }
      interactionRef.current = {
        kind: "move",
        pointerX: e.clientX,
        pointerY: e.clientY,
        targets,
        moved: false,
      };
    } else {
      const start = geometryOf(element);
      let grabAngle: number | undefined;
      if (kind === "rotate") {
        const center = centerOf(start);
        const p = toCanvas(e.clientX, e.clientY);
        grabAngle = Math.atan2(p.y - center.y, p.x - center.x) / RAD;
      }
      interactionRef.current = {
        kind,
        id: element.id,
        node,
        pointerX: e.clientX,
        pointerY: e.clientY,
        start,
        live: start,
        handle,
        lockAspect: element.type === "image" || element.type === "video",
        grabAngle,
        moved: false,
      };
    }

    setMenu(null);
    if (interactiveId && interactiveId !== element.id) setInteractiveId(null);
  }

  function handleViewportPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    // Arrastre sobre el fondo = desplazar el lienzo (botón izquierdo o del medio).
    if (e.button !== 0 && e.button !== 1) return;
    interactionRef.current = {
      kind: "pan",
      pointerX: e.clientX,
      pointerY: e.clientY,
      viewX: viewRef.current.x,
      viewY: viewRef.current.y,
      moved: false,
    };

    // Los popovers sí se cierran de una; la selección espera al pointerup
    // (ver endInteraction).
    setMenu(null);
    setLinkOpen(false);
  }

  // Rueda: desplazar; ⌘/Ctrl + rueda: zoom anclado al cursor. Listener nativo
  // no-pasivo — React registra `wheel` como pasivo y ahí preventDefault() no
  // frena el zoom del navegador.
  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const v = viewRef.current;

      if (e.ctrlKey || e.metaKey) {
        const rect = node!.getBoundingClientRect();
        const nextScale = clamp(v.scale * Math.exp(-e.deltaY / 320), MIN_SCALE, MAX_SCALE);
        // El punto del canvas bajo el cursor tiene que quedar quieto.
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        setView({
          scale: nextScale,
          x: cx - ((cx - v.x) / v.scale) * nextScale,
          y: cy - ((cy - v.y) / v.scale) * nextScale,
        });
        return;
      }

      setView((prev) => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    }

    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  // ── Teclado ─────────────────────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target;
      if (target instanceof Element && target.closest("input, textarea, [contenteditable='true']")) return;

      if (e.key === "Escape") {
        setSelectedIds(new Set());
        setMenu(null);
        setInteractiveId(null);
        return;
      }

      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelectedIds(new Set(elements.map((el) => el.id)));
        return;
      }
      // ⌘V no está acá: lo maneja el evento `paste`, que sí trae el contenido
      // del portapapeles sin pedir permisos.
      if (meta && e.key.toLowerCase() === "c" && selectedIds.size) {
        e.preventDefault();
        void copySelection();
        return;
      }
      if (meta && e.key.toLowerCase() === "x" && selectedIds.size) {
        e.preventDefault();
        void cutSelection();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.size) {
        e.preventDefault();
        void deleteSelection();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIds, elements, copySelection, cutSelection, deleteSelection]);

  // ── Acciones sobre un elemento ──────────────────────────────────────────

  async function removeElement(id: string) {
    setElements((prev) => prev.filter((el) => el.id !== id));
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setMenu(null);
    pendingRef.current.delete(id);
    try {
      await deleteElement(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar el elemento.");
    }
  }

  async function handleDuplicate(element: MoodboardElement) {
    setMenu(null);
    try {
      const copy = await duplicateElement(element.id);
      setElements((prev) => [...prev, copy]);
      selectOnly(copy.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo duplicar el elemento.");
    }
  }

  function handleColor(element: MoodboardElement, color: string | null) {
    setElements((prev) =>
      prev.map((el) => (el.id === element.id ? { ...el, color: color ?? undefined } : el)),
    );
    queuePatch(element.id, { color });
    setMenu(null);
  }

  function handleBringToFront(element: MoodboardElement) {
    const top = elements.reduce((max, el) => Math.max(max, el.zIndex), 0) + 1;
    setElements((prev) => prev.map((el) => (el.id === element.id ? { ...el, zIndex: top } : el)));
    queuePatch(element.id, { zIndex: top });
    setMenu(null);
  }

  function handleCommitText(id: string, text: string) {
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, text } : el)));
    queuePatch(id, { text });
  }

  /** Negrita/cursiva/listas sobre la selección viva del editor.
   * `execCommand` está marcado como obsoleto pero sigue siendo lo único que
   * todos los navegadores implementan para formatear dentro de un
   * contentEditable sin traer un editor entero como dependencia. */
  function handleInlineCommand(command: string) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(command);
    handleCommitText(editingId!, sanitizeRichText(editor.innerHTML));
  }

  function patchEditingElement(patch: MoodboardElementPatch) {
    if (!editingId) return;
    setElements((prev) => prev.map((el) => (el.id === editingId ? { ...el, ...patchToLocal(patch) } : el)));
    queuePatch(editingId, patch);
  }

  // ── Vista ───────────────────────────────────────────────────────────────

  const fitToContent = useCallback(() => {
    const node = viewportRef.current;
    if (!node || !elements.length) {
      setView({ x: 0, y: 0, scale: 1 });
      return;
    }
    const rect = node.getBoundingClientRect();
    const minX = Math.min(...elements.map((el) => el.x));
    const minY = Math.min(...elements.map((el) => el.y));
    const maxX = Math.max(...elements.map((el) => el.x + el.width));
    const maxY = Math.max(...elements.map((el) => el.y + el.height));

    const padding = 64;
    const scale = clamp(
      Math.min((rect.width - padding * 2) / (maxX - minX), (rect.height - padding * 2) / (maxY - minY)),
      MIN_SCALE,
      1,
    );
    setView({
      scale,
      x: (rect.width - (maxX - minX) * scale) / 2 - minX * scale,
      y: (rect.height - (maxY - minY) * scale) / 2 - minY * scale,
    });
  }, [elements]);

  function zoomBy(factor: number) {
    const node = viewportRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const v = viewRef.current;
    const nextScale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    setView({
      scale: nextScale,
      x: cx - ((cx - v.x) / v.scale) * nextScale,
      y: cy - ((cy - v.y) / v.scale) * nextScale,
    });
  }

  /** Alinea en una fila SOLO los elementos seleccionados, respetando el
   * tamaño de cada uno: los ordena por su x actual, los pega uno al lado del
   * otro desde donde empezaba el más a la izquierda, y centra todos sobre la
   * misma línea horizontal. No es un reacomodo del tablero entero — es para
   * emprolijar un grupo puntual y seguir trabajando libre. */
  function arrangeSelectedInRow() {
    const chosen = elements.filter((el) => selectedIds.has(el.id));
    if (chosen.length < 2) {
      setError("Elegí al menos dos elementos para alinearlos en fila.");
      return;
    }
    setError("");

    const ordered = [...chosen].sort((a, b) => a.x - b.x);
    const startX = Math.min(...chosen.map((el) => el.x));
    // Centro vertical del grupo: la fila queda donde ya estaba el conjunto,
    // no saltando a una coordenada fija.
    const centerY =
      chosen.reduce((sum, el) => sum + el.y + el.height / 2, 0) / chosen.length;

    const patches: Record<string, { x: number; y: number }> = {};
    let cursorX = startX;
    for (const el of ordered) {
      patches[el.id] = { x: cursorX, y: centerY - el.height / 2 };
      cursorX += el.width + ARRANGE_GAP;
    }

    setElements((prev) => prev.map((el) => (patches[el.id] ? { ...el, ...patches[el.id] } : el)));
    void updateElements(session.id, patches).catch((e: unknown) =>
      setError(e instanceof Error ? e.message : "No se pudo guardar la alineación."),
    );
  }

  useEffect(() => {
    // Al abrir una sesión con contenido, encuadrarla — si no, el tablero
    // aparece en (0,0) y puede verse vacío aunque tenga material más abajo.
    if (session.elements.length) fitToContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar la sesión
  }, []);

  // ── Exportar como imagen ────────────────────────────────────────────────

  /** Recuadro rojo, en píxeles de pantalla relativos al viewport: el
   * rectángulo más grande con la proporción de la hoja que entra con margen.
   * Está fijo en pantalla — lo que se mueve por debajo es el tablero, que es
   * justamente cómo se encuadra.
   *
   * Se calcula desde `viewportSize` (estado, ver el ResizeObserver de arriba)
   * y no midiendo el nodo: leer el DOM durante el render no reacciona a un
   * cambio de tamaño de la ventana, y el recuadro quedaría desalineado. */
  function frameRect(preset: PaperPreset, orientation: Orientation) {
    if (!viewportSize.width || !viewportSize.height) return null;
    const { ratio } = paperSize(preset, orientation);

    // Margen chico a propósito: como se exporta con una captura, cada píxel
    // de pantalla que ocupa el recuadro es resolución del archivo final.
    const margin = 24;
    const availableWidth = Math.max(120, viewportSize.width - margin * 2);
    const availableHeight = Math.max(120, viewportSize.height - margin * 2);

    let width = availableWidth;
    let height = width / ratio;
    if (height > availableHeight) {
      height = availableHeight;
      width = height * ratio;
    }
    return {
      left: (viewportSize.width - width) / 2,
      top: (viewportSize.height - height) / 2,
      width,
      height,
    };
  }

  async function runExport(preset: PaperPreset, orientation: Orientation) {
    if (!frameRect(preset, orientation)) return;

    setExportStep({ step: "frame", preset, orientation, busy: true });
    setError("");
    try {
      const blob = await captureFrameToBlob({
        preset,
        orientation,
        // La interfaz se esconde recién acá, con el permiso ya concedido: si
        // se ocultara antes, quedaría escondida mientras el usuario decide en
        // el selector del navegador, o si lo cancela.
        onBeforeGrab: () => {
          setCapturing(true);
          setSelectedIds(new Set());
        },
        onAfterGrab: () => setCapturing(false),
        // Se mide DESPUÉS de esconder la interfaz, por si algo cambió de
        // tamaño al ocultarse.
        measureCrop: () => {
          const frame = frameRect(preset, orientation);
          const node = viewportRef.current;
          if (!frame || !node) return null;
          const rect = node.getBoundingClientRect();
          return {
            left: rect.left + frame.left,
            top: rect.top + frame.top,
            width: frame.width,
            height: frame.height,
          };
        },
      });

      const slug =
        session.name
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "moodboard";

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${slug}-${preset.key}-${orientation}.png`;
      link.click();
      URL.revokeObjectURL(url);
      setExportStep(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo exportar la imagen.");
      setExportStep({ step: "frame", preset, orientation, busy: false });
    }
  }

  const inverseScale = 1 / view.scale;
  const editingElement = elements.find((el) => el.id === editingId && isTextElement(el.type)) ?? null;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        ref={viewportRef}
        onPointerDown={handleViewportPointerDown}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const files = Array.from(e.dataTransfer.files ?? []);
          if (files.length) {
            void uploadAndAdd(files, toCanvas(e.clientX, e.clientY));
            return;
          }
          const text = e.dataTransfer.getData("text/plain")?.trim();
          if (text && detectEmbedProvider(text)) {
            const at = toCanvas(e.clientX, e.clientY);
            void addElement({
              type: "video-embed",
              x: at.x,
              y: at.y,
              width: DEFAULT_EMBED_SIZE.width,
              height: DEFAULT_EMBED_SIZE.height,
              embedUrl: text,
            });
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          // Cuadrícula de fondo que se mueve con el lienzo — la referencia
          // visual de que esto es un espacio infinito y no una página. Se
          // apaga durante la captura: en la hoja exportada es ruido, no
          // información.
          backgroundImage: capturing
            ? "none"
            : "radial-gradient(circle, color-mix(in srgb, var(--color-brand-blue) 22%, transparent) 1px, transparent 1px)",
          backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
          // Hoja blanca al exportar: el tablero se trabaja en oscuro, pero
          // esto se imprime. Solo cambia el fondo — los elementos van tal
          // cual se ven en pantalla.
          backgroundColor: capturing ? "#FFFFFF" : undefined,
        }}
        className={`h-full w-full cursor-grab touch-none active:cursor-grabbing ${
          dragOver ? "ring-2 ring-brand-blue ring-inset" : ""
        }`}
      >
        <div
          style={{ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})` }}
          className="absolute top-0 left-0 origin-top-left"
        >
          {elements.map((element) => (
            <CanvasItem
              key={element.id}
              element={element}
              selected={selectedIds.has(element.id)}
              /** Las asas de tamaño y rotación solo tienen sentido sobre un
               * elemento: con varios elegidos el gesto disponible es mover. */
              soloSelected={selectedIds.size === 1 && selectedIds.has(element.id)}
              interactive={interactiveId === element.id}
              editing={editingId === element.id}
              inverseScale={inverseScale}
              editorRef={editorRef}
              onPointerDownBody={(e, el) => beginElementInteraction(e, el, "move")}
              onPointerDownHandle={(e, el, handle) => beginElementInteraction(e, el, "resize", handle)}
              onPointerDownRotate={(e, el) => beginElementInteraction(e, el, "rotate")}
              onOpenMenu={(cx, cy, el) => setMenu({ element: el, x: cx, y: cy })}
              onCommitText={handleCommitText}
              onStartEdit={(id) => {
                selectOnly(id);
                setEditingId(id);
              }}
              onEndEdit={() => setEditingId(null)}
              onToggleInteractive={(id) => setInteractiveId((prev) => (prev === id ? null : id))}
            />
          ))}
        </div>
      </div>

      {elements.length === 0 && uploads.length === 0 && !capturing && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm font-bold text-tx-2">Tablero vacío</p>
          <p className="max-w-xs text-xs leading-relaxed text-tx-3">
            Pegá una captura con ⌘V, arrastrá archivos acá, o sumá el link de un reel.
          </p>
        </div>
      )}

      {/* Herramientas del tablero — flotan sobre el lienzo, no le comen alto.
          Se esconden durante la captura para no salir impresas. */}
      <div className={`absolute top-3 left-3 z-20 flex flex-wrap items-start gap-1.5 ${capturing ? "hidden" : ""}`}>
        <ToolButton onClick={() => fileInputRef.current?.click()} label="Subir">
          <UploadIcon />
        </ToolButton>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) void uploadAndAdd(files, viewCenter());
            // Limpiar el valor deja volver a elegir el MISMO archivo después
            // (si no, el input no dispara change la segunda vez).
            e.target.value = "";
          }}
        />

        <ToolButton onClick={() => handleAddText("text-panel")} label="Texto">
          <TextIcon />
        </ToolButton>

        <ToolButton onClick={() => handleAddText("text-note")} label="Nota">
          <NoteIcon />
        </ToolButton>

        <div className="relative">
          <ToolButton onClick={() => setLinkOpen((v) => !v)} label="Link" active={linkOpen}>
            <LinkIcon />
          </ToolButton>
          {linkOpen && (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute top-full left-0 mt-1.5 flex w-[300px] flex-col gap-2 rounded border border-line-2 bg-[var(--bg)] p-2.5 shadow-lg"
            >
              <label className="text-[10px] tracking-label text-tx-3 uppercase">
                Link de reel, TikTok o YouTube
              </label>
              <input
                autoFocus
                value={linkValue}
                onChange={(e) => setLinkValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddLink();
                  if (e.key === "Escape") setLinkOpen(false);
                }}
                placeholder="https://instagram.com/reel/…"
                className="w-full rounded border border-line-2 bg-panel-2 px-2.5 py-1.5 text-xs outline-none focus:border-brand-blue"
              />
              <button
                type="button"
                onClick={handleAddLink}
                className={`rounded bg-brand-blue px-3 py-1.5 text-[10px] font-bold tracking-label text-[var(--bg)] uppercase ${PRESS_SCALE_CLASS}`}
              >
                Agregar al tablero
              </button>
            </div>
          )}
        </div>

        <IconToolButton
          onClick={arrangeSelectedInRow}
          label="Alinear en fila los elementos seleccionados"
          disabled={selectedIds.size < 2}
        >
          <ArrangeRowIcon />
        </IconToolButton>

        <IconToolButton
          onClick={() => setMultiSelect((v) => !v)}
          label={multiSelect ? "Salir de selección múltiple" : "Selección múltiple"}
          active={multiSelect}
        >
          <MultiSelectIcon />
        </IconToolButton>

        {/* Solo en mobile: ahí no hay ⌘V ni clic derecho, así que sin este
            botón no habría forma de pegar. En desktop sobra — el atajo de
            siempre ya funciona sobre todo el lienzo. */}
        <span className="desktop:hidden">
          <IconToolButton onClick={() => void pasteFromSystem(viewCenter())} label="Pegar">
            <PasteIcon />
          </IconToolButton>
        </span>

        {selectedIds.size > 0 && (
          <span className="flex h-[30px] items-center rounded border border-line-2 bg-[var(--bg)]/90 px-2 text-[10px] font-bold tracking-label text-tx-3 uppercase backdrop-blur">
            {selectedIds.size} {selectedIds.size === 1 ? "elegido" : "elegidos"}
          </span>
        )}
      </div>

      {/* Zoom. `safe-area-inset-bottom` deja libre la franja del indicador de
          inicio del teléfono; el alto de la ventana ya descuenta la barra del
          navegador (ver el 100dvh de MoodboardWorkspace). */}
      <div
        style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
        className={`absolute right-3 z-20 flex items-center gap-1 rounded border border-line-2 bg-[var(--bg)]/90 p-1 backdrop-blur ${
          capturing ? "hidden" : ""
        }`}
      >
        <IconBtn onClick={() => zoomBy(1 / 1.2)} label="Alejar">
          −
        </IconBtn>
        <button
          type="button"
          onClick={() => setView((v) => ({ ...v, scale: 1 }))}
          title="Zoom 100%"
          className="min-w-[42px] px-1 text-[11px] font-bold tabular-nums text-tx-2 hover:text-brand-blue"
        >
          {Math.round(view.scale * 100)}%
        </button>
        <IconBtn onClick={() => zoomBy(1.2)} label="Acercar">
          +
        </IconBtn>
        <span className="mx-0.5 h-4 w-px bg-line" />
        <button
          type="button"
          onClick={fitToContent}
          title="Ajustar a contenido"
          aria-label="Ajustar a contenido"
          className="flex items-center px-1.5 text-[10px] font-bold tracking-label text-tx-2 uppercase hover:text-brand-blue"
        >
          <FitIcon />
          <span className="hidden desktop:inline">Ajustar</span>
        </button>
        <span className="mx-0.5 h-4 w-px bg-line" />
        <button
          type="button"
          onClick={() => setExportStep({ step: "setup" })}
          title="Exportar como imagen"
          aria-label="Exportar como imagen"
          disabled={elements.length === 0}
          className="flex items-center gap-1 px-1.5 text-[10px] font-bold tracking-label text-tx-2 uppercase hover:text-brand-blue disabled:cursor-default disabled:opacity-40 disabled:hover:text-tx-2"
        >
          <ExportIcon />
          <span className="hidden desktop:inline">Exportar</span>
        </button>
      </div>

      {uploads.length > 0 && !capturing && (
        <ul
          style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
          className="absolute left-3 z-20 flex w-[min(260px,calc(100vw-6rem))] flex-col gap-1"
        >
          {uploads.map((u) => (
            <li key={u.id} className="rounded border border-line-2 bg-[var(--bg)]/95 px-2 py-1.5 backdrop-blur">
              <div className="flex items-center gap-2 text-[11px] text-tx-3">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${u.error ? "bg-brand-red" : "animate-pulse bg-brand-blue"}`}
                />
                <span className="min-w-0 flex-1 truncate">{u.name}</span>
                <span className="shrink-0 tabular-nums">{u.error ? "Error" : `${u.progress}%`}</span>
                {u.error && (
                  <button
                    type="button"
                    onClick={() => setUploads((prev) => prev.filter((x) => x.id !== u.id))}
                    aria-label="Descartar"
                    className="shrink-0 leading-none"
                  >
                    ×
                  </button>
                )}
              </div>
              {!u.error && (
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-black/20">
                  <div
                    className="h-full bg-brand-blue transition-[width] duration-200"
                    style={{ width: `${Math.max(u.progress, 4)}%` }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && !capturing && (
        <p className="absolute top-3 left-1/2 z-30 -translate-x-1/2 rounded border border-brand-red/40 bg-brand-red/10 px-3 py-1.5 text-xs text-brand-red">
          {error}
          <button type="button" onClick={() => setError("")} className="ml-2 font-bold">
            ×
          </button>
        </p>
      )}

      {/* Barra de formato — anclada abajo y centrada sobre el canvas, no
          pegada al elemento: así no se sale de pantalla cuando el texto está
          cerca de un borde, ni se deforma con el zoom o la rotación. */}
      {editingElement && (
        <div className="absolute bottom-3 left-1/2 z-30 -translate-x-1/2">
          <TextFormatToolbar
            element={editingElement}
            onInlineCommand={handleInlineCommand}
            onFontSize={(fontSize) => patchEditingElement({ fontSize })}
            onAlign={(textAlign: TextAlign) => patchEditingElement({ textAlign })}
            onColor={(textColor) => patchEditingElement({ textColor })}
            onDone={() => setEditingId(null)}
          />
        </div>
      )}

      {exportStep?.step === "setup" && (
        <ExportDialog
          onCancel={() => setExportStep(null)}
          onConfirm={(preset, orientation) => setExportStep({ step: "frame", preset, orientation, busy: false })}
        />
      )}

      {exportStep?.step === "frame" && !capturing && (
        <ExportFrameOverlay
          rect={frameRect(exportStep.preset, exportStep.orientation)}
          busy={exportStep.busy}
          dpi={(() => {
            const frame = frameRect(exportStep.preset, exportStep.orientation);
            if (!frame) return 0;
            return effectiveDpi(frame.width, paperSize(exportStep.preset, exportStep.orientation).widthIn);
          })()}
          onCancel={() => setExportStep(null)}
          onBack={() => setExportStep({ step: "setup" })}
          onExport={() => void runExport(exportStep.preset, exportStep.orientation)}
        />
      )}

      {menu && (
        <ElementMenu
          element={menu.element}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onDuplicate={() => void handleDuplicate(menu.element)}
          onColor={(color) => handleColor(menu.element, color)}
          onBringToFront={() => handleBringToFront(menu.element)}
          onEditNote={() => {
            selectOnly(menu.element.id);
            setEditingId(menu.element.id);
            setMenu(null);
          }}
          onOpenSource={() => {
            const url = menu.element.url ?? menu.element.embedUrl;
            if (url) window.open(url, "_blank", "noopener,noreferrer");
            setMenu(null);
          }}
          onUseAsProposal={() => {
            setProposalFor(menu.element);
            setMenu(null);
          }}
          onDelete={() => void removeElement(menu.element.id)}
        />
      )}

      {proposalFor && (
        <UseAsProposalDialog element={proposalFor} onClose={() => setProposalFor(null)} />
      )}
    </div>
  );
}

// ── Helpers geométricos ───────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** ¿Es una URL http(s) suelta? Solo entonces vale la pena crear una tarjeta
 * de link en vez de una ventana de texto. */
function isHttpUrl(text: string): boolean {
  if (/\s/.test(text)) return false;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Texto plano → HTML seguro conservando los saltos de línea. */
function escapeToHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split("\n")
    .join("<br>");
}

/** Lee el payload que dejó `copySelection`. Devuelve null si el texto no es
 * nuestro o vino corrupto — nunca tira: pegar algo raro no debe romper. */
function parseClipboardPayload(text: string): ClipboardElement[] | null {
  try {
    const parsed: unknown = JSON.parse(text.slice(CLIPBOARD_PREFIX.length));
    if (!Array.isArray(parsed) || !parsed.length) return null;
    return parsed as ClipboardElement[];
  } catch {
    return null;
  }
}

/** Un patch usa `null` para "borrar este valor" (es lo que entiende Prisma),
 * pero el estado local del canvas modela lo mismo con `undefined` — traducir
 * acá evita que el tipo `null` se filtre a MoodboardElement. */
function patchToLocal(patch: MoodboardElementPatch): Partial<MoodboardElement> {
  const { color, textColor, notes, ...rest } = patch;
  return {
    ...rest,
    ...(color !== undefined ? { color: color ?? undefined } : {}),
    ...(textColor !== undefined ? { textColor: textColor ?? undefined } : {}),
    ...(notes !== undefined ? { notes: notes ?? undefined } : {}),
  };
}

function centerOf(g: Geometry) {
  return { x: g.x + g.width / 2, y: g.y + g.height / 2 };
}

/** Redimensión correcta con rotación: el desplazamiento del puntero se lleva
 * al sistema local del elemento (deshaciendo la rotación), ahí se aplica al
 * ancho/alto según qué bordes mueve el asa, y el centro se corrige para que
 * el borde opuesto quede clavado donde estaba. Sin esta vuelta, arrastrar un
 * asa de un elemento rotado lo movería en la dirección equivocada. */
function applyResize(
  start: Geometry,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  keepRatio: boolean,
): Geometry {
  const theta = start.rotation * RAD;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  const localDx = dx * cos + dy * sin;
  const localDy = -dx * sin + dy * cos;

  let width = Math.max(MIN_ELEMENT_SIZE, start.width + handle.sx * localDx);
  let height = Math.max(MIN_ELEMENT_SIZE, start.height + handle.sy * localDy);

  // Shift en una esquina mantiene la proporción original.
  if (keepRatio && handle.sx !== 0 && handle.sy !== 0) {
    const ratio = start.width / start.height;
    if (width / height > ratio) width = height * ratio;
    else height = width / ratio;
  }

  const shiftX = (handle.sx * (width - start.width)) / 2;
  const shiftY = (handle.sy * (height - start.height)) / 2;

  const center = centerOf(start);
  const nextCenter = {
    x: center.x + shiftX * cos - shiftY * sin,
    y: center.y + shiftX * sin + shiftY * cos,
  };

  return {
    x: nextCenter.x - width / 2,
    y: nextCenter.y - height / 2,
    width,
    height,
    rotation: start.rotation,
  };
}

// ── Controles ─────────────────────────────────────────────────────────────

function ToolButton({
  onClick,
  label,
  active,
  children,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-[30px] items-center justify-center gap-1.5 rounded border px-2 text-[10px] font-bold tracking-label uppercase backdrop-blur transition-colors duration-[400ms] desktop:px-2.5 ${PRESS_SCALE_CLASS} ${
        active
          ? "border-brand-blue bg-brand-blue text-[var(--bg)]"
          : "border-line-2 bg-[var(--bg)]/90 text-tx-2 hover:border-brand-blue hover:text-brand-blue"
      }`}
    >
      {children}
      {/* En mobile la fila entera no entra con las etiquetas: quedan solo los
          íconos (el nombre sigue disponible en `title`/`aria-label`). */}
      <span className="hidden desktop:inline">{label}</span>
    </button>
  );
}

/** Recuadro rojo del área de impresión. Está FIJO en pantalla y no captura el
 * mouse (`pointer-events-none`): lo que se mueve para encuadrar es el tablero
 * de abajo, con el zoom y el arrastre de siempre. Lo de afuera se oscurece
 * para que se lea de un vistazo qué entra y qué no. */
function ExportFrameOverlay({
  rect,
  busy,
  dpi,
  onCancel,
  onBack,
  onExport,
}: {
  rect: { left: number; top: number; width: number; height: number } | null;
  busy: boolean;
  /** Resolución real que va a tener la hoja con el zoom actual. */
  dpi: number;
  onCancel: () => void;
  onBack: () => void;
  onExport: () => void;
}) {
  if (!rect) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {/* Velo con un recorte del tamaño de la hoja — un box-shadow enorme
          hacia afuera pinta todo menos el recuadro, sin cuatro divs. */}
      <div
        style={{
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
        }}
        className="absolute border-2 border-brand-red"
      />

      {/* Anclada abajo a la izquierda y no colgando del recuadro: con una
          hoja vertical el borde inferior cae fuera de la pantalla y la barra
          quedaba cortada. El hueco de la derecha es para el control de zoom,
          que hay que poder usar justamente ahora. */}
      <div
        style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
        className="pointer-events-auto absolute left-3 flex max-w-[min(560px,calc(100%-1.5rem))] flex-wrap items-center gap-2 rounded border border-line-2 bg-[var(--bg)] px-2.5 py-2 shadow-lg desktop:max-w-[min(560px,calc(100%-260px))]"
      >
        <span className="text-[11px] leading-snug text-tx-3">
          Movés y hacés zoom en el tablero para encuadrar. Lo que quede adentro del rojo se exporta —
          con los reels incluidos, porque sale de una captura de pantalla.
          <span className="mt-0.5 block">
            Resolución final:{" "}
            <span className={`font-bold tabular-nums ${dpi < 110 ? "text-brand-red" : "text-tx-2"}`}>
              ~{dpi} ppp
            </span>
            . Depende del tamaño de la ventana, no del zoom del tablero
            {dpi < 110 && " — maximizala o poné pantalla completa para ganar nitidez"}.
          </span>
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onBack}
            disabled={busy}
            className={`rounded border border-line-2 px-2.5 py-1.5 text-[10px] font-bold tracking-label text-tx-2 uppercase hover:border-brand-blue hover:text-brand-blue disabled:opacity-50 ${PRESS_SCALE_CLASS}`}
          >
            Tamaño
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className={`rounded border border-line-2 px-2.5 py-1.5 text-[10px] font-bold tracking-label text-tx-2 uppercase hover:border-brand-red hover:text-brand-red disabled:opacity-50 ${PRESS_SCALE_CLASS}`}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={busy}
            className={`rounded bg-brand-blue px-3 py-1.5 text-[10px] font-bold tracking-label text-[var(--bg)] uppercase disabled:opacity-60 ${PRESS_SCALE_CLASS}`}
          >
            {busy ? "Exportando…" : "Exportar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Botón de herramienta solo-ícono — para las acciones que se leen mejor con
 * un símbolo que con una palabra (alinear, selección múltiple). */
function IconToolButton({
  onClick,
  label,
  active,
  disabled,
  children,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-[30px] w-[30px] items-center justify-center rounded border backdrop-blur transition-colors duration-[400ms] ${PRESS_SCALE_CLASS} ${
        active
          ? "border-brand-blue bg-brand-blue text-[var(--bg)]"
          : "border-line-2 bg-[var(--bg)]/90 text-tx-2 hover:border-brand-blue hover:text-brand-blue"
      } disabled:cursor-default disabled:opacity-40 disabled:hover:border-line-2 disabled:hover:text-tx-2`}
    >
      {children}
    </button>
  );
}

function IconBtn({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-6 w-6 items-center justify-center rounded text-sm leading-none text-tx-2 hover:bg-panel-2 hover:text-brand-blue ${PRESS_SCALE_CLASS}`}
    >
      {children}
    </button>
  );
}

function UploadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  );
}

function TextIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7V5h16v2" />
      <path d="M12 5v14" />
      <path d="M9 19h6" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 3H3v14h11l7-7V3Z" />
      <path d="M14 17v-7h7" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </svg>
  );
}

/** Flechas hacia las cuatro esquinas — "encajar el contenido en la vista". */
function FitIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9V4h5" />
      <path d="M20 9V4h-5" />
      <path d="M4 15v5h5" />
      <path d="M20 15v5h-5" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

/** Portapapeles clásico. */
function PasteIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </svg>
  );
}

/** Tres cajas de distinto alto alineadas por su centro — dice "los pongo en
 * fila sin cambiarles el tamaño", que es exactamente lo que hace. */
function ArrangeRowIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="7.5" width="5" height="9" rx="1" />
      <rect x="9.5" y="4.5" width="5" height="15" rx="1" />
      <rect x="16.5" y="9" width="5" height="6" rx="1" />
    </svg>
  );
}

/** Marco punteado con un tilde — "elegir varios". */
function MultiSelectIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8V5a2 2 0 0 1 2-2h3" strokeDasharray="0" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
      <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
      <path d="m8.5 12 2.5 2.5 5-5" />
    </svg>
  );
}
