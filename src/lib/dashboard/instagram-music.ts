/** Enlaces de música de Instagram (ver ProposalMusicOption).
 *
 * El campo acepta un enlace pegado tal cual, así que se normaliza y se
 * restringe a instagram.com a propósito: es un link que después se abre en
 * otra pestaña desde el panel, y dejarlo como texto libre lo convertiría en
 * un "pegá cualquier URL" que cualquiera con sesión puede usar para mandar a
 * los demás a donde quiera. */

/** Hosts válidos — instagram.com y sus variantes conocidas, nada más. */
const INSTAGRAM_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "m.instagram.com",
]);

export class InvalidInstagramUrlError extends Error {
  constructor() {
    super("Pegá un enlace de Instagram (instagram.com).");
    this.name = "InvalidInstagramUrlError";
  }
}

/**
 * Devuelve la URL canónica (https://www.instagram.com/<path>) o tira
 * InvalidInstagramUrlError. Descarta query y hash: los enlaces copiados desde
 * la app vienen con parámetros de tracking (`igsh`, `utm_*`) que no aportan
 * nada y encima identifican a quien copió.
 */
export function normalizeInstagramMusicUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new InvalidInstagramUrlError();

  // Sin protocolo ("instagram.com/reels/audio/123") el constructor de URL lo
  // interpretaría como path relativo, así que se lo agregamos.
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new InvalidInstagramUrlError();
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") throw new InvalidInstagramUrlError();
  if (!INSTAGRAM_HOSTS.has(url.hostname.toLowerCase())) throw new InvalidInstagramUrlError();

  const path = url.pathname.replace(/\/+$/, "");
  if (!path || path === "/") throw new InvalidInstagramUrlError();

  return `https://www.instagram.com${path}/`;
}

/** Nombre legible para mostrar cuando quien la cargó no le puso uno. */
export function describeInstagramMusicUrl(url: string): string {
  if (/\/audio\//.test(url)) return "Audio de Instagram";
  if (/\/reels?\//.test(url)) return "Reel de Instagram";
  return "Enlace de Instagram";
}

/**
 * URL del iframe de Instagram para mostrar el enlace dentro del panel, o null
 * si ese enlace no se puede mostrar.
 *
 * Es una VISTA PREVIA, no un reproductor, y la diferencia importa: comprobado
 * el 2026-08-18 sobre un reel real, el triángulo de play del embed de
 * Instagram es un <a target="_blank"> a instagram.com
 * (utm_campaign=embed_video_watch) — al tocarlo el <video> del iframe sigue en
 * paused:true, currentTime:0 y se abre una pestaña nueva. Instagram no
 * permite reproducir su contenido embebido en otra página, así que acá se
 * muestra la portada, el autor y el acceso de un toque, nada más.
 *
 * Solo los permalinks de post/reel tienen /embed. La página de audio
 * (/reels/audio/<id>/) NO: agregarle /embed devuelve el sitio completo de
 * Instagram con el header de "Iniciar sesión" y un spinner que nunca resuelve
 * sin sesión, no la tarjeta embebible.
 *
 * El $ del final no es decorativo: sin él, /reels/audio/123/ haría match con
 * "audio" como si fuera el shortcode.
 */
export function instagramEmbedSrc(url: string): string | null {
  const shortcode = /^https:\/\/www\.instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)\/$/.exec(url)?.[1];
  return shortcode ? `https://www.instagram.com/p/${shortcode}/embed` : null;
}
