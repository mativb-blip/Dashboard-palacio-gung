"use client";

import { useEffect } from "react";
import { PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";

interface PhotoLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

/** Foto maximizada (≤80% del viewport) sobre fondo oscurecido y desenfocado — reutiliza modal-backdrop-in/modal-card-in de PostPreviewModal. */
export default function PhotoLightbox({ src, alt, onClose }: PhotoLightboxProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop-in fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className={`absolute top-5 right-5 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-2xl leading-none text-white transition-transform duration-150 ${PRESS_SCALE_CLASS}`}
      >
        ×
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- foto propia del contenido, tamaño dinámico según su relación de aspecto real */}
      <img src={src} alt={alt} className="modal-card-in max-h-[80vh] max-w-[80vw] rounded object-contain shadow-2xl" />
    </div>
  );
}
