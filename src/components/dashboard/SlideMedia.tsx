"use client";

import { isVideoUrl } from "@/lib/dashboard/media-file";

/**
 * Pinta una diapositiva de una propuesta sin que quien la usa tenga que
 * saber si es foto o video.
 *
 * Existe desde que un Carrusel puede mezclar las dos (ver
 * `supportsVideoSlides`): antes, `Proposal.images` solo tenía fotos y
 * cuatro lugares distintos hacían `<img src={images[i]}>`. Con un video en
 * esa lista, los cuatro pintaban un recuadro roto. Está en un solo archivo
 * para que la próxima pantalla que muestre artes no repita la decisión —
 * y para que arreglarla no quede a medias en alguna.
 *
 * No cubre el visor grande de la vista Post (`ArtSlot` en ArtViewer): ese ya
 * tenía su propio `<video>` con portada, controles y el placeholder de
 * ArtTile para cuando no hay nada cargado.
 */
export default function SlideMedia({
  src,
  alt,
  className,
  controls = false,
}: {
  src: string;
  alt: string;
  className?: string;
  /** Miniaturas van sin controles (no se miran, se reconocen); una vista
   * grande sí los lleva, para poder ver el video ahí mismo. */
  controls?: boolean;
}) {
  if (isVideoUrl(src)) {
    return (
      <video
        // `#t=0.1` pide el primer fotograma como cartel. Sin eso, un video
        // sin `poster` se pinta como un rectángulo negro hasta que alguien
        // le da play — y una miniatura negra no se distingue de un error.
        src={controls ? src : `${src}#t=0.1`}
        className={className}
        controls={controls}
        playsInline
        muted={!controls}
        preload="metadata"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- contenido cargado por el usuario, no un asset del sitio
    <img src={src} alt={alt} className={className} />
  );
}
