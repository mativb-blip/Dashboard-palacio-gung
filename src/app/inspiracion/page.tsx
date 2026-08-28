"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ArtUploadZone, { type UploadedFile, uploadBlob } from "@/components/dashboard/ArtUploadZone";
import Topbar from "@/components/dashboard/Topbar";
import { useBrand } from "@/lib/dashboard/BrandContext";
import { resolveAudioContentType } from "@/lib/dashboard/audio";
import {
  addInspirationItem,
  addInspirationLink,
  addInspirationStory,
  deleteInspirationItem,
  deleteInspirationLink,
  deleteInspirationStory,
  getInspirationItems,
  getInspirationLinks,
  getInspirationStories,
} from "@/lib/dashboard/inspiration-actions";
import { instagramEmbedSrc } from "@/lib/dashboard/instagram-music";
import { describeSongUrl, hostOf } from "@/lib/dashboard/link-url";
import { isVideoUrl } from "@/lib/dashboard/media-file";
import { handleLiquidPointerEnter, iconButtonClass, PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import type {
  InspirationItem,
  InspirationKind,
  InspirationLinkItem,
  InspirationLinkKind,
  InspirationStory,
} from "@/types/dashboard";

/** Carpeta fija en Blob para las historias — no hay propuesta detrás, ese
 * prop de ArtUploadZone solo organiza la ruta. */
const STORY_FOLDER = "inspiration-stories";

/** Carpeta fija en Blob para los audios de las canciones. */
const SONG_FOLDER = "inspiration-songs";

/** Proporción del recuadro por sección. El embed de Instagram no es solo el
 * medio: arriba lleva el encabezado de la cuenta y abajo la barra de
 * like/comentar, así que un reel 9:16 termina en un recuadro más alto que
 * 9:16 y una foto cuadrada en uno más alto que 1:1. */
const ASPECT: Record<InspirationKind, string> = {
  reel: "9 / 16",
  photo: "2 / 3",
};

export default function InspiracionPage() {
  const { brandName } = useBrand();
  const { data: session } = useSession();
  // Todo Inspiración es editable por cualquiera con sesión, Jun incluido: es
  // un repositorio de referencias, no contenido que se publique. El gate real
  // vive en el server (ver requireEditor en inspiration-actions.ts).
  const canEdit = Boolean(session);

  // El visor ampliado vive a nivel de página (es un overlay fijo) y lo
  // comparten las dos secciones. Se guarda el ítem entero y no solo la URL
  // porque el alto del recuadro depende de si es reel o foto.
  const [expanded, setExpanded] = useState<InspirationItem | null>(null);
  const expandedEmbedSrc = expanded ? instagramEmbedSrc(expanded.url) : null;
  // Las historias son archivos propios, no embeds — visor aparte.
  const [expandedFile, setExpandedFile] = useState<InspirationStory | null>(null);

  return (
    <div className="flex min-h-screen flex-col font-sans text-brand-ink">
      <div className="flex h-[3px] w-full shrink-0">
        <span className="w-16 bg-brand-red" />
        <span className="flex-1 bg-brand-blue" />
      </div>

      <Topbar view="inspiracion" planLabel={brandName} />
      <div className="flex justify-start px-4 pb-2 desktop:px-8">
        <Link
          href="/"
          className={`inline-block text-xs font-bold text-brand-blue transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
        >
          ‹ Volver al panel
        </Link>
      </div>
      <div className="h-px shrink-0 bg-line" />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 desktop:px-8">
        <div>
          <div className="text-[11px] tracking-label text-tx-3 uppercase">Plan de contenido</div>
          <h1 className="text-2xl font-bold">Inspiración</h1>
          <p className="mt-1 text-sm text-tx-2">
            Repositorio de referencias para mirar antes de producir.
          </p>
        </div>

        <InspirationSection
          kind="reel"
          title="Reels"
          description="Pegá un link de Instagram y quedan todos juntos para mirar."
          canEdit={canEdit}
          onExpand={setExpanded}
        />

        <InspirationSection
          kind="photo"
          title="Posts con foto"
          description="Referencias de encuadre, montaje, luz y estilo de plato — el post se ve y se puede usar acá mismo."
          canEdit={canEdit}
          onExpand={setExpanded}
        />

        <StoriesSection canEdit={canEdit} onExpandFile={setExpandedFile} />

        <LinkListSection
          kind="song"
          title="Canciones"
          description="Subí el audio para escucharla acá mismo, o pegá el enlace de Spotify, YouTube, Instagram, TikTok, Apple Music o SoundCloud."
          placeholder="Pegá el enlace de la canción (opcional si subís el audio)"
          canEdit={canEdit}
        />

        <LinkListSection
          kind="link"
          title="Enlaces"
          description="Cualquier referencia que valga la pena tener a mano: un artículo, una cuenta, una carta, un menú."
          placeholder="Pegá el enlace"
          canEdit={canEdit}
        />
      </div>

      {/* Visor ampliado: el mismo embed pero grande, para cuando la celda de
          la grilla queda chica (sobre todo en el teléfono, a dos columnas). */}
      {expanded && expandedEmbedSrc && (
        <div className="fixed inset-0 z-50" onClick={() => setExpanded(null)}>
          {/* El fondo oscuro y desenfocado va en su PROPIA capa, hermana del
              iframe y no ancestro suyo. Con backdrop-filter en un ancestro,
              Safari de iPhone/iPad pinta en blanco los iframes de otro
              origen — que es exactamente el reel quedándose vacío al
              maximizar. Sobre un <img> no pasa, por eso la Galería sí puede
              llevar el blur en el mismo nodo. */}
          <div className="absolute inset-0 bg-black/75 backdrop-blur-lg" />

          <div className="relative flex h-full items-center justify-center p-4">
            <div
              className="w-full max-w-[380px]"
              onClick={(e) => e.stopPropagation()}
              // Alto según el tipo: un reel es mucho más alto que un post con
              // foto, y forzar los dos a la misma proporción recortaba el
              // video.
              style={{ aspectRatio: ASPECT[expanded.kind] }}
            >
              <iframe
                src={expandedEmbedSrc}
                className="h-full w-full rounded"
                style={{ border: 0 }}
                allow="autoplay; encrypted-media; fullscreen"
                allowFullScreen
                scrolling="no"
                title="Post de Instagram"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setExpanded(null)}
            aria-label="Cerrar"
            className={`absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
          >
            <CloseIcon />
          </button>
        </div>
      )}
      {/* Visor de una historia. El fondo desenfocado va en capa aparte por
          la misma razón que el de embeds: con backdrop-filter en un ancestro,
          Safari de iPhone/iPad puede dejar el medio en blanco. */}
      {expandedFile && (
        <div className="fixed inset-0 z-50" onClick={() => setExpandedFile(null)}>
          <div className="absolute inset-0 bg-black/75 backdrop-blur-lg" />

          <div className="relative flex h-full items-center justify-center p-4">
            <div onClick={(e) => e.stopPropagation()} className="flex max-h-full items-center">
              {isVideoUrl(expandedFile.url) ? (
                <video
                  src={expandedFile.url}
                  controls
                  autoPlay
                  className="max-h-[85vh] max-w-full rounded"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- archivo del usuario
                <img
                  src={expandedFile.url}
                  alt={expandedFile.filename ?? "Historia de referencia"}
                  className="max-h-[85vh] max-w-full rounded object-contain"
                />
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setExpandedFile(null)}
            aria-label="Cerrar"
            className={`absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </div>
  );
}

/** Historias: capturas de pantalla y videos subidos. A diferencia de las
 * otras dos secciones no son enlaces — una historia expira y no tiene
 * permalink embebible, así que el archivo es la única forma de guardarla. */
function StoriesSection({
  canEdit,
  onExpandFile,
}: {
  canEdit: boolean;
  onExpandFile: (story: InspirationStory) => void;
}) {
  const [stories, setStories] = useState<InspirationStory[]>([]);
  const [loading, setLoading] = useState(true);
  // Cola transitoria del selector: se vacía apenas cada archivo se persiste
  // — la grilla de abajo es la única fuente de verdad.
  const [pendingFiles, setPendingFiles] = useState<UploadedFile[]>([]);

  useEffect(() => {
    let cancelled = false;
    getInspirationStories().then((data) => {
      if (cancelled) return;
      setStories(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleFilesChange(next: UploadedFile[]) {
    setPendingFiles([]);
    for (const file of next) {
      try {
        const saved = await addInspirationStory(file.url, file.name);
        setStories((prev) => [saved, ...prev]);
      } catch (e) {
        alert(e instanceof Error ? e.message : "No se pudo subir el archivo.");
      }
    }
  }

  async function handleDelete(story: InspirationStory) {
    if (!window.confirm("¿Borrar esta historia del repositorio?")) return;
    setStories((prev) => prev.filter((s) => s.id !== story.id));
    try {
      await deleteInspirationStory(story.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo borrar.");
      setStories((prev) => [story, ...prev]);
    }
  }

  return (
    <>
      <div className="mt-2 border-t border-line pt-5">
        <h2 className="text-lg font-bold">Historias</h2>
        <p className="mt-1 text-sm text-tx-2">
          Capturas de pantalla y videos de historias. Van como archivo y no como enlace: una historia
          expira y no se puede embeber.
        </p>
      </div>

      {canEdit && (
        <ArtUploadZone
          label="Subir capturas o videos"
          accept="image/*,video/*"
          multiple
          files={pendingFiles}
          onFilesChange={handleFilesChange}
          proposalId={STORY_FOLDER}
        />
      )}

      {loading ? (
        <p className="text-sm text-tx-3">Cargando…</p>
      ) : stories.length === 0 ? (
        <p className="text-sm text-tx-3">
          {canEdit ? "Todavía no se subió ninguna historia." : "Todavía no hay historias."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 desktop:grid-cols-3 desktop:gap-4">
          {stories.map((story) => (
            <div
              key={story.id}
              className="group relative overflow-hidden rounded border border-line-2 bg-panel-2"
              style={{ aspectRatio: "9 / 16" }}
            >
              <button
                type="button"
                onClick={() => onExpandFile(story)}
                className={`absolute inset-0 h-full w-full transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
                aria-label={story.filename ? `Ver ${story.filename}` : "Ver historia"}
              >
                {isVideoUrl(story.url) ? (
                  // Sin controles ni sonido: es una miniatura, el video se
                  // mira en el visor. `preload="metadata"` trae solo la
                  // cabecera, no el archivo entero.
                  //
                  // El `#t=0.1` no es decorativo: sin ese fragmento el
                  // recuadro queda NEGRO, porque con preload="metadata" el
                  // navegador no se compromete a pintar ningún cuadro.
                  // Pedirle un instante concreto lo obliga a buscar ahí y
                  // dibujarlo, que es lo que hace las veces de portada.
                  <video
                    src={`${story.url}#t=0.1`}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- archivo del usuario
                  <img
                    src={story.url}
                    alt={story.filename ?? "Historia de referencia"}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                )}
              </button>

              {isVideoUrl(story.url) && (
                <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  VIDEO
                </span>
              )}

              {canEdit && (
                <button
                  type="button"
                  onClick={() => handleDelete(story)}
                  aria-label="Quitar esta historia"
                  title="Quitar esta historia"
                  className={`absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-brand-ink/70 text-[var(--bg)] transition-opacity duration-[250ms] ${PRESS_SCALE_CLASS}`}
                >
                  <TrashIcon />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** Una de las dos secciones. Cada una trae y guarda lo suyo (mismo
 * componente, distinto `kind`) — las dos se ven y se comportan igual, que es
 * justamente el punto: un reel y un post con foto son el mismo objeto. */
function InspirationSection({
  kind,
  title,
  description,
  canEdit,
  onExpand,
}: {
  kind: InspirationKind;
  title: string;
  description: string;
  canEdit: boolean;
  onExpand: (item: InspirationItem) => void;
}) {
  const [items, setItems] = useState<InspirationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getInspirationItems(kind).then((data) => {
      if (cancelled) return;
      setItems(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  function resetComposer() {
    setAdding(false);
    setUrl("");
    setError("");
  }

  async function handleAdd() {
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Pegá el link de un post de Instagram.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await addInspirationItem(trimmed, kind);
      setItems((prev) => [saved, ...prev]);
      resetComposer();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo agregar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: InspirationItem) {
    if (!window.confirm("¿Borrar esta referencia del repositorio?")) return;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    try {
      await deleteInspirationItem(item.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo borrar.");
      setItems((prev) => [item, ...prev]);
    }
  }

  return (
    <>
      {/* `min-w-0 flex-1` en el bloque de texto: sin eso el párrafo reclama
          su ancho natural y empuja el "+" a una línea propia abajo a la
          izquierda, que es justo donde no se lo busca. Con esto el texto se
          encoge y el botón se queda arriba a la derecha, como en las otras
          secciones. */}
      <div className="mt-2 flex items-start justify-between gap-3 border-t border-line pt-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="mt-1 text-sm text-tx-2">{description}</p>
        </div>
        {canEdit && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            onPointerEnter={handleLiquidPointerEnter}
            className={`${iconButtonClass} shrink-0`}
            title={`Agregar a ${title}`}
            aria-label={`Agregar a ${title}`}
          >
            <PlusIcon className="relative" />
          </button>
        )}
      </div>

      {adding && (
        <div className="flex flex-col gap-2 rounded border border-line-2 bg-panel-2 p-3 desktop:max-w-md">
          <input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError("");
            }}
            placeholder="Pegá el link del post de Instagram"
            inputMode="url"
            autoFocus
            className="min-h-9 w-full rounded border border-line-2 bg-[var(--bg)] px-3 text-[13px] text-brand-ink"
          />
          {error && <p className="text-[11px] leading-[1.4] text-[var(--color-brand-red-text)]">{error}</p>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={resetComposer}
              className={`inline-flex min-h-9 items-center rounded border border-line-2 bg-[var(--bg)] px-3.5 text-xs leading-none font-bold tracking-[0.04em] text-brand-ink transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving || !url.trim()}
              className={`inline-flex min-h-9 items-center rounded border border-brand-blue bg-brand-blue px-3.5 text-xs leading-none font-bold tracking-[0.04em] text-[var(--bg)] transition-transform duration-[400ms] disabled:cursor-default disabled:opacity-60 ${PRESS_SCALE_CLASS}`}
            >
              {saving ? "Agregando…" : "Agregar"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-tx-3">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-tx-3">
          {canEdit ? "Todavía no se agregó ninguna referencia." : "Todavía no hay referencias."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 desktop:grid-cols-3 desktop:gap-4">
          {items.map((item) => {
            const embedSrc = instagramEmbedSrc(item.url);
            if (!embedSrc) return null;
            return (
              <div key={item.id} className="flex flex-col gap-1">
                <div
                  className="relative overflow-hidden rounded border border-line-2 bg-panel-2"
                  style={{ aspectRatio: ASPECT[item.kind] }}
                >
                {/* El embed se monta también en el teléfono — antes acá había
                    una tarjeta liviana y el reel no se previsualizaba, que es
                    justo lo que se quería ver. `loading="lazy"` es lo que
                    mantiene el costo bajo: los que están fuera de pantalla no
                    piden nada hasta que se llega a ellos.
                    El chrome de adentro es de Instagram y vive en otro origen;
                    su play abre Instagram en pestaña nueva, no reproduce acá
                    (ver instagramEmbedSrc en instagram-music.ts). */}
                <iframe
                  src={embedSrc}
                  className="h-full w-full"
                  style={{ border: 0 }}
                  allow="autoplay; encrypted-media; fullscreen"
                  allowFullScreen
                  scrolling="no"
                  loading="lazy"
                    title="Post de Instagram"
                  />
                </div>

                {/* Los controles van DEBAJO del embed, no encima: el embed
                    trae su propio encabezado (foto de perfil, "Ver perfil") y
                    un botón flotante ahí arriba se le monta justo encima. Y
                    aunque no chocara, el iframe es de otro origen y se queda
                    con todos los toques — no habría forma de ampliar. */}
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => onExpand(item)}
                    onPointerEnter={handleLiquidPointerEnter}
                    aria-label="Ampliar"
                    title="Ampliar"
                    className={iconButtonClass}
                  >
                    <ExpandIcon className="relative" />
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
                      onPointerEnter={handleLiquidPointerEnter}
                      aria-label="Quitar esta referencia"
                      title="Quitar esta referencia"
                      className={iconButtonClass}
                    >
                      <TrashIcon className="relative" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/** Canciones y Enlaces. Un mismo componente para las dos, como
 * InspirationSection lo es para Reels y Posts con foto: las dos secciones son
 * una lista de URLs con título, y lo único que cambia es qué se acepta como
 * URL (lo decide el server) y si se puede adjuntar un audio.
 *
 * Es una lista y no una grilla a propósito: no hay nada que mirar, hay algo
 * que leer y abrir — una miniatura cuadrada de un enlace es espacio gastado. */
function LinkListSection({
  kind,
  title,
  description,
  placeholder,
  canEdit,
}: {
  kind: InspirationLinkKind;
  title: string;
  description: string;
  placeholder: string;
  canEdit: boolean;
}) {
  const isSong = kind === "song";
  const [items, setItems] = useState<InspirationLinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  // Audio ya subido a Blob para la canción que se está armando: todavía no
  // hay fila, así que espera acá hasta que se confirme "Agregar". Si se
  // cancela queda huérfano en Blob — mismo trade-off que el panel de música.
  const [audio, setAudio] = useState<{ url: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Una vista previa a la vez: cada una es un iframe de varios cientos de KB.
  const [previewId, setPreviewId] = useState("");
  const audioInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    getInspirationLinks(kind).then((data) => {
      if (cancelled) return;
      setItems(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  function resetComposer() {
    setAdding(false);
    setUrl("");
    setName("");
    setAudio(null);
    setError("");
  }

  async function handleAudioFile(file: File) {
    setUploading(true);
    setError("");
    try {
      // resolveAudioContentType fuerza el MIME por extensión: en .m4a el
      // navegador manda `file.type` vacío y Blob rechaza la subida.
      const uploaded = await uploadBlob(SONG_FOLDER, file, undefined, undefined, resolveAudioContentType(file));
      setAudio({ url: uploaded, name: file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir el audio.");
    } finally {
      setUploading(false);
    }
  }

  async function handleAdd() {
    const trimmedUrl = url.trim();
    // La validación que manda es la del server; se adelanta acá nada más que
    // para no gastar un round-trip en el caso obvio de dejar todo vacío.
    if (!trimmedUrl && !audio) {
      setError(isSong ? "Pegá un enlace o subí un archivo de audio." : "Pegá un enlace.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await addInspirationLink(kind, {
        url: trimmedUrl || undefined,
        title: name.trim() || undefined,
        audioUrl: audio?.url,
        audioName: audio?.name,
      });
      setItems((prev) => [saved, ...prev]);
      resetComposer();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo agregar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: InspirationLinkItem) {
    if (!window.confirm("¿Borrar esto del repositorio?")) return;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    try {
      await deleteInspirationLink(item.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo borrar.");
      setItems((prev) => [item, ...prev]);
    }
  }

  /** Qué mostrar como nombre cuando quien lo cargó no escribió uno. */
  function displayName(item: InspirationLinkItem): string {
    if (item.title) return item.title;
    if (item.url) return isSong ? describeSongUrl(item.url) : hostOf(item.url) || "Enlace";
    return item.audioName || "Audio subido";
  }

  return (
    <>
      {/* `min-w-0 flex-1` en el bloque de texto: sin eso el párrafo reclama
          su ancho natural y empuja el "+" a una línea propia abajo a la
          izquierda, que es justo donde no se lo busca. Con esto el texto se
          encoge y el botón se queda arriba a la derecha, como en las otras
          secciones. */}
      <div className="mt-2 flex items-start justify-between gap-3 border-t border-line pt-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="mt-1 text-sm text-tx-2">{description}</p>
        </div>
        {canEdit && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            onPointerEnter={handleLiquidPointerEnter}
            className={`${iconButtonClass} shrink-0`}
            title={`Agregar a ${title}`}
            aria-label={`Agregar a ${title}`}
          >
            <PlusIcon className="relative" />
          </button>
        )}
      </div>

      {adding && (
        <div className="flex flex-col gap-2 rounded border border-line-2 bg-panel-2 p-3 desktop:max-w-md">
          <input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError("");
            }}
            placeholder={placeholder}
            inputMode="url"
            autoFocus
            className="min-h-9 w-full rounded border border-line-2 bg-[var(--bg)] px-3 text-[13px] text-brand-ink"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isSong ? "Nombre de la canción (opcional)" : "Título (opcional)"}
            className="min-h-9 w-full rounded border border-line-2 bg-[var(--bg)] px-3 text-[13px] text-brand-ink"
          />

          {isSong && (
            <>
              {/* El archivo es lo único que se puede REPRODUCIR acá: ni
                  Instagram ni Spotify dejan sonar lo suyo en otra página, así
                  que un enlace solo alcanza para abrir la pestaña. */}
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void handleAudioFile(file);
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => audioInputRef.current?.click()}
                  disabled={uploading}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded border border-line-2 bg-[var(--bg)] px-3 text-xs leading-none font-bold text-brand-ink transition-transform duration-[400ms] disabled:opacity-60 ${PRESS_SCALE_CLASS}`}
                >
                  <UploadIcon className="h-3.5 w-3.5" />
                  {uploading ? "Subiendo…" : audio ? "Cambiar audio" : "Subir audio"}
                </button>
                {audio && <span className="min-w-0 truncate text-[11px] text-tx-3">{audio.name}</span>}
              </div>
            </>
          )}

          {error && <p className="text-[11px] leading-[1.4] text-[var(--color-brand-red-text)]">{error}</p>}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={resetComposer}
              className={`inline-flex min-h-9 items-center rounded border border-line-2 bg-[var(--bg)] px-3.5 text-xs leading-none font-bold tracking-[0.04em] text-brand-ink transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving || uploading || (!url.trim() && !audio)}
              className={`inline-flex min-h-9 items-center rounded border border-brand-blue bg-brand-blue px-3.5 text-xs leading-none font-bold tracking-[0.04em] text-[var(--bg)] transition-transform duration-[400ms] disabled:cursor-default disabled:opacity-60 ${PRESS_SCALE_CLASS}`}
            >
              {saving ? "Agregando…" : "Agregar"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-tx-3">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-tx-3">
          {canEdit ? "Todavía no se agregó nada acá." : "Todavía no hay nada acá."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => {
            const embedSrc = item.url ? instagramEmbedSrc(item.url) : null;
            const showingPreview = previewId === item.id;
            return (
              <div key={item.id} className="rounded border border-line-2 bg-panel-2">
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <div className="flex min-w-0 flex-1 flex-col">
                    {item.url ? (
                      // Pestaña nueva y avisado con el ícono: sin eso, en el
                      // teléfono parece que la app se fue y se perdió lo que
                      // se estaba mirando.
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-w-0 items-center gap-1.5 text-[13px] text-brand-ink underline-offset-2 hover:text-brand-blue [&:hover>span]:underline"
                        title={`Abrir en pestaña nueva — ${item.url}`}
                      >
                        <span className="truncate">{displayName(item)}</span>
                        <ExternalLinkIcon className="h-3 w-3 shrink-0 opacity-60" />
                      </a>
                    ) : (
                      <span className="truncate text-[13px] text-brand-ink">{displayName(item)}</span>
                    )}
                    {/* El host va SIEMPRE a la vista. La sección Enlaces
                        acepta cualquier dominio, así que un título puede
                        decir una cosa y el enlace ir a otra: mostrar a dónde
                        lleva de verdad es lo que evita esa sorpresa. */}
                    {item.url && <span className="truncate text-[11px] text-tx-3">{hostOf(item.url)}</span>}
                  </div>

                  {embedSrc && (
                    <button
                      type="button"
                      onClick={() => setPreviewId(showingPreview ? "" : item.id)}
                      onPointerEnter={handleLiquidPointerEnter}
                      aria-expanded={showingPreview}
                      title={showingPreview ? "Cerrar la vista previa" : "Ver la vista previa"}
                      aria-label={showingPreview ? "Cerrar la vista previa" : "Ver la vista previa"}
                      className={`${iconButtonClass} shrink-0${showingPreview ? " border-brand-blue bg-brand-blue/[0.06] text-brand-blue" : ""}`}
                    >
                      {showingPreview ? <CloseIcon className="relative" /> : <EyeIcon className="relative" />}
                    </button>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
                      onPointerEnter={handleLiquidPointerEnter}
                      aria-label="Quitar"
                      title="Quitar"
                      className={`${iconButtonClass} shrink-0`}
                    >
                      <TrashIcon className="relative" />
                    </button>
                  )}
                </div>

                {item.audioUrl && (
                  <div className="border-t border-line-2 px-3 py-2">
                    {/* El único reproductor real: el archivo vive en nuestro
                        Blob, no en Instagram ni en Spotify. */}
                    <audio controls preload="none" src={item.audioUrl} className="h-8 w-full" />
                  </div>
                )}

                {embedSrc && showingPreview && (
                  <div className="border-t border-line-2 px-3 py-3">
                    {/* Vista previa, no reproductor: el play del embed abre
                        Instagram en una pestaña nueva (ver instagramEmbedSrc). */}
                    <iframe
                      src={embedSrc}
                      className="mx-auto aspect-[9/16] w-full max-w-[240px] rounded"
                      style={{ border: 0 }}
                      allow="autoplay; encrypted-media; fullscreen"
                      allowFullScreen
                      scrolling="no"
                      title={displayName(item)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function ExpandIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h6v6" />
      <path d="M9 21H3v-6" />
      <path d="M21 3l-7 7" />
      <path d="M3 21l7-7" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string } = {}) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
