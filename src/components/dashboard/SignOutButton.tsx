"use client";

import { signOut } from "next-auth/react";
import { handleLiquidPointerEnter, iconButtonClass, PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";

interface SignOutButtonProps {
  /** Solo el ícono, sin el texto "Salir" — misma lógica/estilo, para
   * cabeceras donde ya se agrupa con otros botones de solo ícono. */
  iconOnly?: boolean;
}

export default function SignOutButton({ iconOnly = false }: SignOutButtonProps) {
  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/login" })}
        onPointerEnter={handleLiquidPointerEnter}
        aria-label="Salir"
        title="Salir"
        className={iconButtonClass}
      >
        <LogOutIcon className="relative" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className={`rounded border border-line-2 px-2.5 py-1.5 text-xs font-bold whitespace-nowrap text-tx-2 transition-[border-color,color,transform] duration-150 hover:border-brand-blue hover:text-brand-blue ${PRESS_SCALE_CLASS}`}
    >
      Salir
    </button>
  );
}

function LogOutIcon({ className }: { className?: string }) {
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
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
