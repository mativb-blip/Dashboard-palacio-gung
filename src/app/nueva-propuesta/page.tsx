"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import ArtUploadZone, { makeFileId, type UploadedFile, uploadBlob } from "@/components/dashboard/ArtUploadZone";
import { assertBlobUrl } from "@/lib/dashboard/blob-url";
import InstagramPreview from "@/components/dashboard/InstagramPreview";
import { resolveAudioContentType } from "@/lib/dashboard/audio";
import { useBrand } from "@/lib/dashboard/BrandContext";
import { describeInstagramMusicUrl, normalizeInstagramMusicUrl } from "@/lib/dashboard/instagram-music";
import { CAPTION_OPTIONS_LIMIT, MUSIC_OPTIONS_LIMIT } from "@/lib/dashboard/proposals";
import { createProposal, type AddMusicOptionInput } from "@/lib/dashboard/proposals-actions";
import { supportsVideo } from "@/lib/dashboard/format";
import { canEditContent, PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import type { ProposalFormat } from "@/types/dashboard";

const NETWORKS = ["Instagram", "Mail", "Whatsapp", "LinkedIn"];
const FORMATS: ProposalFormat[] = ["Carrusel", "Reel", "Historia", "Post simple"];

// Franjas de 30 min en vez de texto libre — evita horas mal tipeadas que
// schedule-time.ts (recordatorios de publicación) no pueda parsear. Acotado
// a 7am-12am, la ventana en la que de verdad se publica contenido.
const TIME_OPTIONS = Array.from({ length: 35 }, (_, i) => {
  const totalMinutes = 7 * 60 + i * 30;
  const hourOfDay = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  const meridiem = hourOfDay < 12 ? "AM" : "PM";
  let hour = hourOfDay % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${meridiem}`;
});

const inputClass = "w-full rounded border border-line-2 bg-panel-2 px-3 py-2 font-sans text-sm";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-[11px] tracking-label text-tx-3 uppercase">{label}</span>
      {children}
    </label>
  );
}

export default function NuevaPropuestaPage() {
  return (
    <Suspense fallback={null}>
      <NuevaPropuestaForm />
    </Suspense>
  );
}

function NuevaPropuestaForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { contentPillars } = useBrand();
  const { data: session, status } = useSession();
  const canEdit = canEditContent(session?.user.role);

  useEffect(() => {
    if (status === "authenticated" && !canEdit) router.replace("/");
  }, [status, canEdit, router]);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  // Todavía no existe la propuesta cuando el usuario elige los archivos —
  // este id solo organiza la ruta en Blob Storage hasta que se guarde.
  // useState (no useRef) porque se lee durante el render, no en un handler.
  const [draftId] = useState(() => crypto.randomUUID());

  const [date, setDate] = useState(searchParams.get("date") ?? "");
  const [time, setTime] = useState("");
  const [network, setNetwork] = useState(NETWORKS[0]);
  const [format, setFormat] = useState<ProposalFormat>("Carrusel");
  const [contentPillar, setContentPillar] = useState("");
  const [caption, setCaption] = useState("");
  // Alternativas además de la principal — mismo tope y misma idea que
  // agregarlas después desde la vista Post (ver CaptionPanel), solo que acá
  // todavía no hay propuesta creada: viven en el estado local hasta el
  // submit.
  const [extraCaptions, setExtraCaptions] = useState<string[]>([]);
  // ?photo= lo pone el botón "Usar como post" de la Galería: la foto ya está
  // en Blob, así que no se vuelve a subir — entra directo como arte cargado.
  // Se valida igual (assertBlobUrl) porque un query param lo escribe
  // cualquiera, y sin eso sería un "cargá la imagen que quieras" en la
  // propuesta. Un valor inválido simplemente se ignora.
  const [artFiles, setArtFiles] = useState<UploadedFile[]>(() => {
    const photo = searchParams.get("photo");
    if (!photo) return [];
    try {
      const url = assertBlobUrl(photo);
      return [{ id: makeFileId(), url, name: decodeURIComponent(url.split("/").pop() || "Foto") }];
    } catch {
      return [];
    }
  });
  const [coverFiles, setCoverFiles] = useState<UploadedFile[]>([]);
  const [videoFiles, setVideoFiles] = useState<UploadedFile[]>([]);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Música cargada junto con la propuesta — mismo shape que
  // AddMusicOptionInput (ver proposals-actions.ts); ninguna queda elegida al
  // crear, igual que agregarlas después desde la vista Post.
  const [musicDrafts, setMusicDrafts] = useState<AddMusicOptionInput[]>([]);
  const [addingMusic, setAddingMusic] = useState(false);
  const [musicUrl, setMusicUrl] = useState("");
  const [musicLabel, setMusicLabel] = useState("");
  const [musicError, setMusicError] = useState("");
  const [musicAudioUrl, setMusicAudioUrl] = useState("");
  const [musicAudioName, setMusicAudioName] = useState("");
  const [uploadingMusicAudio, setUploadingMusicAudio] = useState(false);
  const musicAudioInputRef = useRef<HTMLInputElement>(null);

  if (status !== "authenticated" || !canEdit) return null;

  const isReel = format === "Reel";
  // Historia también puede llevar video, pero opcional: puede ser una imagen
  // o un video. Ver supportsVideo() — de ese helper dependen además el visor,
  // la edición y la descarga.
  const carriesVideo = supportsVideo(format);
  const previewImages = isReel
    ? coverFiles.map((f) => f.url)
    : artFiles.map((f) => f.url);

  async function handlePasteCaption() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const el = captionRef.current;
      if (!el) {
        setCaption((prev) => prev + text);
        return;
      }
      const start = el.selectionStart ?? caption.length;
      const end = el.selectionEnd ?? caption.length;
      const next = caption.slice(0, start) + text + caption.slice(end);
      setCaption(next);
      requestAnimationFrame(() => {
        el.focus();
        el.selectionStart = el.selectionEnd = start + text.length;
      });
    } catch {
      // sin permiso de portapapeles o no soportado
    }
  }

  function addExtraCaption() {
    if (extraCaptions.length >= CAPTION_OPTIONS_LIMIT - 1) return;
    setExtraCaptions((prev) => [...prev, ""]);
  }

  function updateExtraCaption(index: number, value: string) {
    setExtraCaptions((prev) => prev.map((text, i) => (i === index ? value : text)));
  }

  function removeExtraCaption(index: number) {
    setExtraCaptions((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleMusicAudioFile(file: File) {
    setUploadingMusicAudio(true);
    try {
      const url = await uploadBlob(
        `proposals/${draftId}/music`,
        file,
        undefined,
        undefined,
        resolveAudioContentType(file),
      );
      setMusicAudioUrl(url);
      setMusicAudioName(file.name);
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo subir el audio.");
    } finally {
      setUploadingMusicAudio(false);
    }
  }

  function resetMusicComposer() {
    setAddingMusic(false);
    setMusicUrl("");
    setMusicLabel("");
    setMusicError("");
    setMusicAudioUrl("");
    setMusicAudioName("");
  }

  function handleAddMusicDraft() {
    const trimmedUrl = musicUrl.trim();
    let normalized: string | undefined;
    if (trimmedUrl) {
      try {
        normalized = normalizeInstagramMusicUrl(trimmedUrl);
      } catch (e) {
        setMusicError(e instanceof Error ? e.message : "Enlace inválido.");
        return;
      }
    }
    if (!normalized && !musicAudioUrl) {
      setMusicError("Pegá un enlace o subí un archivo de audio.");
      return;
    }
    setMusicDrafts((prev) => [
      ...prev,
      {
        url: normalized,
        label: musicLabel.trim() || undefined,
        audioUrl: musicAudioUrl || undefined,
        audioName: musicAudioName || undefined,
      },
    ]);
    resetMusicComposer();
  }

  function removeMusicDraft(index: number) {
    setMusicDrafts((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!date || !time.trim() || !caption.trim()) {
      setError("Completá al menos fecha, hora y caption.");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      // Los archivos ya están subidos a Blob Storage cuando se llega acá —
      // ArtUploadZone sube al elegirlos, así que solo viajan URLs cortas.
      await createProposal({
        date,
        time: time.trim(),
        network,
        format,
        status: "En revisión",
        caption: caption.trim(),
        contentPillar: contentPillar || undefined,
        hashtags: "",
        artN: isReel ? 1 : Math.max(1, artFiles.length),
        images: isReel ? coverFiles.map((f) => f.url) : artFiles.map((f) => f.url),
        video: carriesVideo ? videoFiles[0]?.url : undefined,
        extraCaptions: extraCaptions.map((text) => text.trim()).filter(Boolean),
        music: musicDrafts,
      });

      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la propuesta.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-4 py-8 font-sans text-brand-ink">
      <div>
        <Link
          href="/"
          className={`inline-block text-xs text-brand-blue transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
        >
          ‹ Volver al calendario
        </Link>
        <div className="mt-3 text-[11px] tracking-label text-tx-3 uppercase">Plan de contenido</div>
        <h1 className="text-2xl font-bold">Cargar propuesta</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Hora">
            <select value={time} onChange={(e) => setTime(e.target.value)} className={inputClass}>
              <option value="" disabled>
                Elegir hora
              </option>
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Red">
            <select value={network} onChange={(e) => setNetwork(e.target.value)} className={inputClass}>
              {NETWORKS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Formato">
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as ProposalFormat)}
              className={inputClass}
            >
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Pilar de contenido">
          <select value={contentPillar} onChange={(e) => setContentPillar(e.target.value)} className={inputClass}>
            <option value="">Sin categorizar</option>
            {contentPillars.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>

        {isReel ? (
          <div className="grid grid-cols-2 gap-3">
            <ArtUploadZone
              label="Portada"
              accept="image/*"
              multiple={false}
              files={coverFiles}
              onFilesChange={setCoverFiles}
              proposalId={draftId}
            />
            <ArtUploadZone
              label="Video"
              accept="video/*"
              multiple={false}
              files={videoFiles}
              onFilesChange={setVideoFiles}
              proposalId={draftId}
            />
          </div>
        ) : (
          <div className={carriesVideo ? "grid gap-3 desktop:grid-cols-2" : ""}>
            <ArtUploadZone
              label="Artes"
              accept="image/*"
              multiple
              files={artFiles}
              onFilesChange={setArtFiles}
              proposalId={draftId}
            />
            {/* Una Historia puede ser una imagen o un video, así que este
                recuadro aparece pero no es obligatorio — a diferencia del
                Reel, que siempre es video + portada. */}
            {carriesVideo && (
              <ArtUploadZone
                label="Video (opcional)"
                accept="video/*"
                multiple={false}
                files={videoFiles}
                onFilesChange={setVideoFiles}
                proposalId={draftId}
              />
            )}
          </div>
        )}

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[11px] tracking-label text-tx-3 uppercase">Caption</span>
            <button
              type="button"
              onClick={handlePasteCaption}
              title="Pegar en el caption"
              className={`flex h-7 w-7 items-center justify-center rounded border border-line-2 bg-panel-2 text-brand-blue transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
            >
              <ClipboardIcon />
            </button>
          </div>
          <textarea
            ref={captionRef}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="La primera línea se usa como título de la propuesta."
            className={`${inputClass} min-h-32 resize-y`}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] tracking-label text-tx-3 uppercase">
              Alternativas de caption
            </span>
            {extraCaptions.length < CAPTION_OPTIONS_LIMIT - 1 && (
              <button
                type="button"
                onClick={addExtraCaption}
                className={`text-xs font-bold text-brand-blue transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
              >
                + Agregar otra alternativa
              </button>
            )}
          </div>
          {extraCaptions.length === 0 ? (
            <p className="text-[11px] leading-[1.4] text-tx-3">
              Opcional — Jun podrá elegir cuál de todas usar. La de arriba es la principal.
            </p>
          ) : (
            extraCaptions.map((text, i) => (
              <div key={i} className="flex items-start gap-2">
                <textarea
                  value={text}
                  onChange={(e) => updateExtraCaption(i, e.target.value)}
                  placeholder={`Alternativa ${i + 2}`}
                  className={`${inputClass} min-h-20 resize-y`}
                />
                <button
                  type="button"
                  onClick={() => removeExtraCaption(i)}
                  title="Quitar esta alternativa"
                  aria-label="Quitar esta alternativa"
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded border border-line-2 bg-panel-2 text-brand-ink transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
                >
                  <TrashIcon />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] tracking-label text-tx-3 uppercase">Música de Instagram</span>
            {!addingMusic && musicDrafts.length < MUSIC_OPTIONS_LIMIT && (
              <button
                type="button"
                onClick={() => setAddingMusic(true)}
                className={`text-xs font-bold text-brand-blue transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
              >
                + Agregar música
              </button>
            )}
          </div>

          {musicDrafts.length === 0 && !addingMusic && (
            <p className="text-[11px] leading-[1.4] text-tx-3">
              Opcional — Jun podrá elegir una. También se puede cargar después.
            </p>
          )}

          {musicDrafts.map((draft, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded border border-line-2 bg-panel-2 px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-[13px] text-brand-ink">
                {draft.label ||
                  (draft.url ? describeInstagramMusicUrl(draft.url) : draft.audioName) ||
                  "Música"}
              </span>
              <button
                type="button"
                onClick={() => removeMusicDraft(i)}
                title="Quitar esta música"
                aria-label="Quitar esta música"
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded border border-line-2 bg-panel-2 text-brand-ink transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
              >
                <TrashIcon />
              </button>
            </div>
          ))}

          {addingMusic && (
            <div className="flex flex-col gap-2 rounded border border-line-2 bg-panel-2 p-3">
              <input
                value={musicUrl}
                onChange={(e) => {
                  setMusicUrl(e.target.value);
                  setMusicError("");
                }}
                placeholder="Pegá el enlace del reel o del audio (opcional)"
                inputMode="url"
                className={inputClass}
              />

              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-line-2" />
                <span className="text-[10px] font-bold tracking-label text-tx-3 uppercase">o</span>
                <div className="h-px flex-1 bg-line-2" />
              </div>

              {musicAudioUrl ? (
                <div className="flex items-center gap-2 rounded border border-brand-blue bg-brand-blue/[0.05] px-3 py-2">
                  <UploadIcon />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-brand-ink">
                    {musicAudioName}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setMusicAudioUrl("");
                      setMusicAudioName("");
                    }}
                    title="Quitar el audio subido"
                    aria-label="Quitar el audio subido"
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded border border-line-2 bg-panel-2 text-brand-ink transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
                  >
                    <TrashIcon />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => musicAudioInputRef.current?.click()}
                  disabled={uploadingMusicAudio}
                  className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded border border-line-2 bg-panel-2 px-3.5 text-xs leading-none font-bold tracking-[0.04em] text-brand-ink transition-transform duration-[400ms] disabled:cursor-default disabled:opacity-60 ${PRESS_SCALE_CLASS}`}
                >
                  <UploadIcon />
                  {uploadingMusicAudio ? "Subiendo…" : "Subir un archivo de audio"}
                </button>
              )}

              <input
                value={musicLabel}
                onChange={(e) => setMusicLabel(e.target.value)}
                placeholder="Nombre (opcional)"
                className={inputClass}
              />

              {musicError && <p className="text-xs text-brand-red">{musicError}</p>}

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={resetMusicComposer}
                  className={`inline-flex min-h-9 items-center rounded border border-line-2 bg-panel-2 px-3.5 text-xs leading-none font-bold tracking-[0.04em] text-brand-ink transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleAddMusicDraft}
                  disabled={!musicUrl.trim() && !musicAudioUrl}
                  className={`inline-flex min-h-9 items-center rounded border border-brand-blue bg-brand-blue px-3.5 text-xs leading-none font-bold tracking-[0.04em] text-[var(--bg)] transition-transform duration-[400ms] disabled:cursor-default disabled:opacity-60 ${PRESS_SCALE_CLASS}`}
                >
                  Agregar
                </button>
              </div>
            </div>
          )}

          <input
            ref={musicAudioInputRef}
            type="file"
            accept="audio/*,.m4a,.mp3,.wav,.ogg,.aac,.flac"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void handleMusicAudioFile(file);
            }}
          />
        </div>

        <button
          type="button"
          onClick={() => setShowPreview(true)}
          className={`min-h-11 rounded border border-brand-blue px-5 text-sm font-bold text-brand-blue transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
        >
          Previsualizar
        </button>

        {error && <p className="text-sm text-brand-red">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className={`min-h-11 rounded bg-brand-ink px-5 text-sm font-bold text-[var(--bg)] transition-transform duration-[400ms] disabled:cursor-default disabled:opacity-60 ${PRESS_SCALE_CLASS}`}
        >
          {submitting ? "Guardando…" : "Guardar y ver en el calendario"}
        </button>
      </form>

      {showPreview && (
        <InstagramPreview
          format={format}
          caption={caption}
          images={previewImages}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}

function ClipboardIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}
