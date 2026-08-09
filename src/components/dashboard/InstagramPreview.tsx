"use client";

import { useState } from "react";
import { useBrand } from "@/lib/dashboard/BrandContext";
import { PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import type { ProposalFormat } from "@/types/dashboard";

interface InstagramPreviewProps {
  format: ProposalFormat;
  caption: string;
  images: string[];
  onClose: () => void;
}

export default function InstagramPreview({ format, caption, images, onClose }: InstagramPreviewProps) {
  const { instagramHandle } = useBrand();
  const [activeIndex, setActiveIndex] = useState(0);
  const vertical = format === "Historia" || format === "Reel";
  const aspect = vertical ? "9 / 16" : format === "Carrusel" ? "4 / 5" : "1 / 1";
  const hasImages = images.length > 0;

  return (
    <div
      className="preview-backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="preview-card-in w-full max-w-[400px] rounded-lg border border-line-2 bg-white font-sans text-brand-ink shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-blue text-xs font-bold text-white">
              {instagramHandle.slice(0, 2).toUpperCase()}
            </span>
            <span className="text-sm font-bold">{instagramHandle}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className={`text-lg leading-none text-tx-3 transition-transform duration-150 ${PRESS_SCALE_CLASS}`}
          >
            ×
          </button>
        </div>

        <div className="relative w-full overflow-hidden bg-panel-2" style={{ aspectRatio: aspect }}>
          {hasImages ? (
            // eslint-disable-next-line @next/next/no-img-element -- preview local, no un asset del sitio
            <img src={images[activeIndex]} alt="" className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-tx-3">
              Sin arte cargado
            </div>
          )}
          {format === "Reel" && (
            <span className="absolute right-2 bottom-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white">
              ▶
            </span>
          )}
          {images.length > 1 && (
            <>
              {activeIndex > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                  aria-label="Arte anterior"
                  className={`absolute top-1/2 left-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-sm leading-none text-brand-ink shadow-sm transition-transform duration-150 ${PRESS_SCALE_CLASS}`}
                >
                  ‹
                </button>
              )}
              {activeIndex < images.length - 1 && (
                <button
                  type="button"
                  onClick={() => setActiveIndex((i) => Math.min(images.length - 1, i + 1))}
                  aria-label="Siguiente arte"
                  className={`absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-sm leading-none text-brand-ink shadow-sm transition-transform duration-150 ${PRESS_SCALE_CLASS}`}
                >
                  ›
                </button>
              )}
            </>
          )}
        </div>

        {images.length > 1 && (
          <div className="flex items-center justify-center gap-1 py-2">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveIndex(i)}
                aria-label={`Ver arte ${i + 1}`}
                className={`h-1.5 rounded-full transition-all duration-150 ${PRESS_SCALE_CLASS} ${
                  i === activeIndex ? "w-4 bg-brand-blue" : "w-1.5 bg-line-2"
                }`}
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 px-3 py-2 text-brand-ink">
          <HeartIcon />
          <CommentIcon />
          <SendIcon />
          <span className="flex-1" />
          <BookmarkIcon />
        </div>

        <div className="px-3 pb-4 text-sm leading-[1.4] whitespace-pre-line">
          <strong className="mr-1">{instagramHandle}</strong>
          {caption || <span className="text-tx-3 italic">Sin caption todavía.</span>}
        </div>
      </div>
    </div>
  );
}

function HeartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21 12 16l-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" />
    </svg>
  );
}
