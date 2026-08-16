"use client";

import { useEffect, useRef, useState } from "react";
import Topbar from "@/components/dashboard/Topbar";
import { useBrand } from "@/lib/dashboard/BrandContext";
import { iconButtonClass, PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import type { MoodboardSessionDetail, MoodboardSessionSummary } from "@/types/moodboard";
import {
  createSession,
  deleteSession,
  getSession,
  renameSession,
  setSessionArchived,
} from "./actions";
import MoodboardCanvas from "./MoodboardCanvas";

interface MoodboardWorkspaceProps {
  initialSessions: MoodboardSessionSummary[];
}

function defaultSessionName(): string {
  const now = new Date();
  const month = now.toLocaleDateString("es-DO", { month: "long" });
  return `Sesión ${month.charAt(0).toUpperCase()}${month.slice(1)} ${now.getFullYear()}`;
}

function formatCreated(iso: string): string {
  return new Date(iso).toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric" });
}

export default function MoodboardWorkspace({ initialSessions }: MoodboardWorkspaceProps) {
  const { brandName } = useBrand();
  const [sessions, setSessions] = useState(initialSessions);
  const [activeId, setActiveId] = useState<string | null>(
    initialSessions.find((s) => !s.archived)?.id ?? initialSessions[0]?.id ?? null,
  );
  const [detail, setDetail] = useState<MoodboardSessionDetail | null>(null);
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);

  // Carga de la sesión activa. El id que se pidió viaja en un ref para
  // descartar la respuesta de una sesión que ya no es la activa (el usuario
  // cambió de tablero mientras la anterior todavía estaba en vuelo).
  const requestedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeId) return;
    requestedRef.current = activeId;
    getSession(activeId)
      .then((result) => {
        if (requestedRef.current !== activeId) return;
        if (!result) {
          setError("Esa sesión ya no existe.");
          return;
        }
        setDetail(result);
      })
      .catch((e: unknown) => {
        if (requestedRef.current !== activeId) return;
        setError(e instanceof Error ? e.message : "No se pudo abrir la sesión.");
      });
  }, [activeId]);

  // El detalle solo vale si es el de la sesión activa: mientras la nueva
  // carga (o si se borró la última) no debe verse el tablero anterior. Así
  // el efecto de arriba tampoco necesita limpiar `detail` a mano.
  const current = detail && detail.id === activeId ? detail : null;
  // Derivado, no un estado aparte: hay sesión elegida, todavía no llegó su
  // contenido, y no falló en el camino.
  const loading = Boolean(activeId) && !current && !error;

  function patchSummary(id: string, patch: Partial<MoodboardSessionSummary>) {
    setSessions((prev) => {
      // Devolver `prev` tal cual cuando no cambia nada evita un render de más
      // por cada aviso repetido (el contador de elementos avisa seguido).
      const target = prev.find((s) => s.id === id);
      if (!target || Object.entries(patch).every(([key, value]) => target[key as keyof typeof target] === value)) {
        return prev;
      }
      return prev.map((s) => (s.id === id ? { ...s, ...patch } : s));
    });
  }

  /** Cambiar de tablero limpia el error del anterior — el efecto de carga no
   * puede hacerlo (setState sincrónico en un efecto encadena renders). */
  function selectSession(id: string | null) {
    setError("");
    setActiveId(id);
  }

  async function handleCreate() {
    setError("");
    try {
      const created = await createSession(defaultSessionName());
      setSessions((prev) => [created, ...prev]);
      selectSession(created.id);
      setPickerOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la sesión.");
    }
  }

  async function handleRename(name: string) {
    if (!current || name.trim() === current.name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setDetail({ ...current, name: trimmed });
    patchSummary(current.id, { name: trimmed });
    try {
      await renameSession(current.id, trimmed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo renombrar la sesión.");
    }
  }

  async function handleToggleArchive() {
    if (!current) return;
    const next = !current.archived;
    setDetail({ ...current, archived: next });
    patchSummary(current.id, { archived: next });
    try {
      await setSessionArchived(current.id, next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo archivar la sesión.");
    }
  }

  async function handleDelete() {
    if (!current) return;
    const label = current.elementCount
      ? `¿Borrar "${current.name}" y sus ${current.elementCount} elementos? Esta acción no se puede deshacer.`
      : `¿Borrar "${current.name}"? Esta acción no se puede deshacer.`;
    if (!window.confirm(label)) return;

    const removedId = current.id;
    const remaining = sessions.filter((s) => s.id !== removedId);
    setSessions(remaining);
    selectSession(remaining.find((s) => !s.archived)?.id ?? remaining[0]?.id ?? null);
    try {
      await deleteSession(removedId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar la sesión.");
    }
  }

  const active = sessions.filter((s) => !s.archived);
  const archived = sessions.filter((s) => s.archived);

  return (
    // dvh y no vh: en mobile la barra de direcciones del navegador se
    // superpone al final de la ventana, y con 100vh las barras flotantes del
    // canvas quedaban debajo de ella, inalcanzables.
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[var(--bg)] font-sans text-brand-ink">
      <div className="flex h-[3px] w-full shrink-0">
        <span className="w-16 bg-brand-red" />
        <span className="flex-1 bg-brand-blue" />
      </div>

      <Topbar view="moodboard" planLabel={brandName} />
      <div className="h-px shrink-0 bg-line" />

      {/* Barra de sesión — todo lo que es "qué tablero estoy viendo". Lo que
          es "qué hago dentro del tablero" vive flotando sobre el canvas. */}
      <div className="relative z-30 flex shrink-0 flex-wrap items-center gap-2 px-4 py-2.5 desktop:px-8">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-expanded={pickerOpen}
          className={`flex items-center gap-2 rounded border border-line-2 bg-panel-2 px-3 py-1.5 text-xs font-bold tracking-label uppercase text-tx-2 transition-colors duration-[400ms] hover:border-brand-blue hover:text-brand-blue ${PRESS_SCALE_CLASS}`}
        >
          <LayersIcon />
          Sesiones
          <span className="text-tx-3">({active.length})</span>
        </button>

        {current && (
          <>
            {renaming ? (
              <input
                autoFocus
                defaultValue={current.name}
                onBlur={(e) => {
                  void handleRename(e.target.value);
                  setRenaming(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") setRenaming(false);
                }}
                className="min-w-0 flex-1 rounded border border-brand-blue bg-panel-2 px-2 py-1 text-sm font-bold outline-none"
              />
            ) : (
              <button
                type="button"
                onDoubleClick={() => setRenaming(true)}
                onClick={() => setRenaming(true)}
                title="Renombrar sesión"
                className="min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-sm font-bold transition-colors duration-[400ms] hover:bg-panel-2"
              >
                {current.name}
                {current.archived && (
                  <span className="ml-2 rounded-sm border border-line-2 px-1.5 py-0.5 text-[10px] font-bold tracking-label text-tx-3 uppercase">
                    Archivada
                  </span>
                )}
              </button>
            )}

            <span className="hidden text-[11px] text-tx-3 desktop:inline">
              {formatCreated(current.createdAt)}
            </span>

            <button
              type="button"
              onClick={() => void handleToggleArchive()}
              title={current.archived ? "Desarchivar sesión" : "Archivar sesión"}
              aria-label={current.archived ? "Desarchivar sesión" : "Archivar sesión"}
              className={iconButtonClass}
            >
              <ArchiveIcon className="relative" />
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              title="Borrar sesión"
              aria-label="Borrar sesión"
              className={`${iconButtonClass} hover:border-brand-red hover:text-brand-red`}
            >
              <TrashIcon className="relative" />
            </button>
          </>
        )}

        {pickerOpen && (
          <>
            {/* Capa de cierre por click afuera — sin listener global en document. */}
            <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
            <div className="absolute top-full left-4 z-20 mt-1 flex max-h-[60vh] w-[300px] flex-col overflow-y-auto rounded border border-line-2 bg-[var(--bg)] p-1.5 shadow-lg desktop:left-8">
              <button
                type="button"
                onClick={() => void handleCreate()}
                className={`mb-1 flex items-center gap-2 rounded bg-brand-blue px-3 py-2 text-xs font-bold tracking-label text-[var(--bg)] uppercase ${PRESS_SCALE_CLASS}`}
              >
                <PlusIcon />
                Nueva sesión
              </button>

              {active.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  activeId={activeId}
                  onSelect={(id) => {
                    selectSession(id);
                    setPickerOpen(false);
                  }}
                />
              ))}

              {archived.length > 0 && (
                <>
                  <div className="mt-2 px-3 py-1 text-[10px] tracking-label text-tx-3 uppercase">
                    Archivadas
                  </div>
                  {archived.map((s) => (
                    <SessionRow
                      key={s.id}
                      session={s}
                      activeId={activeId}
                      onSelect={(id) => {
                        selectSession(id);
                        setPickerOpen(false);
                      }}
                    />
                  ))}
                </>
              )}

              {sessions.length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-tx-3">Todavía no hay sesiones.</p>
              )}
            </div>
          </>
        )}
      </div>

      {error && (
        <p className="shrink-0 border-t border-line bg-brand-red/10 px-4 py-1.5 text-xs text-brand-red desktop:px-8">
          {error}
        </p>
      )}

      <div className="h-px shrink-0 bg-line" />

      <div className="relative min-h-0 flex-1">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-tx-3">
            Abriendo sesión…
          </div>
        )}

        {!loading && !current && (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <h2 className="font-thin text-[28px] leading-tight font-light text-brand-ink">
              Tu tablero de referencias
            </h2>
            <p className="max-w-sm text-sm leading-relaxed text-tx-2">
              Pegá capturas, arrastrá archivos y guardá links de reels en un lienzo libre. Cuando una
              referencia sirva, se convierte en propuesta con un clic.
            </p>
            <button
              type="button"
              onClick={() => void handleCreate()}
              className={`flex items-center gap-2 rounded bg-brand-blue px-4 py-2.5 text-xs font-bold tracking-label text-[var(--bg)] uppercase ${PRESS_SCALE_CLASS}`}
            >
              <PlusIcon />
              Crear primera sesión
            </button>
          </div>
        )}

        {current && !loading && (
          // key: cada sesión arranca con su propio estado de canvas (elementos,
          // selección, pan/zoom) — sin esto, cambiar de tablero conservaría el
          // estado interno del anterior.
          <MoodboardCanvas
            key={current.id}
            session={current}
            onElementCountChange={(count) => patchSummary(current.id, { elementCount: count })}
          />
        )}
      </div>
    </div>
  );
}

function SessionRow({
  session,
  activeId,
  onSelect,
}: {
  session: MoodboardSessionSummary;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const isActive = session.id === activeId;
  return (
    <button
      type="button"
      onClick={() => onSelect(session.id)}
      className={`flex w-full flex-col gap-0.5 rounded px-3 py-2 text-left transition-colors duration-[400ms] ${
        isActive ? "bg-brand-blue text-[var(--bg)]" : "hover:bg-panel-2"
      } ${PRESS_SCALE_CLASS}`}
    >
      <span className="truncate text-sm font-bold">{session.name}</span>
      <span className={`text-[11px] ${isActive ? "opacity-80" : "text-tx-3"}`}>
        {formatCreated(session.createdAt)} · {session.elementCount}{" "}
        {session.elementCount === 1 ? "elemento" : "elementos"}
      </span>
    </button>
  );
}

function LayersIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function ArchiveIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="5" rx="1" />
      <path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}
