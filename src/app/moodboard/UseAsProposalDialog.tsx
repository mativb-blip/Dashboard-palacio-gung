"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import type { MoodboardElement } from "@/types/moodboard";
import { createProposalFromElement } from "./actions";

const NETWORKS = ["Instagram", "Mail", "Whatsapp", "LinkedIn"];

/** Mismas franjas de 30 min que Cargar propuesta — la hora se parsea después
 * en schedule-time.ts para los recordatorios, así que texto libre no sirve. */
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

interface UseAsProposalDialogProps {
  element: MoodboardElement;
  onClose: () => void;
}

export default function UseAsProposalDialog({ element, onClose }: UseAsProposalDialogProps) {
  const isVideo = element.type === "video";
  const [caption, setCaption] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(TIME_OPTIONS[10]);
  const [network, setNetwork] = useState(NETWORKS[0]);
  const [format, setFormat] = useState(isVideo ? "Reel" : "Post simple");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const id = await createProposalFromElement(element.id, { caption, date, time, network, format });
      setCreatedId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la propuesta.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="modal-backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="modal-card-in flex max-h-[90vh] w-full max-w-[420px] flex-col overflow-hidden rounded-lg border border-line-2 bg-[var(--bg)] font-sans text-brand-ink shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-sm font-bold">Usar como base para una propuesta</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className={`text-lg leading-none text-tx-3 transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
          >
            ×
          </button>
        </div>

        {createdId ? (
          <div className="flex flex-col gap-4 p-6 text-center">
            <p className="text-sm text-tx-2">
              La propuesta quedó creada en revisión. El elemento sigue en el moodboard.
            </p>
            <Link
              href="/?period=month"
              className={`rounded bg-brand-blue px-4 py-2.5 text-xs font-bold tracking-label text-[var(--bg)] uppercase ${PRESS_SCALE_CLASS}`}
            >
              Ir a Post
            </Link>
            <button type="button" onClick={onClose} className="text-xs text-tx-3 underline">
              Seguir en el moodboard
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 overflow-y-auto p-4">
            <div className="flex gap-3">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded border border-line-2 bg-panel-2">
                {isVideo ? (
                  <video src={element.url} muted loop playsInline autoPlay className="h-full w-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- referencia del moodboard
                  <img src={element.url} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <p className="flex-1 text-xs leading-relaxed text-tx-3">
                El archivo se carga como {isVideo ? "video del Reel" : "arte de la propuesta"}. Podés
                terminar de editarla después en Post.
              </p>
            </div>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[11px] tracking-label text-tx-3 uppercase">Caption</span>
              <textarea
                required
                rows={3}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="De qué va este post…"
                className={`${inputClass} resize-y`}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[11px] tracking-label text-tx-3 uppercase">Fecha</span>
                <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[11px] tracking-label text-tx-3 uppercase">Hora</span>
                <select value={time} onChange={(e) => setTime(e.target.value)} className={inputClass}>
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[11px] tracking-label text-tx-3 uppercase">Red</span>
                <select value={network} onChange={(e) => setNetwork(e.target.value)} className={inputClass}>
                  {NETWORKS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[11px] tracking-label text-tx-3 uppercase">Formato</span>
                <select value={format} onChange={(e) => setFormat(e.target.value)} className={inputClass}>
                  {(isVideo ? ["Reel", "Historia"] : ["Post simple", "Carrusel", "Historia"]).map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {error && <p className="text-xs text-brand-red">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className={`mt-1 rounded bg-brand-blue px-4 py-2.5 text-xs font-bold tracking-label text-[var(--bg)] uppercase disabled:opacity-60 ${PRESS_SCALE_CLASS}`}
            >
              {submitting ? "Creando…" : "Crear propuesta"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
