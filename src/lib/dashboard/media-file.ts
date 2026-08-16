/** Normalización de archivos antes de subirlos a Blob Storage.
 *
 * Lo usan los dos puntos de carga del proyecto: los artes de una propuesta
 * (ArtUploadZone) y el tablero del Moodboard. Vive acá y no en cada uno para
 * que no se arreglen a medias. Solo corre en el navegador. */

/** HEIC/HEIF: el formato con el que la cámara del iPhone guarda las fotos por
 * defecto. El archivo es una foto perfectamente válida, pero Chrome, Firefox
 * y Edge no lo saben decodificar, así que un `<img>` con ese blob queda en
 * blanco para siempre — se sube bien y nunca se ve. */
const HEIC_EXTENSION = /\.(heic|heif)$/i;

export function isHeic(file: File): boolean {
  // También por nombre: algunos navegadores entregan estos archivos con el
  // tipo MIME vacío, y filtrando solo por tipo se descartaban en silencio.
  return /image\/hei[cf]/i.test(file.type) || HEIC_EXTENSION.test(file.name);
}

/** ¿Es algo que podemos subir como arte? Contempla el HEIC de tipo vacío. */
export function isSupportedMedia(file: File, kind: "image" | "video"): boolean {
  if (kind === "video") return file.type.startsWith("video/");
  return file.type.startsWith("image/") || isHeic(file);
}

/** Pasa a JPEG lo que el navegador pueda decodificar pero no mostrar.
 *
 * Safari —también el del iPhone— sí decodifica HEIC, así que una foto subida
 * desde el teléfono se convierte ahí mismo y después se ve en cualquier lado.
 * Si el navegador tampoco puede decodificarla, tira con un mensaje en vez de
 * dejar guardado un archivo que nunca se va a poder ver.
 *
 * Cualquier otro archivo pasa de largo, sin tocarlo. */
export async function toDisplayableFile(file: File): Promise<File> {
  if (!isHeic(file)) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      `"${file.name}" está en formato HEIC y este navegador no puede abrirlo. Subila desde el iPhone, o cambiá Ajustes → Cámara → Formatos → "Más compatible".`,
    );
  }

  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92),
  );
  if (!blob) throw new Error(`No se pudo convertir "${file.name}" a un formato visible.`);

  return new File([blob], file.name.replace(HEIC_EXTENSION, ".jpg"), { type: "image/jpeg" });
}
