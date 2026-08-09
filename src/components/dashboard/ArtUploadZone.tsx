"use client";

import { upload } from "@vercel/blob/client";
import { useCallback, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";

export interface UploadedFile {
  id: string;
  url: string;
  name: string;
}

interface ArtUploadZoneProps {
  label: string;
  accept: string;
  multiple: boolean;
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  /** Id real de la propuesta (edición) o un id temporal generado en el
   * cliente (creación, todavía sin guardar) — solo se usa para organizar la
   * ruta del archivo en Blob Storage, no es un límite de seguridad. */
  proposalId: string;
}

/** Etapas por las que pasa cada archivo en el verificador de estado. */
export type UploadStage = "subiendo" | "verificando" | "listo" | "error";

/** Una fila del verificador: qué archivo es y en qué punto está. */
export interface UploadStatus {
  id: string;
  name: string;
  size: number;
  stage: UploadStage;
  progress: number;
  message?: string;
}

/** 500MB — generoso para video real, sirve sobre todo para dar un error
 * claro en vez de que el PUT falle sin explicación. */
const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;

/** Si la subida no termina en este plazo la cortamos y mostramos el error.
 * Sin esto el SDK reintenta los 5xx con backoff exponencial y el recuadro se
 * queda clavado en "Subiendo archivo…" durante minutos sin explicar nada. */
const UPLOAD_TIMEOUT_MS = 3 * 60 * 1000;

/** A partir de este tamaño el SDK sube en partes (mejor para video). */
const MULTIPART_THRESHOLD_BYTES = 8 * 1024 * 1024;

const STAGE_DOT: Record<UploadStage, string> = {
  subiendo: "animate-pulse bg-brand-blue",
  verificando: "animate-pulse bg-brand-blue",
  listo: "bg-emerald-500",
  error: "bg-brand-red",
};

const STAGE_BAR: Record<UploadStage, string> = {
  subiendo: "bg-brand-blue",
  verificando: "bg-brand-blue",
  listo: "bg-emerald-500",
  error: "bg-brand-red",
};

function stageLabel(status: UploadStatus): string {
  if (status.stage === "subiendo") return `${status.progress}%`;
  if (status.stage === "verificando") return "Verificando…";
  if (status.stage === "listo") return "Listo";
  return "Error";
}

export function makeFileId(): string {
  return `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Segundo tramo del verificador: confirma que el blob quedó realmente
 * publicado y se puede leer por URL. Devuelve un aviso (string) si no se pudo
 * comprobar, null si está todo bien, y lanza si el archivo no existe. */
export async function verifyUploadedBlob(url: string): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(url, { method: "HEAD", cache: "no-store" });
  } catch {
    // Corte de red o bloqueo del navegador: no damos la subida por perdida,
    // solo avisamos para que se pueda revisar el arte antes de aprobarlo.
    return "No se pudo confirmar el acceso al archivo desde el navegador.";
  }
  if (!res.ok) {
    throw new Error(`El archivo se subió pero no se puede leer (HTTP ${res.status}).`);
  }
  return null;
}

/** Sube el archivo directo a Vercel Blob desde el navegador — el SDK pide un
 * token de cliente a /api/blob/upload y hace el PUT él mismo; el archivo
 * nunca pasa por nuestro servidor. */
export async function uploadFileToBlob(
  proposalId: string,
  file: File,
  onProgress?: (percentage: number) => void,
  abortSignal?: AbortSignal,
): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const pathname = `proposals/${proposalId}/${makeFileId()}-${safeName}`;

  try {
    const blob = await upload(pathname, file, {
      access: "public",
      handleUploadUrl: "/api/blob/upload",
      multipart: file.size > MULTIPART_THRESHOLD_BYTES,
      abortSignal,
      onUploadProgress: onProgress ? ({ percentage }) => onProgress(percentage) : undefined,
    });
    return blob.url;
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "No se pudo subir el archivo.");
  }
}

/** Ventana de carga de artes: pegar (⌘V o botón), arrastrar, o buscar en Finder. */
export default function ArtUploadZone({ label, accept, multiple, files, onFilesChange, proposalId }: ArtUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [statuses, setStatuses] = useState<UploadStatus[]>([]);
  const [error, setError] = useState("");
  const isImage = accept.startsWith("image");

  const uploading = statuses.filter((s) => s.stage === "subiendo" || s.stage === "verificando").length;

  const patchStatus = useCallback((id: string, data: Partial<UploadStatus>) => {
    setStatuses((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)));
  }, []);

  function dismissStatus(id: string) {
    setStatuses((prev) => prev.filter((s) => s.id !== id));
  }

  async function addFiles(incoming: File[] | FileList) {
    const valid = Array.from(incoming).filter((f) =>
      isImage ? f.type.startsWith("image/") : f.type.startsWith("video/"),
    );
    if (!valid.length) return;

    const oversized = valid.find((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (oversized) {
      setError(`"${oversized.name}" pesa más de 500MB — elegí un archivo más liviano.`);
      return;
    }

    setError("");

    const jobs = valid.map((file) => ({ file, statusId: makeFileId() }));
    setStatuses((prev) => [
      ...prev.filter((s) => s.stage !== "listo"),
      ...jobs.map(({ file, statusId }) => ({
        id: statusId,
        name: file.name,
        size: file.size,
        stage: "subiendo" as UploadStage,
        progress: 0,
      })),
    ]);

    const results = await Promise.all(
      jobs.map(async ({ file, statusId }): Promise<UploadedFile | null> => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
        try {
          const url = await uploadFileToBlob(
            proposalId,
            file,
            (percentage) => patchStatus(statusId, { progress: Math.round(percentage) }),
            controller.signal,
          );
          patchStatus(statusId, { stage: "verificando", progress: 100 });
          const warning = await verifyUploadedBlob(url);
          patchStatus(statusId, { stage: "listo", message: warning ?? undefined });
          return { id: makeFileId(), url, name: file.name };
        } catch (e) {
          const message = controller.signal.aborted
            ? `"${file.name}" tardó más de 3 minutos y se canceló la subida. Probá de nuevo.`
            : e instanceof Error
              ? e.message
              : "No se pudo subir el archivo.";
          patchStatus(statusId, { stage: "error", message });
          setError(message);
          return null;
        } finally {
          clearTimeout(timer);
        }
      }),
    );

    const uploaded = results.filter((r): r is UploadedFile => r !== null);
    if (uploaded.length) {
      onFilesChange(multiple ? [...files, ...uploaded] : uploaded.slice(0, 1));
    }

    // Las filas que salieron bien se limpian solas; las que fallaron o tienen
    // un aviso quedan hasta que las cierres a mano.
    setTimeout(() => {
      setStatuses((prev) => prev.filter((s) => s.stage !== "listo" || Boolean(s.message)));
    }, 2500);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files);
  }

  function handleNativePaste(e: ClipboardEvent<HTMLDivElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const found: File[] = [];
    for (const item of Array.from(items)) {
      if (isImage ? item.type.startsWith("image/") : item.type.startsWith("video/")) {
        const file = item.getAsFile();
        if (file) found.push(file);
      }
    }
    if (found.length) void addFiles(found);
  }

  async function handlePasteClick() {
    try {
      const clipboardItems = await navigator.clipboard.read();
      const found: File[] = [];
      for (const item of clipboardItems) {
        const type = item.types.find((t) => (isImage ? t.startsWith("image/") : t.startsWith("video/")));
        if (!type) continue;
        const blob = await item.getType(type);
        found.push(new File([blob], `pegado.${type.split("/")[1] || "bin"}`, { type }));
      }
      if (found.length) void addFiles(found);
    } catch {
      // sin permiso de portapapeles o no soportado — el usuario puede usar ⌘V en el recuadro
    }
  }

  function removeFile(id: string) {
    onFilesChange(files.filter((f) => f.id !== id));
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] tracking-[0.1em] text-tx-3 uppercase">{label}</span>
      <div
        tabIndex={0}
        onPaste={handleNativePaste}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center gap-2 rounded border border-dashed px-4 py-6 text-center transition-colors duration-150 ${
          dragOver ? "border-brand-blue bg-brand-blue/[0.06]" : "border-line-2 bg-panel-2"
        }`}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePasteClick}
            title="Pegar"
            className={`flex h-9 w-9 items-center justify-center rounded border border-line-2 bg-white text-brand-blue transition-transform duration-150 ${PRESS_SCALE_CLASS}`}
          >
            <ClipboardIcon />
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            title="Buscar en Finder"
            className={`flex h-9 w-9 items-center justify-center rounded border border-line-2 bg-white text-brand-blue transition-transform duration-150 ${PRESS_SCALE_CLASS}`}
          >
            <UploadIcon />
          </button>
        </div>
        <p className="text-xs text-tx-3">
          {uploading > 0 ? `Subiendo ${uploading === 1 ? "archivo" : `${uploading} archivos`}…` : "Pegar (⌘V), arrastrar, o buscar en Finder"}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => e.target.files && void addFiles(e.target.files)}
        />
      </div>

      {statuses.length > 0 && (
        <ul className="flex flex-col gap-1">
          {statuses.map((s) => (
            <li key={s.id} className="rounded border border-line-2 bg-panel-2 px-2 py-1.5">
              <div className="flex items-center gap-2 text-[11px] text-tx-3">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STAGE_DOT[s.stage]}`} />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="shrink-0">{formatBytes(s.size)}</span>
                <span className="shrink-0 tabular-nums">{stageLabel(s)}</span>
                {s.stage !== "subiendo" && s.stage !== "verificando" && (
                  <button
                    type="button"
                    onClick={() => dismissStatus(s.id)}
                    aria-label={`Descartar aviso de ${s.name}`}
                    className={`shrink-0 leading-none transition-transform duration-150 ${PRESS_SCALE_CLASS}`}
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-black/10">
                <div
                  className={`h-full transition-[width] duration-200 ${STAGE_BAR[s.stage]}`}
                  style={{ width: `${s.stage === "error" ? 100 : Math.max(s.progress, 4)}%` }}
                />
              </div>
              {s.message && <p className="mt-1 text-[10px] text-brand-red">{s.message}</p>}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-brand-red">{error}</p>}

      {files.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {files.map((f) => (
            <div
              key={f.id}
              className="relative h-16 w-16 shrink-0 overflow-hidden rounded border border-line-2 bg-white"
            >
              {isImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- preview local del arte cargado, no un asset del sitio
                <img src={f.url} alt={f.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-tx-3">
                  <PlayIcon />
                  <span className="max-w-full truncate px-1 text-[9px]">{f.name}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeFile(f.id)}
                aria-label={`Quitar ${f.name}`}
                className={`absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-ink/80 text-[10px] leading-none text-white transition-transform duration-150 ${PRESS_SCALE_CLASS}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ClipboardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
