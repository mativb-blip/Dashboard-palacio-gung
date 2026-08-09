"use client";

import { useBrand } from "@/lib/dashboard/BrandContext";
import { initials } from "@/lib/dashboard/format";

interface LogoProps {
  className?: string;
}

/** Wordmark genérico: iniciales de `brandName` + la barra de acento
 * roja/azul de siempre (colores vía variable CSS — ver layout.tsx, nunca
 * hardcodeados acá). Antes mostraba un texto de marca fijo. */
export default function Logo({ className }: LogoProps) {
  const { brandName } = useBrand();
  const mark = initials(brandName) || brandName.slice(0, 1).toUpperCase() || "?";

  return (
    <svg viewBox="0 0 40 24" className={className} role="img" aria-label={brandName}>
      <text
        x="0"
        y="17"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight={800}
        fontSize={18}
        letterSpacing={0.5}
        fill="#1A1A1A"
      >
        {mark}
      </text>
      <rect x="0" y="21" width="8" height="3" style={{ fill: "var(--color-brand-red)" }} />
      <rect x="8" y="21" width="32" height="3" style={{ fill: "var(--color-brand-blue)" }} />
    </svg>
  );
}
