"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState, type FormEvent, type ReactNode } from "react";
import ArtUploadZone, { type UploadedFile } from "@/components/dashboard/ArtUploadZone";
import InstagramPreview from "@/components/dashboard/InstagramPreview";
import { createProposal } from "@/lib/dashboard/proposals-actions";
import { PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import type { ProposalFormat } from "@/types/dashboard";

const NETWORKS = ["Instagram", "Mail", "Whatsapp", "LinkedIn"];
const FORMATS: ProposalFormat[] = ["Carrusel", "Reel", "Historia", "Post simple"];

// Franjas de 30 min en vez de texto libre — evita horas mal tipeadas que
// schedule-time.ts (recordatorios de publicación) no pueda parsear.
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const totalMinutes = i * 30;
  let hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const meridiem = hour < 12 ? "AM" : "PM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${meridiem}`;
});

const inputClass = "w-full rounded border border-line-2 bg-white px-3 py-2 font-sans text-sm";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-[11px] tracking-[0.1em] text-tx-3 uppercase">{label}</span>
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
  const captionRef = useRef<HTMLTextAreaElement>(null);
  // Todavía no existe la propuesta cuando el usuario elige los archivos —
  // este id solo organiza la ruta en Blob Storage hasta que se guarde.
  // useState (no useRef) porque se lee durante el render, no en un handler.
  const [draftId] = useState(() => crypto.randomUUID());

  const [date, setDate] = useState(searchParams.get("date") ?? "");
  const [time, setTime] = useState("");
  const [network, setNetwork] = useState(NETWORKS[0]);
  const [format, setFormat] = useState<ProposalFormat>("Carrusel");
  const [caption, setCaption] = useState("");
  const [artFiles, setArtFiles] = useState<UploadedFile[]>([]);
  const [coverFiles, setCoverFiles] = useState<UploadedFile[]>([]);
  const [videoFiles, setVideoFiles] = useState<UploadedFile[]>([]);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isReel = format === "Reel";
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
        hashtags: "",
        artN: isReel ? 1 : Math.max(1, artFiles.length),
        images: isReel ? coverFiles.map((f) => f.url) : artFiles.map((f) => f.url),
        video: isReel ? videoFiles[0]?.url : undefined,
      });

      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la propuesta.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 bg-white px-4 py-8 font-sans text-brand-ink">
      <div>
        <Link
          href="/"
          className={`inline-block text-xs text-brand-blue transition-transform duration-150 ${PRESS_SCALE_CLASS}`}
        >
          ‹ Volver al calendario
        </Link>
        <div className="mt-3 text-[11px] tracking-[0.16em] text-tx-3 uppercase">Plan de contenido</div>
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
          <ArtUploadZone
            label="Artes"
            accept="image/*"
            multiple
            files={artFiles}
            onFilesChange={setArtFiles}
            proposalId={draftId}
          />
        )}

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[11px] tracking-[0.1em] text-tx-3 uppercase">Caption</span>
            <button
              type="button"
              onClick={handlePasteCaption}
              title="Pegar en el caption"
              className={`flex h-7 w-7 items-center justify-center rounded border border-line-2 bg-white text-brand-blue transition-transform duration-150 ${PRESS_SCALE_CLASS}`}
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

        <button
          type="button"
          onClick={() => setShowPreview(true)}
          className={`min-h-11 rounded border border-brand-blue px-5 text-sm font-bold text-brand-blue transition-transform duration-150 ${PRESS_SCALE_CLASS}`}
        >
          Previsualizar
        </button>

        {error && <p className="text-sm text-brand-red">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className={`min-h-11 rounded bg-brand-ink px-5 text-sm font-bold text-white transition-transform duration-150 disabled:cursor-default disabled:opacity-60 ${PRESS_SCALE_CLASS}`}
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
