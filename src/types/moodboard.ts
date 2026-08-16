/** Tipos del Moodboard — espejo de los modelos MoodboardSession/
 * MoodboardElement de Prisma, aplanados para viajar al cliente (fechas ya
 * serializadas, sin relaciones). Mismo criterio que src/types/dashboard.ts. */

import type { TextAlign } from "@/lib/dashboard/rich-text";

/** Coincide letra por letra con MoodboardElement.type en la base.
 * "text-note" es el post-it amarillo rápido; "text-panel" es la ventana de
 * texto limpia. Los dos aceptan el mismo formato (ver rich-text.ts) — cambia
 * solo cómo se ven. */
export type MoodboardElementType = "image" | "video" | "video-embed" | "text-note" | "text-panel";

export interface MoodboardElement {
  id: string;
  type: MoodboardElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  rotation: number;
  url?: string;
  filename?: string;
  embedUrl?: string;
  /** HTML acotado (ver sanitizeRichText) para los tipos de texto. */
  text?: string;
  color?: string;
  notes?: string;
  fontSize?: number;
  textAlign?: TextAlign;
  textColor?: string;
}

/** Los dos tipos que llevan texto con formato. */
export function isTextElement(type: MoodboardElementType): boolean {
  return type === "text-note" || type === "text-panel";
}

export interface MoodboardSessionSummary {
  id: string;
  name: string;
  /** ISO — el cliente lo formatea, el server no asume locale. */
  createdAt: string;
  archived: boolean;
  elementCount: number;
}

export interface MoodboardSessionDetail extends MoodboardSessionSummary {
  elements: MoodboardElement[];
}

/** Lo que el canvas puede mover en un elemento ya creado. Todo opcional: un
 * arrastre manda solo x/y, un resize x/y/width/height, el menú contextual
 * solo color o text. */
export interface MoodboardElementPatch {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  zIndex?: number;
  rotation?: number;
  text?: string;
  color?: string | null;
  notes?: string | null;
  fontSize?: number;
  textAlign?: TextAlign;
  textColor?: string | null;
}

/** Tamaño por defecto de un elemento nuevo, en unidades de canvas. */
export const DEFAULT_ELEMENT_SIZE = { width: 300, height: 300 };
export const DEFAULT_NOTE_SIZE = { width: 240, height: 180 };
export const DEFAULT_PANEL_SIZE = { width: 380, height: 260 };
export const DEFAULT_EMBED_SIZE = { width: 260, height: 420 };

/** Mínimos de redimensión — por debajo de esto un elemento deja de ser
 * agarrable con el mouse. */
export const MIN_ELEMENT_SIZE = 80;

/** Paleta de etiquetas del canvas. Deliberadamente sin significado fijo: el
 * Admin decide qué agrupa cada color en cada sesión. */
export const ELEMENT_COLORS = [
  { value: "#E81F35", label: "Rojo" },
  { value: "#F0A202", label: "Ámbar" },
  { value: "#2E9E5B", label: "Verde" },
  { value: "#163F6B", label: "Azul" },
  { value: "#7B4BC4", label: "Violeta" },
] as const;

/** Detecta si una URL pegada es un video embebible conocido. Devuelve null
 * para cualquier otra cosa (el caller decide si la trata como link suelto). */
export function detectEmbedProvider(url: string): "instagram" | "tiktok" | "youtube" | null {
  if (/instagram\.com\/(p|reel|reels|tv)\//.test(url)) return "instagram";
  if (/tiktok\.com\//.test(url)) return "tiktok";
  if (/(youtube\.com\/(watch|shorts)|youtu\.be\/)/.test(url)) return "youtube";
  return null;
}

/** URL de iframe para los proveedores que lo permiten sin API key.
 * Instagram acepta el mismo contenido bajo /p/, /reel/ o /reels/ pero el
 * endpoint /embed siempre quiere /p/ — mismo tratamiento que ya usa la
 * página de Estrategia. TikTok no expone un iframe libre: devuelve null y el
 * canvas cae a una tarjeta con link clicable. */
export function toEmbedSrc(url: string): string | null {
  const provider = detectEmbedProvider(url);
  if (provider === "instagram") {
    const shortcode = url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([^/?#]+)/)?.[1];
    return shortcode ? `https://www.instagram.com/p/${shortcode}/embed` : null;
  }
  if (provider === "youtube") {
    const id =
      url.match(/youtube\.com\/watch\?v=([^&#]+)/)?.[1] ??
      url.match(/youtube\.com\/shorts\/([^/?#]+)/)?.[1] ??
      url.match(/youtu\.be\/([^/?#]+)/)?.[1];
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  return null;
}
