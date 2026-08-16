/** Exportador del Moodboard: captura de pantalla de la pestaña, recortada al
 * recuadro rojo y escalada al tamaño de hoja elegido.
 *
 * Por qué una captura y no dibujar cada elemento a mano sobre un canvas: los
 * reels embebidos son iframes de OTRO origen, y ninguna página puede
 * rasterizar el contenido de un iframe ajeno (es una barrera de seguridad del
 * navegador, no una limitación de la librería de turno). La API de captura de
 * pantalla sí puede, porque los píxeles los compone el navegador y el usuario
 * da permiso explícito cada vez.
 *
 * El precio es la resolución: sale lo que hay en pantalla, así que conviene
 * acercar el tablero para que el recuadro ocupe lo más posible antes de
 * exportar (ver el indicador de ppp efectivos en la barra del recuadro).
 */

/** Puntos por pulgada del PNG resultante. La captura se escala a esta medida;
 * si en pantalla había menos píxeles, el archivo sale del tamaño correcto
 * para imprimir pero interpolado. */
export const EXPORT_DPI = 150;

export interface PaperPreset {
  key: string;
  label: string;
  /** Pulgadas, en vertical. La orientación las intercambia. */
  widthIn: number;
  heightIn: number;
}

export const PAPER_PRESETS: PaperPreset[] = [
  { key: "carta", label: "Carta · 8.5 × 11 pulg.", widthIn: 8.5, heightIn: 11 },
  { key: "tabloide", label: "Tabloide · 11 × 17 pulg.", widthIn: 11, heightIn: 17 },
];

export type Orientation = "vertical" | "horizontal";

export function paperSize(preset: PaperPreset, orientation: Orientation) {
  const [widthIn, heightIn] =
    orientation === "vertical" ? [preset.widthIn, preset.heightIn] : [preset.heightIn, preset.widthIn];
  return { widthIn, heightIn, ratio: widthIn / heightIn };
}

/** Los ppp que de verdad va a tener el archivo: cuántos píxeles reales de
 * pantalla cubre el recuadro, repartidos sobre las pulgadas de la hoja. Sirve
 * para avisar antes de exportar si conviene acercar más el tablero. */
export function effectiveDpi(frameWidthCss: number, widthIn: number): number {
  const devicePixels = frameWidthCss * (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
  return Math.round(devicePixels / widthIn);
}

/** El recuadro a recortar, en píxeles CSS relativos a la ventana (no al
 * viewport del canvas): es lo que se puede mapear contra la captura. */
export interface CaptureCrop {
  left: number;
  top: number;
  width: number;
  height: number;
}

export class ExportCaptureError extends Error {}

/** Espera a que el navegador haya pintado de verdad. Dos cuadros: el primero
 * agenda el repintado, el segundo corre ya con el DOM nuevo en pantalla. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

/** Margen extra después de ocultar la interfaz. El flujo de captura tiene su
 * propia latencia: sin esta espera el cuadro que leemos puede ser anterior a
 * que desaparecieran las barras y el recuadro rojo. */
const CAPTURE_SETTLE_MS = 320;

interface CaptureOptions {
  preset: PaperPreset;
  orientation: Orientation;
  /** Corre después de tener el permiso y antes de leer el cuadro: acá el
   * llamador esconde sus propias barras y el recuadro. */
  onBeforeGrab: () => void;
  /** Corre siempre al terminar, con o sin error. */
  onAfterGrab: () => void;
  /** Se llama con el recorte ya calculado, después de esconder la interfaz —
   * las medidas se toman recién ahí por si el layout cambió al ocultarla. */
  measureCrop: () => CaptureCrop | null;
}

/** Pide la captura, recorta el recuadro y devuelve el PNG del tamaño de hoja. */
export async function captureFrameToBlob({
  preset,
  orientation,
  onBeforeGrab,
  onAfterGrab,
  measureCrop,
}: CaptureOptions): Promise<Blob> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new ExportCaptureError("Este navegador no permite capturar la pantalla.");
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      // Pedimos mucha resolución: el navegador da como mucho la real de la
      // pantalla, y de ahí depende la nitidez del archivo impreso.
      video: { width: { ideal: 4096 }, height: { ideal: 4096 }, frameRate: { ideal: 5 } },
      audio: false,
      // Chrome: deja la pestaña actual como opción destacada del selector.
      preferCurrentTab: true,
      selfBrowserSurface: "include",
      surfaceSwitching: "exclude",
    } as DisplayMediaStreamOptions);
  } catch (e) {
    // Cancelar el selector entra por acá y no es un error que valga reportar
    // como falla: fue una decisión del usuario.
    throw new ExportCaptureError(
      (e as Error)?.name === "NotAllowedError"
        ? "Se canceló la captura."
        : "No se pudo iniciar la captura de pantalla.",
    );
  }

  const track = stream.getVideoTracks()[0];
  const stop = () => stream.getTracks().forEach((t) => t.stop());

  try {
    // Solo sirve la captura de ESTA pestaña: de una ventana o del escritorio
    // entero no podemos saber dónde cae el recuadro dentro de la imagen.
    if (track.getSettings().displaySurface !== "browser") {
      throw new ExportCaptureError(
        'Elegí "Esta pestaña" en el selector de captura — con una ventana o la pantalla completa no se puede recortar el recuadro.',
      );
    }

    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();

    onBeforeGrab();
    await nextPaint();
    await new Promise((resolve) => setTimeout(resolve, CAPTURE_SETTLE_MS));
    await nextPaint();

    const crop = measureCrop();
    if (!crop) throw new ExportCaptureError("No se pudo ubicar el recuadro de exportación.");

    const captureWidth = video.videoWidth;
    const captureHeight = video.videoHeight;
    if (!captureWidth || !captureHeight) {
      throw new ExportCaptureError("La captura llegó vacía. Probá de nuevo.");
    }

    // La captura de una pestaña cubre exactamente su viewport, así que el
    // mapeo de píxeles CSS a píxeles de captura es una regla de tres.
    const scaleX = captureWidth / window.innerWidth;
    const scaleY = captureHeight / window.innerHeight;

    const { widthIn, heightIn } = paperSize(preset, orientation);
    const outWidth = Math.round(widthIn * EXPORT_DPI);
    const outHeight = Math.round(heightIn * EXPORT_DPI);

    const canvas = document.createElement("canvas");
    canvas.width = outWidth;
    canvas.height = outHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new ExportCaptureError("El navegador no pudo crear el lienzo de exportación.");

    context.imageSmoothingQuality = "high";
    context.drawImage(
      video,
      crop.left * scaleX,
      crop.top * scaleY,
      crop.width * scaleX,
      crop.height * scaleY,
      0,
      0,
      outWidth,
      outHeight,
    );

    video.srcObject = null;

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new ExportCaptureError("No se pudo generar la imagen."));
      }, "image/png");
    });
  } finally {
    stop();
    onAfterGrab();
  }
}
