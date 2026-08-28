"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
import ArtTile from "./ArtTile";
import ArtUploadZone, { type UploadedFile } from "./ArtUploadZone";
import PhotoLightbox from "./PhotoLightbox";
import SegmentedGroup from "./SegmentedGroup";
import { useBrand } from "@/lib/dashboard/BrandContext";
import { downloadProposalArts } from "@/lib/dashboard/download";
import { artLabel, fmtShort, isVerticalFormat, supportsVideo, toneHex } from "@/lib/dashboard/format";
import { proposalShareText, whatsappShareUrl } from "@/lib/dashboard/share";
import {
  canEditContent,
  handleLiquidPointerEnter,
  iconButtonClass,
  LIQUID_FILL_CLASS,
  LIQUID_GROW_CLASS,
  PRESS_SCALE_CLASS,
} from "@/lib/dashboard/ui";
import type { Gallery, Proposal } from "@/types/dashboard";

interface ArtViewerProps {
  proposal: Proposal;
  /** Todas las propuestas del mismo día — un botón por cada una para
   * alternar entre ellas (en vez del pill fijo de formato). */
  dayProposals: Proposal[];
  onSelectProposal: (id: string) => void;
  artIndex: number;
  onArtIndexChange: (index: number) => void;
  gallery: Gallery;
  onGalleryChange: (gallery: Gallery) => void;
  onUpdateProposal: (id: string, patch: Partial<Proposal>) => void;
}

function makeExistingFileId(): string {
  return `existing-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function filesFromUrls(urls: string[]): UploadedFile[] {
  return urls.map((url, i) => ({ id: makeExistingFileId(), url, name: `arte-${i + 1}` }));
}

interface Art {
  index: number;
  n: string;
  label: string;
  dimension: string;
  src?: string;
  video?: string;
}

export default function ArtViewer({
  proposal,
  dayProposals,
  onSelectProposal,
  artIndex,
  onArtIndexChange,
  gallery,
  onGalleryChange,
  onUpdateProposal,
}: ArtViewerProps) {
  const brand = useBrand();
  const { data: session } = useSession();
  const canEdit = canEditContent(session?.user.role);
  const [downloading, setDownloading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const isReel = proposal.format === "Reel";

  /** Abre WhatsApp con el post ya escrito. La URL se arma acá dentro y no en
   * el href de un <a> porque necesita `window.location.origin` para que el
   * enlace sirva tanto en local como en producción, y leer window durante el
   * render rompería la hidratación. `window.open` en respuesta directa a un
   * clic no lo bloquea el navegador. */
  function handleShareWhatsApp() {
    const texto = proposalShareText(proposal, brand.brandName, window.location.origin);
    window.open(whatsappShareUrl(texto), "_blank", "noopener,noreferrer");
  }
  // Historia puede llevar video o no; Reel siempre lo lleva. De esto depende
  // que aparezca el recuadro de video al editar y que el slot 0 lo muestre.
  const carriesVideo = supportsVideo(proposal.format);
  const [editArtFiles, setEditArtFiles] = useState<UploadedFile[]>([]);
  const [editCoverFiles, setEditCoverFiles] = useState<UploadedFile[]>([]);
  const [editVideoFiles, setEditVideoFiles] = useState<UploadedFile[]>([]);

  function handleStartEdit() {
    if (isReel) {
      setEditCoverFiles(proposal.images?.length ? filesFromUrls([proposal.images[0]]) : []);
      setEditVideoFiles(proposal.video ? filesFromUrls([proposal.video]) : []);
    } else {
      setEditArtFiles(filesFromUrls(proposal.images ?? []));
      // Historia: el video es opcional y va en su propio recuadro, aparte de
      // los artes. En los formatos que no llevan video queda vacío.
      setEditVideoFiles(carriesVideo && proposal.video ? filesFromUrls([proposal.video]) : []);
    }
    setEditing(true);
  }

  function handleCancelEdit() {
    setEditing(false);
  }

  function handleSaveEdit() {
    if (isReel) {
      onUpdateProposal(proposal.id, {
        images: editCoverFiles.length ? [editCoverFiles[0].url] : undefined,
        video: editVideoFiles[0]?.url,
        artN: 1,
      });
    } else {
      onUpdateProposal(proposal.id, {
        images: editArtFiles.length ? editArtFiles.map((f) => f.url) : undefined,
        // `video` va siempre en el patch (aunque sea undefined) porque el
        // caller mira la CLAVE, no el valor: presente + undefined = limpiar.
        // Así, quitar el video de una Historia lo borra de verdad.
        video: carriesVideo ? editVideoFiles[0]?.url : undefined,
        artN: Math.max(1, editArtFiles.length),
      });
    }
    onArtIndexChange(0);
    setEditing(false);
  }

  const total = proposal.artN;
  const vertical = isVerticalFormat(proposal.format);
  const rawAspect = vertical ? "9/16" : (proposal.aspect ?? "1/1");
  const cssAspectRatio = rawAspect.replace("/", " / ");
  const activeIndex = Math.min(artIndex, total - 1);
  const totalPadded = String(total).padStart(2, "0");

  const { boxWidth, boxHeight } = vertical
    ? { boxWidth: 300, boxHeight: 533 }
    : rawAspect === "4/5"
      ? { boxWidth: 430, boxHeight: 538 }
      : { boxWidth: 400, boxHeight: 400 };

  const arts: Art[] = Array.from({ length: total }, (_, i) => ({
    index: i,
    n: String(i + 1).padStart(2, "0"),
    label: artLabel(i, total),
    dimension: proposal.dim ?? (vertical ? "1080 × 1920 px" : "1080 × 1080 px"),
    src: proposal.images?.[i],
    video: carriesVideo && i === 0 ? proposal.video : undefined,
  }));

  async function runDownload(indices: number[]) {
    if (downloading || indices.length === 0) return;
    setDownloading(true);
    try {
      await downloadProposalArts(proposal, indices, {
        wordmark: brand.brandName.toUpperCase(),
        slug: brand.brandName.toLowerCase(),
        colorPrimary: brand.brandColorPrimary,
        colorAccent: brand.brandColorAccent,
      });
    } finally {
      setDownloading(false);
    }
  }

  /** Con más de un arte (carrusel), el botón no descarga directo: pasa a
   * Feed y abre selección, para elegir cuáles bajar antes de confirmar. */
  function handleDownloadClick() {
    if (total > 1) {
      onGalleryChange("grid");
      setSelectedIndices(new Set(arts.map((art) => art.index)));
      setSelecting(true);
      return;
    }
    void runDownload([activeIndex]);
  }

  function toggleSelected(index: number) {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function handleCancelSelect() {
    setSelecting(false);
    setSelectedIndices(new Set());
  }

  async function handleConfirmDownload() {
    await runDownload(Array.from(selectedIndices).sort((a, b) => a - b));
    setSelecting(false);
    setSelectedIndices(new Set());
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-[18px] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {dayProposals.map((p) => {
            const isActive = p.id === proposal.id;
            const chipHex = toneHex(p.format);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectProposal(p.id)}
                aria-pressed={isActive}
                title={`${fmtShort(p.format)} · ${p.network} · Publica ${p.time}`}
                className={`inline-flex items-center rounded-sm border px-2.5 py-1.5 text-[11px] leading-none font-bold tracking-label uppercase transition-[color,border-color,background-color] duration-[400ms] ${PRESS_SCALE_CLASS}`}
                style={{
                  color: isActive ? chipHex : "var(--color-tx-3)",
                  borderColor: isActive ? chipHex : "var(--color-line-2)",
                  // rgba(0,0,0,.03) oscurecía sobre blanco — sobre --bg no
                  // hace nada visible, así que aclara en vez de oscurecer.
                  background: isActive ? "var(--surface)" : "transparent",
                }}
              >
                {fmtShort(p.format)} · {p.time}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {editing ? (
            <>
              <button
                type="button"
                onClick={handleCancelEdit}
                className={`inline-flex min-h-9 items-center rounded border border-line-2 bg-panel-2 px-3.5 text-xs leading-none font-bold tracking-[0.04em] text-brand-ink transition-transform duration-[400ms] desktop:min-h-10 desktop:px-4 ${PRESS_SCALE_CLASS}`}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className={`inline-flex min-h-9 items-center rounded border border-brand-blue bg-brand-blue px-3.5 text-xs leading-none font-bold tracking-[0.04em] text-[var(--bg)] transition-transform duration-[400ms] desktop:min-h-10 desktop:px-4 ${PRESS_SCALE_CLASS}`}
              >
                Guardar
              </button>
            </>
          ) : selecting ? (
            <>
              <button
                type="button"
                onClick={handleCancelSelect}
                className={`inline-flex min-h-9 items-center rounded border border-line-2 bg-panel-2 px-3.5 text-xs leading-none font-bold tracking-[0.04em] text-brand-ink transition-transform duration-[400ms] desktop:min-h-10 desktop:px-4 ${PRESS_SCALE_CLASS}`}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDownload}
                disabled={downloading || selectedIndices.size === 0}
                className={`inline-flex min-h-9 items-center rounded border border-brand-blue bg-brand-blue px-3.5 text-xs leading-none font-bold tracking-[0.04em] text-[var(--bg)] transition-transform duration-[400ms] disabled:cursor-default disabled:opacity-60 desktop:min-h-10 desktop:px-4 ${PRESS_SCALE_CLASS}`}
              >
                {downloading ? "Descargando…" : `Descargar (${selectedIndices.size})`}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleDownloadClick}
                onPointerEnter={handleLiquidPointerEnter}
                disabled={downloading}
                title={downloading ? "Descargando…" : "Descargar"}
                aria-label={downloading ? "Descargando…" : "Descargar"}
                className={iconButtonClass}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="relative"
                >
                  <path d="M12 3v12" />
                  <path d="m7 11 5 5 5-5" />
                  <path d="M5 21h14" />
                </svg>
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={handleStartEdit}
                  onPointerEnter={handleLiquidPointerEnter}
                  title="Editar"
                  aria-label="Editar artes"
                  className={iconButtonClass}
                >
                  <PencilIcon className="relative" />
                </button>
              )}
              {/* Compartir queda del lado de la agencia (Admin/Editor): es
                  Matías quien le manda el post a Jun para que lo revise, no
                  al revés. */}
              {canEdit && (
                <button
                  type="button"
                  onClick={handleShareWhatsApp}
                  onPointerEnter={handleLiquidPointerEnter}
                  title="Compartir este post por WhatsApp"
                  aria-label="Compartir este post por WhatsApp"
                  className={iconButtonClass}
                >
                  <ShareIcon className="relative" />
                </button>
              )}
              <SegmentedGroup
                items={[
                  { key: "slider", label: "Slider", active: gallery === "slider", onClick: () => onGalleryChange("slider") },
                  { key: "grid", label: "Feed", active: gallery === "grid", onClick: () => onGalleryChange("grid") },
                ]}
              />
            </>
          )}
        </div>
      </div>

      {selecting && selectedIndices.size > 1 && (
        <p className="-mt-3 mb-[18px] text-xs text-tx-3">
          Si el navegador muestra un aviso de &ldquo;descargar varios archivos&rdquo;, elegí{" "}
          <strong>Permitir</strong> — es por única vez para este sitio.
        </p>
      )}

      {editing ? (
        isReel ? (
          <div className="grid grid-cols-2 gap-3">
            <ArtUploadZone
              label="Portada"
              accept="image/*"
              multiple={false}
              files={editCoverFiles}
              onFilesChange={setEditCoverFiles}
              proposalId={proposal.id}
            />
            <ArtUploadZone
              label="Video"
              accept="video/*"
              multiple={false}
              files={editVideoFiles}
              onFilesChange={setEditVideoFiles}
              proposalId={proposal.id}
            />
          </div>
        ) : (
          <div className={carriesVideo ? "grid gap-3 desktop:grid-cols-2" : ""}>
            <ArtUploadZone
              label="Artes"
              accept="image/*"
              multiple
              files={editArtFiles}
              onFilesChange={setEditArtFiles}
              proposalId={proposal.id}
            />
            {/* Una Historia puede ser una imagen o un video, así que el
                recuadro de video aparece pero no es obligatorio (a diferencia
                del Reel, que siempre es video + portada). */}
            {carriesVideo && (
              <ArtUploadZone
                label="Video (opcional)"
                accept="video/*"
                multiple={false}
                files={editVideoFiles}
                onFilesChange={setEditVideoFiles}
                proposalId={proposal.id}
              />
            )}
          </div>
        )
      ) : gallery === "slider" ? (
        <div>
          <div className="flex items-center justify-center gap-3.5 rounded border border-line bg-panel-2 p-5">
            <button
              type="button"
              onClick={() => onArtIndexChange(Math.max(0, activeIndex - 1))}
              onPointerEnter={handleLiquidPointerEnter}
              disabled={activeIndex === 0}
              className={`relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded border border-line-2 bg-panel-2 text-lg leading-none text-brand-blue transition-transform duration-[400ms] disabled:cursor-default disabled:text-line-2 desktop:h-11 desktop:w-11 desktop:text-xl ${LIQUID_FILL_CLASS} ${LIQUID_GROW_CLASS} ${PRESS_SCALE_CLASS}`}
            >
              <span className="relative">‹</span>
            </button>
            <div
              className="max-w-[var(--art-box-w)] flex-1 aspect-[var(--art-ratio)] min-w-0 overflow-hidden rounded desktop:aspect-auto desktop:h-[var(--art-box-h)] desktop:w-[var(--art-box-w)] desktop:max-w-none desktop:flex-none"
              style={
                {
                  "--art-box-w": `${boxWidth}px`,
                  "--art-box-h": `${boxHeight}px`,
                  "--art-ratio": cssAspectRatio,
                } as React.CSSProperties
              }
            >
              {arts[activeIndex]?.src && !arts[activeIndex]?.video ? (
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  aria-label="Ver foto en grande"
                  className={`block h-full w-full cursor-zoom-in transition-transform duration-[400ms] motion-safe:hover:scale-[1.03] ${PRESS_SCALE_CLASS}`}
                >
                  <ArtSlot art={arts[activeIndex]} total={totalPadded} />
                </button>
              ) : (
                <ArtSlot art={arts[activeIndex]} total={totalPadded} />
              )}
            </div>
            <button
              type="button"
              onClick={() => onArtIndexChange(Math.min(total - 1, activeIndex + 1))}
              onPointerEnter={handleLiquidPointerEnter}
              disabled={activeIndex === total - 1}
              className={`relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded border border-line-2 bg-panel-2 text-lg leading-none text-brand-blue transition-transform duration-[400ms] disabled:cursor-default disabled:text-line-2 desktop:h-11 desktop:w-11 desktop:text-xl ${LIQUID_FILL_CLASS} ${LIQUID_GROW_CLASS} ${PRESS_SCALE_CLASS}`}
            >
              <span className="relative">›</span>
            </button>
          </div>
          <div className="mt-4 flex items-center justify-center gap-2">
            {arts.map((art) => (
              <button
                key={art.index}
                type="button"
                onClick={() => onArtIndexChange(art.index)}
                className={`h-2.5 rounded-full transition-[width,background-color,transform] duration-[400ms] ${PRESS_SCALE_CLASS} ${
                  art.index === activeIndex ? "w-[22px] bg-brand-blue" : "w-2.5 bg-line-2"
                }`}
              />
            ))}
            <span className="ml-2 text-xs tracking-[0.04em] text-tx-3">
              {activeIndex + 1} / {total}
            </span>
          </div>
        </div>
      ) : (
        <div
          className={`grid gap-2.5 desktop:gap-3 ${
            vertical ? "grid-cols-2 desktop:grid-cols-4" : "grid-cols-2 desktop:grid-cols-3"
          }`}
        >
          {arts.map((art) => {
            const isSelected = selectedIndices.has(art.index);
            return (
              <button
                key={art.index}
                type="button"
                onClick={() => (selecting ? toggleSelected(art.index) : onArtIndexChange(art.index))}
                aria-pressed={selecting ? isSelected : undefined}
                className={`relative overflow-hidden rounded transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
                style={{
                  aspectRatio: cssAspectRatio,
                  outline:
                    !selecting && art.index === activeIndex
                      ? "2px solid var(--color-brand-blue)"
                      : "2px solid transparent",
                  outlineOffset: 2,
                }}
              >
                <ArtSlot art={art} total={totalPadded} />
                {selecting && (
                  <span
                    className={`absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-[4px] border-2 shadow-sm transition-colors duration-[400ms] ${
                      isSelected ? "border-brand-blue bg-brand-blue" : "border-brand-red/70 bg-panel-2/90"
                    }`}
                  >
                    {isSelected && <CheckIcon className="check-pop-in h-3.5 w-3.5 text-[var(--bg)]" />}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {lightboxOpen && arts[activeIndex]?.src && (
        <PhotoLightbox
          src={arts[activeIndex].src as string}
          alt={arts[activeIndex].label}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ArtSlot({ art, total }: { art: Art; total: string }) {
  if (art.video) {
    return (
      <video
        key={art.index}
        src={art.video}
        poster={art.src}
        controls
        playsInline
        className="art-fade-in block h-full w-full object-contain"
      />
    );
  }
  if (art.src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- galería de artes propios del contenido, no assets estáticos del sitio
      <img
        key={art.index}
        src={art.src}
        alt={art.label}
        className="art-fade-in block h-full w-full object-contain"
      />
    );
  }
  return (
    <div key={art.index} className="art-fade-in h-full w-full">
      <ArtTile n={art.n} total={total} label={art.label} dimension={art.dimension} />
    </div>
  );
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 13.5l6.8 4" />
      <path d="M15.4 6.5l-6.8 4" />
    </svg>
  );
}
