import type { CSSProperties } from "react";
import type { ProposalFormat } from "@/types/dashboard";

interface FormatIconProps {
  format: ProposalFormat;
  className?: string;
  style?: CSSProperties;
}

/** Ícono por tipo de publicación (sustituto estilo Lucide, ver
 * Desing/README.md § Assets — no hay set de íconos de marca). */
export default function FormatIcon({ format, className, style }: FormatIconProps) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    style,
  };

  switch (format) {
    case "Carrusel":
      return (
        <svg {...common}>
          <path d="M18 22H4a2 2 0 0 1-2-2V6" />
          <path d="m22 13-1.296-1.296a2.41 2.41 0 0 0-3.408 0L11 18" />
          <circle cx="12" cy="8" r="2" />
          <rect x="6" y="2" width="16" height="16" rx="2" />
        </svg>
      );
    case "Reel":
      return (
        <svg {...common}>
          <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
          <rect x="2" y="6" width="14" height="12" rx="2" />
        </svg>
      );
    case "Historia":
      return (
        <svg {...common}>
          <path d="M10 2.5a10 10 0 0 1 4 0" />
          <path d="M2.5 10a10 10 0 0 1 0 4" />
          <path d="M14 21.5a10 10 0 0 1-4 0" />
          <path d="M21.5 14a10 10 0 0 1 0-4" />
        </svg>
      );
    case "Post simple":
    default:
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
      );
  }
}
