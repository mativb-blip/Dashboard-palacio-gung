/** Valida que una URL sea de nuestro storage de Vercel Blob.
 *
 * Todo archivo que el navegador sube directo a Blob (audio de música,
 * fotos de la galería) llega al server como una URL de texto, no como el
 * archivo en sí — el server nunca lo ve, así que lo único que puede
 * comprobar es que la URL sea de nuestro storage. Sin esto, el campo sería
 * un "pegá cualquier URL" que después se carga como `<audio src>`/`<img
 * src>` en la pantalla de todos. */
export function assertBlobUrl(url: string, errorMessage = "No se pudo subir el archivo."): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(errorMessage);
  }
  const ok =
    parsed.protocol === "https:" &&
    (parsed.hostname.endsWith(".public.blob.vercel-storage.com") ||
      parsed.hostname.endsWith(".blob.vercel-storage.com"));
  if (!ok) throw new Error(errorMessage);
  return parsed.toString();
}
