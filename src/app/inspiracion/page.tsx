"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import Topbar from "@/components/dashboard/Topbar";
import { useBrand } from "@/lib/dashboard/BrandContext";
import {
  addInspirationReel,
  deleteInspirationReel,
  getInspirationReels,
} from "@/lib/dashboard/inspiration-actions";
import { instagramEmbedSrc } from "@/lib/dashboard/instagram-music";
import { canEditContent, handleLiquidPointerEnter, iconButtonClass, PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import type { InspirationReel } from "@/types/dashboard";

/** Mismo breakpoint que el resto del dashboard (ver --breakpoint-desktop en
 * globals.css). Hace falta en JS y no solo en CSS: en mobile las celdas NO
 * montan el iframe de Instagram — mostrar y ocultar por CSS igual dejaría el
 * iframe cargando de fondo, que es justo el costo que se quiere evitar en
 * una grilla de dos columnas con potencialmente muchos reels. */
const DESKTOP_QUERY = "(min-width: 861px)";

function subscribeToDesktopQuery(callback: () => void): () => void {
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getIsDesktopSnapshot(): boolean {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

// El server no tiene ancho de ventana — arranca en "desktop" (grilla con
// iframes) y useSyncExternalStore lo corrige solo en el primer render del
// cliente si hace falta, sin el flash de layout que daría hacerlo a mano con
// useState+useEffect.
function getIsDesktopServerSnapshot(): boolean {
  return true;
}

export default function InspiracionPage() {
  const { brandName } = useBrand();
  const { data: session } = useSession();
  const canEdit = canEditContent(session?.user.role);

  const [reels, setReels] = useState<InspirationReel[]>([]);
  const [loading, setLoading] = useState(true);
  const isDesktop = useSyncExternalStore(
    subscribeToDesktopQuery,
    getIsDesktopSnapshot,
    getIsDesktopServerSnapshot,
  );
  const [openReelId, setOpenReelId] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getInspirationReels().then((data) => {
      if (cancelled) return;
      setReels(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function resetComposer() {
    setAdding(false);
    setUrl("");
    setError("");
  }

  async function handleAdd() {
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Pegá el link de un reel de Instagram.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await addInspirationReel(trimmed);
      setReels((prev) => [saved, ...prev]);
      resetComposer();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo agregar el reel.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(reel: InspirationReel) {
    if (!window.confirm("¿Borrar este reel del repositorio?")) return;
    setReels((prev) => prev.filter((r) => r.id !== reel.id));
    if (openReelId === reel.id) setOpenReelId(null);
    try {
      await deleteInspirationReel(reel.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo borrar el reel.");
      setReels((prev) => [reel, ...prev]);
    }
  }

  const openReel = reels.find((r) => r.id === openReelId) ?? null;
  const openEmbedSrc = openReel ? instagramEmbedSrc(openReel.url) : null;

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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] tracking-label text-tx-3 uppercase">Plan de contenido</div>
            <h1 className="text-2xl font-bold">Reels de inspiración</h1>
            <p className="mt-1 text-sm text-tx-2">
              Repositorio de referencias — pegá un link de Instagram y quedan todas juntas para mirar.
            </p>
          </div>
          {canEdit && !adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              onPointerEnter={handleLiquidPointerEnter}
              className={`${iconButtonClass} shrink-0`}
              title="Agregar un reel"
              aria-label="Agregar un reel"
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
              placeholder="Pegá el link de un reel o post de Instagram"
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
        ) : reels.length === 0 ? (
          <p className="text-sm text-tx-3">
            {canEdit ? "Todavía no se agregó ningún reel." : "Todavía no hay reels en el repositorio."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 desktop:grid-cols-3 desktop:gap-4">
            {reels.map((reel) => {
              const embedSrc = instagramEmbedSrc(reel.url);
              if (!embedSrc) return null;
              return (
                <div
                  key={reel.id}
                  className="group relative overflow-hidden rounded border border-line-2 bg-panel-2"
                  style={{ aspectRatio: "9 / 16" }}
                >
                  {isDesktop ? (
                    // El chrome de adentro (header, "Ver perfil") es de
                    // Instagram y vive en otro origen — su play no reproduce
                    // acá, abre Instagram en pestaña nueva (ver
                    // instagramEmbedSrc en instagram-music.ts).
                    <iframe
                      src={embedSrc}
                      className="h-full w-full"
                      style={{ border: 0 }}
                      allow="autoplay; encrypted-media; fullscreen"
                      allowFullScreen
                      scrolling="no"
                      title="Reel de Instagram"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpenReelId(reel.id)}
                      className={`flex h-full w-full flex-col items-center justify-center gap-2 text-tx-3 transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
                      aria-label="Ver reel"
                    >
                      <InstagramGlyphIcon />
                      <span className="text-xs font-bold">Ver reel</span>
                    </button>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleDelete(reel)}
                      aria-label="Quitar este reel"
                      title="Quitar este reel"
                      className={`absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-brand-ink/70 text-[var(--bg)] transition-opacity duration-[250ms] ${PRESS_SCALE_CLASS} ${
                        isDesktop ? "opacity-0 group-hover:opacity-100" : "opacity-100"
                      }`}
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pop de mobile: el iframe recién se monta acá, al tocar un reel —
          nunca en la grilla de dos columnas (ver DESKTOP_QUERY más arriba). */}
      {openReel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setOpenReelId(null)}
        >
          <div className="w-full max-w-[360px]" onClick={(e) => e.stopPropagation()}>
            {openEmbedSrc && (
              <iframe
                src={openEmbedSrc}
                className="aspect-[9/16] w-full rounded"
                style={{ border: 0 }}
                allow="autoplay; encrypted-media; fullscreen"
                allowFullScreen
                scrolling="no"
                title="Reel de Instagram"
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpenReelId(null)}
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

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
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

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

/** Tarjeta liviana de mobile — nada de iframe acá, solo el glifo de
 * Instagram para indicar qué se va a abrir al tocar. */
function InstagramGlyphIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
