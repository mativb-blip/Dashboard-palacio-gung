/** MIME por extensión para los formatos de audio que alguien podría subir —
 * al panel de música de una propuesta existente o a la ventana de carga.
 * `.m4a` es el caso que rompe si se confía en `file.type`: el navegador lo
 * deriva de cómo el SO tenga asociada la extensión, y en más de un caso real
 * (Chrome en Android/Linux sin esa asociación) llega vacío — Vercel Blob
 * rechaza la subida con "contentType ... is not allowed" porque un `""` no
 * matchea el `audio/*` que exige /api/blob/upload, y eso es lo que se ve como
 * "no funciona subir el audio". Forzar el MIME por extensión saca esa
 * adivinanza del medio. */
const AUDIO_MIME_BY_EXTENSION: Record<string, string> = {
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  aac: "audio/aac",
  flac: "audio/flac",
  webm: "audio/webm",
};

export function resolveAudioContentType(file: File): string | undefined {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && AUDIO_MIME_BY_EXTENSION[ext]) return AUDIO_MIME_BY_EXTENSION[ext];
  // Extensión no reconocida: si el navegador ya mandó algo razonable, se
  // respeta; si no, se deja sin override y que Vercel Blob intente derivarlo
  // del nombre del archivo.
  return file.type.startsWith("audio/") ? file.type : undefined;
}
