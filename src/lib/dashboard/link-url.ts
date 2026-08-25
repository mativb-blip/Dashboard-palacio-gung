/** Enlaces de las secciones **Canciones** y **Enlaces** de /inspiracion (ver
 * InspirationLink en el schema).
 *
 * Por qué no se acepta cualquier URL: igual que en instagram-music.ts, este
 * enlace después se pinta como un <a> que abre otra pestaña, así que dejarlo
 * como texto libre sería un "pegá cualquier URL" que cualquiera con sesión
 * puede usar para mandar a los demás a donde quiera.
 *
 * Por qué tampoco alcanza con instagram.com: una canción de referencia vive
 * en Spotify, YouTube o TikTok tanto como en Instagram, y rechazar un link de
 * Spotify en una sección que se llama "Canciones" no tendría sentido. La
 * salida es una lista de servicios de música conocidos — se mantiene la
 * propiedad de seguridad (no se puede apuntar a cualquier lado) sin
 * empobrecer la sección.
 */

import { InvalidInstagramUrlError, normalizeInstagramMusicUrl } from "./instagram-music";

/** Servicio de música → los hosts con los que se lo reconoce. El nombre es
 * también lo que se muestra cuando quien la carga no le pone título. */
const SERVICES: { name: string; hosts: string[] }[] = [
  { name: "Instagram", hosts: ["instagram.com", "www.instagram.com", "m.instagram.com"] },
  { name: "Spotify", hosts: ["open.spotify.com", "spotify.com", "www.spotify.com", "play.spotify.com"] },
  {
    name: "YouTube",
    hosts: ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"],
  },
  { name: "TikTok", hosts: ["tiktok.com", "www.tiktok.com", "vm.tiktok.com", "m.tiktok.com"] },
  { name: "Apple Music", hosts: ["music.apple.com"] },
  { name: "SoundCloud", hosts: ["soundcloud.com", "www.soundcloud.com", "m.soundcloud.com"] },
];

const HOST_TO_SERVICE = new Map(
  SERVICES.flatMap((service) => service.hosts.map((host) => [host, service.name] as const)),
);

const SERVICE_NAMES = SERVICES.map((s) => s.name).join(", ");

/** Parámetros que solo sirven para rastrear a quien compartió el enlace. Se
 * quitan, pero el resto de la query se RESPETA — a diferencia de Instagram,
 * donde el permalink es todo path, acá la query es la canción misma
 * (`youtube.com/watch?v=…` sin `v` no es nada). */
const TRACKING_PARAMS = ["si", "igsh", "fbclid", "gclid", "context", "pi", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

export class InvalidSongUrlError extends Error {
  constructor() {
    super(`Pegá un enlace de ${SERVICE_NAMES}.`);
    this.name = "InvalidSongUrlError";
  }
}

/**
 * Devuelve la URL canónica del enlace de una canción, o tira
 * InvalidSongUrlError.
 *
 * Los enlaces de Instagram pasan por normalizeInstagramMusicUrl() para que
 * queden con la misma forma que los de la música de una propuesta — así el
 * mismo reel guardado en los dos lados es el mismo string, y sigue sirviendo
 * instagramEmbedSrc() para previsualizarlo.
 */
export function normalizeSongUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new InvalidSongUrlError();

  // Sin protocolo ("open.spotify.com/track/…") el constructor de URL lo
  // tomaría como path relativo.
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new InvalidSongUrlError();
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") throw new InvalidSongUrlError();

  const host = url.hostname.toLowerCase();
  const service = HOST_TO_SERVICE.get(host);
  if (!service) throw new InvalidSongUrlError();

  if (service === "Instagram") {
    try {
      return normalizeInstagramMusicUrl(trimmed);
    } catch (e) {
      // El host ya era de Instagram, así que si falló es por el path (un
      // perfil pelado, la raíz). Se traduce al error de esta sección para no
      // mostrar dos mensajes distintos por el mismo campo.
      if (e instanceof InvalidInstagramUrlError) throw new InvalidSongUrlError();
      throw e;
    }
  }

  const path = url.pathname.replace(/\/+$/, "");
  if (!path || path === "/") throw new InvalidSongUrlError();

  for (const param of TRACKING_PARAMS) url.searchParams.delete(param);
  const query = url.searchParams.toString();

  return `https://${host}${path}${query ? `?${query}` : ""}`;
}

/** Nombre legible para cuando quien la cargó no le puso título. */
export function describeSongUrl(url: string): string {
  try {
    return HOST_TO_SERVICE.get(new URL(url).hostname.toLowerCase()) ?? "Enlace";
  } catch {
    return "Enlace";
  }
}

// --- Sección Enlaces ----------------------------------------------------

export class InvalidExternalUrlError extends Error {
  constructor() {
    super("Pegá un enlace que empiece con http:// o https://.");
    this.name = "InvalidExternalUrlError";
  }
}

/**
 * Normaliza un enlace cualquiera para la sección **Enlaces**.
 *
 * Acá sí se acepta cualquier host, porque el punto de la sección es guardar
 * referencias de donde sea (un artículo, una carta, una cuenta). Lo que NO se
 * afloja es el esquema: solo http/https. Ese es el filtro que importa —
 * `javascript:` o `data:` en un href ejecutan en nuestra página, mientras que
 * un dominio ajeno solo abre una pestaña.
 *
 * La contrapartida queda a la vista y no escondida: la UI muestra el host
 * real de cada enlace debajo del título, así que nadie llega a un dominio
 * distinto del que dice ir. Los <a> además van con rel="noopener noreferrer".
 */
export function normalizeExternalUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new InvalidExternalUrlError();

  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new InvalidExternalUrlError();
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") throw new InvalidExternalUrlError();
  if (!url.hostname) throw new InvalidExternalUrlError();

  for (const param of TRACKING_PARAMS) url.searchParams.delete(param);
  return url.toString();
}

/** Host visible de un enlace, para mostrarlo debajo del título. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
