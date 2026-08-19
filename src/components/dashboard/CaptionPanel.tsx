"use client";

import { useSession } from "next-auth/react";
import { useRef, useState } from "react";
import VersionHistoryModal from "./VersionHistoryModal";
import { dateLong, statusPillStyle } from "@/lib/dashboard/format";
import {
  CAPTION_OPTIONS_LIMIT,
  computeProposalStatus,
  DEPARTMENT_CHECK_COUNT,
  MUSIC_OPTIONS_LIMIT,
} from "@/lib/dashboard/proposals";
import {
  addCaptionOption,
  addMusicOption,
  clearMusicOptionAudio,
  deleteCaptionOption,
  deleteMusicOption,
  selectCaptionOption,
  setMusicOptionAudio,
  setMusicOptionSelected,
  updateCaptionOption,
  type CaptionOptionsResult,
} from "@/lib/dashboard/proposals-actions";
import { uploadBlob } from "@/components/dashboard/ArtUploadZone";
import {
  describeInstagramMusicUrl,
  instagramEmbedSrc,
  normalizeInstagramMusicUrl,
} from "@/lib/dashboard/instagram-music";
import { canEditContent, handleLiquidPointerEnter, iconButtonClass, PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import type { Proposal, ProposalMusicOption } from "@/types/dashboard";

interface CaptionPanelProps {
  proposal: Proposal;
  onUpdateProposal: (id: string, patch: Partial<Proposal>) => void;
  /** Aplica un patch SOLO al estado local — las alternativas de caption y las
   * músicas se guardan con sus propias server actions (ver más abajo), no con
   * updateProposal(), así que este canal es para reconciliar la pantalla con
   * lo que el server ya guardó. */
  onPatchProposal: (id: string, patch: Partial<Proposal>) => void;
  onDeleteProposal: (id: string) => void;
}

export default function CaptionPanel({
  proposal,
  onUpdateProposal,
  onPatchProposal,
  onDeleteProposal,
}: CaptionPanelProps) {
  const { data: session } = useSession();
  const canEdit = canEditContent(session?.user.role);
  const [copied, setCopied] = useState(false);
  /** Id de la alternativa que se está editando; "" = ninguna. */
  const [editingId, setEditingId] = useState("");
  const [draft, setDraft] = useState("");
  const [addingCaption, setAddingCaption] = useState(false);
  const [newCaption, setNewCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const departmentApprovals = proposal.departmentApprovals ?? Array(DEPARTMENT_CHECK_COUNT).fill(false);

  const captionOptions = proposal.captionOptions ?? [];
  const musicOptions = proposal.musicOptions ?? [];
  const selectedCaption = captionOptions.find((o) => o.selected) ?? captionOptions[0];
  // Toda propuesta tiene al menos una alternativa (la crea createProposal y el
  // backfill de la migración) — el fallback a proposal.caption es solo para no
  // dejar la pantalla en blanco si alguna vez llegara una sin opciones.
  const captionText = selectedCaption?.text ?? proposal.caption;
  const showAlternatives = captionOptions.length > 1;

  // Aprobar no es "editar contenido" — Jun es Comentarista y es quien de
  // verdad aprueba, así que esto no depende de canEdit (a diferencia de
  // borrar/editar caption, más abajo).
  function toggleDepartment(index: number) {
    const next = departmentApprovals.map((value, i) => (i === index ? !value : value));
    onUpdateProposal(proposal.id, { departmentApprovals: next });
  }

  function handleDelete() {
    if (window.confirm(`¿Borrar "${proposal.title}"? Esta acción no se puede deshacer.`)) {
      onDeleteProposal(proposal.id);
    }
  }

  /** Corre una acción de alternativas y vuelca lo que devolvió el server —
   * incluida la aprobación, que el server puede haber invalidado si lo que se
   * cambió fue el caption vigente. */
  async function runCaptionAction(action: () => Promise<CaptionOptionsResult>) {
    setBusy(true);
    try {
      const result = await action();
      onPatchProposal(proposal.id, {
        captionOptions: result.captionOptions,
        caption: result.caption,
        // El server pudo haber invalidado la aprobación si lo que cambió fue
        // el caption vigente (ver commitCaptionMirror).
        ...(result.departmentApprovals !== undefined
          ? { departmentApprovals: result.departmentApprovals }
          : {}),
        ...(result.approvalInvalidatedReason !== undefined
          ? { approvalInvalidatedReason: result.approvalInvalidatedReason ?? undefined }
          : {}),
      });
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "No se pudo guardar el cambio.");
    } finally {
      setBusy(false);
    }
  }

  async function runMusicAction(action: () => Promise<ProposalMusicOption[]>) {
    setBusy(true);
    try {
      const musicOptionsNext = await action();
      onPatchProposal(proposal.id, { musicOptions: musicOptionsNext });
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "No se pudo guardar el cambio.");
    } finally {
      setBusy(false);
    }
  }

  function handleSelectCaption(optionId: string) {
    const target = captionOptions.find((o) => o.id === optionId);
    if (!target || target.selected) return;
    // Optimista: la casilla tiene que responder en el acto; runCaptionAction
    // reconcilia después con lo que guardó el server.
    onPatchProposal(proposal.id, {
      captionOptions: captionOptions.map((o) => ({ ...o, selected: o.id === optionId })),
      caption: target.text,
    });
    void runCaptionAction(() => selectCaptionOption(optionId));
  }

  function handleStartEdit(optionId: string, text: string) {
    setEditingId(optionId);
    setDraft(text);
  }

  function handleCancelEdit() {
    setEditingId("");
    setDraft("");
  }

  async function handleSaveEdit() {
    const optionId = editingId;
    const text = draft.trim();
    if (!optionId || !text) return;
    handleCancelEdit();
    await runCaptionAction(() => updateCaptionOption(optionId, text));
  }

  async function handleAddCaption() {
    const text = newCaption.trim();
    if (!text) return;
    setAddingCaption(false);
    setNewCaption("");
    await runCaptionAction(() => addCaptionOption(proposal.id, text));
  }

  async function handleDeleteCaption(optionId: string) {
    if (!window.confirm("¿Borrar esta alternativa de caption?")) return;
    await runCaptionAction(() => deleteCaptionOption(optionId));
  }

  async function handleCopy() {
    const text = `${captionText}\n\n${proposal.hashtags}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        fallbackCopy(text);
      }
    } catch {
      fallbackCopy(text);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const status = computeProposalStatus(proposal);
  const statusStyle = statusPillStyle(status);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="text-[11px] tracking-label text-tx-3 uppercase">
            {dateLong(proposal.date)}
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={handleDelete}
              onPointerEnter={handleLiquidPointerEnter}
              title="Borrar propuesta"
              aria-label="Borrar propuesta"
              className={`${iconButtonClass} shrink-0`}
            >
              <TrashIcon className="relative" />
            </button>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-4">
          <span
            className="inline-flex items-center rounded-sm border px-2.5 py-1.5 text-[11px] leading-none font-bold tracking-label uppercase"
            style={{
              background: statusStyle.background,
              color: statusStyle.color,
              borderColor: statusStyle.borderColor,
            }}
          >
            {status}
          </span>
          <span className="text-[13px] text-tx-2">Publica {proposal.time}</span>
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className={`text-[11px] font-bold text-brand-blue underline-offset-2 hover:underline ${PRESS_SCALE_CLASS}`}
          >
            Ver historial
          </button>
        </div>

        {proposal.approvalInvalidatedReason && (
          <div
            className="mt-2.5 rounded border px-2.5 py-2 text-xs leading-[1.4]"
            style={{
              borderColor: "var(--color-amber-border)",
              background: "var(--color-amber-bg)",
              color: "var(--color-amber-text)",
            }}
          >
            {proposal.approvalInvalidatedReason}
          </div>
        )}

        <div className="mt-3">
          <span className="mb-1.5 block text-[10px] font-bold tracking-label text-tx-3 uppercase">
            Pilar de contenido
          </span>
          <p className="text-xs text-brand-ink">{proposal.contentPillar || "Sin categorizar"}</p>
        </div>

        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold tracking-label text-tx-3 uppercase">
              Aprobación por departamento
            </span>
            <span className="text-[10px] font-bold text-tx-3 tabular-nums">
              {departmentApprovals.filter(Boolean).length}/{DEPARTMENT_CHECK_COUNT}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {departmentApprovals.map((checked, i) => {
              const label = "Jun";
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDepartment(i)}
                  aria-pressed={checked}
                  title={checked ? `${label} · aprobado` : `${label} · pendiente`}
                  className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-1 text-[10px] leading-none font-bold tracking-label uppercase transition-[color,border-color,background-color] duration-[400ms] disabled:cursor-default ${PRESS_SCALE_CLASS} ${
                    checked
                      ? "border-brand-blue bg-brand-blue/[0.05] text-brand-blue"
                      : "border-line-2 bg-transparent text-[var(--color-brand-red-text)] hover:border-brand-red/40"
                  }`}
                >
                  <span
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors duration-[400ms] ${
                      checked ? "border-brand-blue bg-brand-blue" : "border-brand-red/50"
                    }`}
                  >
                    {checked && <CheckIcon className="check-pop-in h-2.5 w-2.5 text-[var(--bg)]" />}
                  </span>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="h-px bg-line" />

      <div>
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] tracking-label text-tx-3 uppercase">Caption propuesto</span>
            {showAlternatives && (
              <span className="text-[10px] font-bold text-tx-3 tabular-nums">
                {captionOptions.length} alternativas
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              onPointerEnter={handleLiquidPointerEnter}
              title={copied ? "Copiado ✓" : "Copiar el caption elegido"}
              aria-label={copied ? "Copiado" : "Copiar el caption elegido"}
              className={`${iconButtonClass}${copied ? " border-brand-blue bg-brand-blue/[0.06] text-brand-blue" : ""}`}
            >
              {copied ? (
                <CheckIcon key="copied" className="art-fade-in relative" />
              ) : (
                <ClipboardIcon key="idle" className="relative" />
              )}
            </button>
            {/* Editar en el encabezado solo tiene sentido cuando hay una sola
                alternativa; con varias, cada una trae su propio lápiz. */}
            {canEdit && !showAlternatives && selectedCaption && !editingId && (
              <button
                type="button"
                onClick={() => handleStartEdit(selectedCaption.id, selectedCaption.text)}
                onPointerEnter={handleLiquidPointerEnter}
                title="Editar caption"
                aria-label="Editar caption"
                className={iconButtonClass}
              >
                <PencilIcon className="relative" />
              </button>
            )}
            {canEdit && captionOptions.length < CAPTION_OPTIONS_LIMIT && (
              <button
                type="button"
                onClick={() => {
                  setAddingCaption(true);
                  setNewCaption("");
                }}
                onPointerEnter={handleLiquidPointerEnter}
                disabled={busy || addingCaption}
                title="Agregar otra alternativa de caption"
                aria-label="Agregar otra alternativa de caption"
                className={iconButtonClass}
              >
                <PlusIcon className="relative" />
              </button>
            )}
          </div>
        </div>

        {showAlternatives && (
          <p className="mb-2 text-[11px] leading-[1.4] text-tx-3">
            Marcá la alternativa aprobada — solo una puede quedar elegida.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {captionOptions.length === 0 && (
            <p className="text-[15px] leading-[1.62] whitespace-pre-line text-brand-ink">
              {proposal.caption}
            </p>
          )}
          {captionOptions.map((option) => {
            const isEditing = editingId === option.id;
            if (isEditing) {
              return (
                <CaptionEditor
                  key={option.id}
                  value={draft}
                  onChange={setDraft}
                  onCancel={handleCancelEdit}
                  onSave={handleSaveEdit}
                  busy={busy}
                />
              );
            }
            // Con una sola alternativa no hay nada que elegir: se muestra el
            // caption plano, igual que antes de que existieran las
            // alternativas.
            if (!showAlternatives) {
              return (
                <p
                  key={option.id}
                  className="text-[15px] leading-[1.62] whitespace-pre-line text-brand-ink"
                >
                  {option.text}
                </p>
              );
            }
            return (
              <div
                key={option.id}
                className={`rounded border transition-[border-color,background-color] duration-[400ms] ${
                  option.selected
                    ? "border-brand-blue bg-brand-blue/[0.05]"
                    : "border-line-2 bg-panel-2"
                }`}
              >
                <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
                  <button
                    type="button"
                    onClick={() => handleSelectCaption(option.id)}
                    disabled={busy}
                    aria-pressed={option.selected}
                    title={option.selected ? "Alternativa elegida" : "Elegir esta alternativa"}
                    className={`inline-flex items-center gap-1.5 text-[10px] leading-none font-bold tracking-label uppercase disabled:cursor-default ${PRESS_SCALE_CLASS} ${
                      option.selected ? "text-brand-blue" : "text-tx-3 hover:text-brand-blue"
                    }`}
                  >
                    <span
                      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors duration-[400ms] ${
                        option.selected ? "border-brand-blue bg-brand-blue" : "border-line-2"
                      }`}
                    >
                      {option.selected && (
                        <CheckIcon className="check-pop-in h-2.5 w-2.5 text-[var(--bg)]" />
                      )}
                    </span>
                    {option.selected ? "Elegido" : "Elegir"}
                  </button>
                  {canEdit && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(option.id, option.text)}
                        onPointerEnter={handleLiquidPointerEnter}
                        disabled={busy}
                        title="Editar esta alternativa"
                        aria-label="Editar esta alternativa"
                        className={iconButtonClass}
                      >
                        <PencilIcon className="relative" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCaption(option.id)}
                        onPointerEnter={handleLiquidPointerEnter}
                        disabled={busy}
                        title="Borrar esta alternativa"
                        aria-label="Borrar esta alternativa"
                        className={iconButtonClass}
                      >
                        <TrashIcon className="relative" />
                      </button>
                    </div>
                  )}
                </div>
                <p className="px-3 pt-2 pb-3 text-[15px] leading-[1.62] whitespace-pre-line text-brand-ink">
                  {option.text}
                </p>
              </div>
            );
          })}

          {addingCaption && (
            <CaptionEditor
              value={newCaption}
              onChange={setNewCaption}
              onCancel={() => {
                setAddingCaption(false);
                setNewCaption("");
              }}
              onSave={handleAddCaption}
              busy={busy}
              placeholder="Escribí la otra alternativa de caption…"
              saveLabel="Agregar"
            />
          )}
        </div>

        <div className="mt-3 text-sm leading-[1.6] font-bold text-brand-blue">{proposal.hashtags}</div>
      </div>

      {(canEdit || musicOptions.length > 0) && (
        <>
          <div className="h-px bg-line" />
          <MusicSection
            options={musicOptions}
            canEdit={canEdit}
            busy={busy}
            proposalId={proposal.id}
            onAdd={(url, label, audioUrl, audioName) =>
              runMusicAction(() => addMusicOption(proposal.id, { url, label, audioUrl, audioName }))
            }
            onDelete={(optionId) => runMusicAction(() => deleteMusicOption(optionId))}
            onSetAudio={(optionId, audioUrl, audioName) =>
              runMusicAction(() => setMusicOptionAudio(optionId, audioUrl, audioName))
            }
            onClearAudio={(optionId) => runMusicAction(() => clearMusicOptionAudio(optionId))}
            onSelect={(optionId, selected) => {
              onPatchProposal(proposal.id, {
                musicOptions: musicOptions.map((m) => ({
                  ...m,
                  selected: selected && m.id === optionId,
                })),
              });
              void runMusicAction(() => setMusicOptionSelected(optionId, selected));
            }}
          />
        </>
      )}

      {showHistory && <VersionHistoryModal proposal={proposal} onClose={() => setShowHistory(false)} />}
    </div>
  );
}

function CaptionEditor({
  value,
  onChange,
  onCancel,
  onSave,
  busy,
  placeholder,
  saveLabel = "Guardar",
}: {
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
  busy: boolean;
  placeholder?: string;
  saveLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus
        className="min-h-32 w-full resize-y rounded border border-line-2 bg-panel-2 px-3 py-2 text-[15px] leading-[1.5] text-brand-ink"
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={`inline-flex min-h-9 items-center rounded border border-line-2 bg-panel-2 px-3.5 text-xs leading-none font-bold tracking-[0.04em] text-brand-ink transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={busy || !value.trim()}
          className={`inline-flex min-h-9 items-center rounded border border-brand-blue bg-brand-blue px-3.5 text-xs leading-none font-bold tracking-[0.04em] text-[var(--bg)] transition-transform duration-[400ms] disabled:cursor-default disabled:opacity-60 ${PRESS_SCALE_CLASS}`}
        >
          {saveLabel}
        </button>
      </div>
    </div>
  );
}

/** MIME por extensión para los formatos de audio que alguien podría subir
 * acá. `.m4a` es el caso que rompe si se confía en `file.type`: el navegador
 * lo deriva de cómo el SO tenga asociada la extensión, y en más de un caso
 * real (Chrome en Android/Linux sin esa asociación) llega vacío — Vercel
 * Blob rechaza la subida con "contentType ... is not allowed" porque un
 * `""` no matchea el `audio/*` que exige /api/blob/upload, y eso es lo que
 * se ve como "no funciona subir el audio". Forzar el MIME por extensión
 * saca esa adivinanza del medio. */
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

function resolveAudioContentType(file: File): string | undefined {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && AUDIO_MIME_BY_EXTENSION[ext]) return AUDIO_MIME_BY_EXTENSION[ext];
  // Extensión no reconocida: si el navegador ya mandó algo razonable, se
  // respeta; si no, se deja sin override y que Vercel Blob intente derivarlo
  // del nombre del archivo.
  return file.type.startsWith("audio/") ? file.type : undefined;
}

/** Músicas de Instagram propuestas — misma mecánica de selección única que
 * las alternativas de caption, con la diferencia de que acá se puede
 * desmarcar: un post puede no llevar música. */
/** Sentinel para el input de archivo compartido: distingue "el audio es para
 * la música que se está armando en el formulario" (todavía sin fila en la
 * base) de "el audio es para reemplazar el de una fila que ya existe" (un
 * id real). Nunca puede colisionar con un cuid() de Prisma. */
const NEW_MUSIC_TARGET = "__new__";

function MusicSection({
  options,
  canEdit,
  busy,
  proposalId,
  onAdd,
  onDelete,
  onSelect,
  onSetAudio,
  onClearAudio,
}: {
  options: ProposalMusicOption[];
  canEdit: boolean;
  busy: boolean;
  proposalId: string;
  onAdd: (url: string | undefined, label?: string, audioUrl?: string, audioName?: string) => void;
  onDelete: (optionId: string) => void;
  onSelect: (optionId: string, selected: boolean) => void;
  onSetAudio: (optionId: string, audioUrl: string, audioName?: string) => void;
  onClearAudio: (optionId: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [uploadingId, setUploadingId] = useState("");
  // Audio ya subido a Blob para la música que se está armando — todavía no
  // hay fila en la base, así que se guarda acá hasta que se confirme
  // "Agregar" (ver handleAdd). Si se cancela, el archivo queda huérfano en
  // Blob — mismo trade-off que quitarle el audio a una fila existente.
  const [newAudioUrl, setNewAudioUrl] = useState("");
  const [newAudioName, setNewAudioName] = useState("");
  const audioInputRef = useRef<HTMLInputElement>(null);
  const pendingTargetRef = useRef("");

  async function uploadAudio(file: File): Promise<string> {
    return uploadBlob(
      `proposals/${proposalId}/music`,
      file,
      undefined,
      undefined,
      resolveAudioContentType(file),
    );
  }

  async function handleAudioFile(optionId: string, file: File) {
    setUploadingId(optionId);
    try {
      const audioUrl = await uploadAudio(file);
      onSetAudio(optionId, audioUrl, file.name);
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo subir el audio.");
    } finally {
      setUploadingId("");
    }
  }

  async function handleNewAudioFile(file: File) {
    setUploadingId(NEW_MUSIC_TARGET);
    setError("");
    try {
      const audioUrl = await uploadAudio(file);
      setNewAudioUrl(audioUrl);
      setNewAudioName(file.name);
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo subir el audio.");
    } finally {
      setUploadingId("");
    }
  }

  function openAudioPicker(target: string) {
    pendingTargetRef.current = target;
    audioInputRef.current?.click();
  }
  // Uno solo a la vez, y montado recién al abrirlo: cada reproductor es un
  // iframe de Instagram (varios cientos de KB), y dos sonando juntos no le
  // sirven a nadie.
  const [playingId, setPlayingId] = useState("");

  function resetAddForm() {
    setAdding(false);
    setUrl("");
    setLabel("");
    setError("");
    setNewAudioUrl("");
    setNewAudioName("");
  }

  function handleAdd() {
    const trimmedUrl = url.trim();
    // La misma validación corre en el server (es la que manda); acá se repite
    // para poder mostrar el motivo exacto sin esperar el round-trip. Un
    // enlace es opcional si ya hay un audio subido — la música puede cargarse
    // solo con el archivo, sin pasar por Instagram para nada.
    let normalized: string | undefined;
    if (trimmedUrl) {
      try {
        normalized = normalizeInstagramMusicUrl(trimmedUrl);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Enlace inválido.");
        return;
      }
    }
    if (!normalized && !newAudioUrl) {
      setError("Pegá un enlace o subí un archivo de audio.");
      return;
    }
    const finalLabel = label.trim() || undefined;
    const audioUrl = newAudioUrl || undefined;
    const audioName = newAudioName || undefined;
    resetAddForm();
    onAdd(normalized, finalLabel, audioUrl, audioName);
  }

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2.5">
        <span className="text-[11px] tracking-label text-tx-3 uppercase">Música de Instagram</span>
        {canEdit && options.length < MUSIC_OPTIONS_LIMIT && !adding && (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setError("");
            }}
            onPointerEnter={handleLiquidPointerEnter}
            disabled={busy}
            title="Agregar una música"
            aria-label="Agregar una música"
            className={iconButtonClass}
          >
            <PlusIcon className="relative" />
          </button>
        )}
      </div>

      {options.length > 1 && (
        <p className="mb-2 text-[11px] leading-[1.4] text-tx-3">
          Marcá la música aprobada — solo una puede quedar elegida.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {options.length === 0 && !adding && (
          <p className="text-[13px] text-tx-3">Sin música propuesta.</p>
        )}

        {options.map((option) => {
          const embedSrc = option.url ? instagramEmbedSrc(option.url) : null;
          const playing = playingId === option.id;
          return (
            <div
              key={option.id}
              className={`rounded border transition-[border-color,background-color] duration-[400ms] ${
                option.selected ? "border-brand-blue bg-brand-blue/[0.05]" : "border-line-2 bg-panel-2"
              }`}
            >
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  onClick={() => onSelect(option.id, !option.selected)}
                  disabled={busy}
                  aria-pressed={option.selected}
                  title={option.selected ? "Quitar la selección" : "Elegir esta música"}
                  className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors duration-[400ms] disabled:cursor-default ${PRESS_SCALE_CLASS} ${
                    option.selected ? "border-brand-blue bg-brand-blue" : "border-line-2 hover:border-brand-blue"
                  }`}
                >
                  {option.selected && <CheckIcon className="check-pop-in h-2.5 w-2.5 text-[var(--bg)]" />}
                </button>
                {/* Toda música con enlace se escucha afuera (ver
                    instagramEmbedSrc), así que se abre en una pestaña nueva y
                    lo dice con el ícono: sin eso, en el celular parece que la
                    app se fue a Instagram y se perdió lo que estaba mirando.
                    Sin enlace (solo audio subido), no hay nada externo que
                    abrir — el nombre es texto plano. */}
                {option.url ? (
                  <a
                    href={option.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] text-brand-ink underline-offset-2 hover:text-brand-blue [&:hover>span]:underline"
                    title={`Abrir en Instagram (pestaña nueva) — ${option.url}`}
                  >
                    <span className="truncate">
                      {option.label || describeInstagramMusicUrl(option.url)}
                    </span>
                    <ExternalLinkIcon className="h-3 w-3 shrink-0 opacity-60" />
                  </a>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-[13px] text-brand-ink">
                    {option.label || option.audioName || "Audio subido"}
                  </span>
                )}
                {embedSrc && (
                  <button
                    type="button"
                    onClick={() => setPlayingId(playing ? "" : option.id)}
                    onPointerEnter={handleLiquidPointerEnter}
                    aria-expanded={playing}
                    title={playing ? "Cerrar la vista previa" : "Ver el reel"}
                    aria-label={playing ? "Cerrar la vista previa" : "Ver el reel"}
                    className={`${iconButtonClass} shrink-0${playing ? " border-brand-blue bg-brand-blue/[0.06] text-brand-blue" : ""}`}
                  >
                    {playing ? <CloseIcon className="relative" /> : <EyeIcon className="relative" />}
                  </button>
                )}
                {canEdit && !option.audioUrl && (
                  <button
                    type="button"
                    onClick={() => openAudioPicker(option.id)}
                    onPointerEnter={handleLiquidPointerEnter}
                    disabled={busy || uploadingId === option.id}
                    title="Subir el archivo de audio (para escucharla acá)"
                    aria-label="Subir el archivo de audio"
                    className={`${iconButtonClass} shrink-0`}
                  >
                    <UploadIcon className="relative" />
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onDelete(option.id)}
                    onPointerEnter={handleLiquidPointerEnter}
                    disabled={busy}
                    title="Quitar esta música"
                    aria-label="Quitar esta música"
                    className={`${iconButtonClass} shrink-0`}
                  >
                    <TrashIcon className="relative" />
                  </button>
                )}
              </div>

              {uploadingId === option.id && (
                <div className="border-t border-line-2 px-3 py-2 text-[11px] text-tx-3">
                  Subiendo audio…
                </div>
              )}

              {option.audioUrl && (
                <div className="flex items-center gap-2 border-t border-line-2 px-3 py-2">
                  {/* El único reproductor real del panel: el archivo vive en
                      nuestro Blob (ver assertBlobUrl), no en Instagram, así
                      que sí puede sonar acá mismo. */}
                  <audio controls preload="none" src={option.audioUrl} className="h-8 min-w-0 flex-1" />
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => onClearAudio(option.id)}
                      onPointerEnter={handleLiquidPointerEnter}
                      disabled={busy}
                      title="Quitar el audio subido"
                      aria-label="Quitar el audio subido"
                      className={`${iconButtonClass} shrink-0`}
                    >
                      <TrashIcon className="relative" />
                    </button>
                  )}
                </div>
              )}

              {embedSrc && playing && (
                <div className="border-t border-line-2 px-3 py-3">
                  {/* Mismo iframe directo a /embed que usa /estrategia — el
                      chrome de adentro (header, "Ver perfil") es de Instagram
                      y vive en otro origen, no se puede re-tematizar. Y su
                      botón de play NO reproduce acá: abre Instagram en una
                      pestaña nueva (ver instagramEmbedSrc). */}
                  <iframe
                    src={embedSrc}
                    className="mx-auto aspect-[9/16] w-full max-w-[240px] rounded"
                    style={{ border: 0 }}
                    allow="autoplay; encrypted-media; fullscreen"
                    allowFullScreen
                    scrolling="no"
                    title={option.label || "Reel de Instagram"}
                  />
                </div>
              )}
            </div>
          );
        })}

        {canEdit && (
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*,.m4a,.mp3,.wav,.ogg,.aac,.flac"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              const target = pendingTargetRef.current;
              e.target.value = "";
              if (!file || !target) return;
              if (target === NEW_MUSIC_TARGET) void handleNewAudioFile(file);
              else void handleAudioFile(target, file);
            }}
          />
        )}

        {options.length > 0 && (
          <p className="text-[11px] leading-[1.4] text-tx-3">
            Instagram no deja reproducir su contenido fuera de Instagram: la vista previa muestra la
            portada y el play abre la canción en una pestaña nueva. Para escucharla acá, subí el
            archivo de audio con {"↑"}.
          </p>
        )}

        {adding && (
          <div className="flex flex-col gap-2">
            <input
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError("");
              }}
              placeholder="Pegá el enlace del reel o del audio (opcional)"
              inputMode="url"
              autoFocus
              className="min-h-9 w-full rounded border border-line-2 bg-panel-2 px-3 text-[13px] text-brand-ink"
            />
            <p className="text-[11px] leading-[1.4] text-tx-3">
              Si pegás el reel que usa la canción, se ve la portada acá; la página de audio queda
              solo como enlace.
            </p>

            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-line-2" />
              <span className="text-[10px] font-bold tracking-label text-tx-3 uppercase">o</span>
              <div className="h-px flex-1 bg-line-2" />
            </div>

            {newAudioUrl ? (
              <div className="flex items-center gap-2 rounded border border-brand-blue bg-brand-blue/[0.05] px-3 py-2">
                <UploadIcon className="h-3.5 w-3.5 shrink-0 text-brand-blue" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-brand-ink">{newAudioName}</span>
                <button
                  type="button"
                  onClick={() => {
                    setNewAudioUrl("");
                    setNewAudioName("");
                  }}
                  title="Quitar el audio subido"
                  aria-label="Quitar el audio subido"
                  className={`${iconButtonClass} shrink-0`}
                >
                  <TrashIcon className="relative" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => openAudioPicker(NEW_MUSIC_TARGET)}
                disabled={uploadingId === NEW_MUSIC_TARGET}
                className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded border border-line-2 bg-panel-2 px-3.5 text-xs leading-none font-bold tracking-[0.04em] text-brand-ink transition-transform duration-[400ms] disabled:cursor-default disabled:opacity-60 ${PRESS_SCALE_CLASS}`}
              >
                <UploadIcon className="h-3.5 w-3.5" />
                {uploadingId === NEW_MUSIC_TARGET ? "Subiendo…" : "Subir un archivo de audio"}
              </button>
            )}

            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Nombre (opcional)"
              className="min-h-9 w-full rounded border border-line-2 bg-panel-2 px-3 text-[13px] text-brand-ink"
            />
            {error && (
              <p className="text-[11px] leading-[1.4] text-[var(--color-brand-red-text)]">{error}</p>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={resetAddForm}
                className={`inline-flex min-h-9 items-center rounded border border-line-2 bg-panel-2 px-3.5 text-xs leading-none font-bold tracking-[0.04em] text-brand-ink transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={busy || (!url.trim() && !newAudioUrl)}
                className={`inline-flex min-h-9 items-center rounded border border-brand-blue bg-brand-blue px-3.5 text-xs leading-none font-bold tracking-[0.04em] text-[var(--bg)] transition-transform duration-[400ms] disabled:cursor-default disabled:opacity-60 ${PRESS_SCALE_CLASS}`}
              >
                Agregar
              </button>
            </div>
          </div>
        )}
      </div>
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

function PlusIcon({ className }: { className?: string }) {
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
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
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
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
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
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
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
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function fallbackCopy(text: string) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(ta);
  }
}

function EyeIcon({ className }: { className?: string }) {
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
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
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
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
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
      <path d="M12 16V4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}
