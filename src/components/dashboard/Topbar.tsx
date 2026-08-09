"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { handleLiquidPointerEnter, iconButtonClass } from "@/lib/dashboard/ui";
import Logo from "./Logo";
import NotificationToggle from "./NotificationToggle";
import SegmentedGroup from "./SegmentedGroup";
import SignOutButton from "./SignOutButton";

/** "calendario" cuando el Topbar se muestra en /calendario — ahí Post/Grilla
 * navegan de vuelta al panel (`/?period=...`) en lugar de alternar in-place. */
type TopbarView = "month" | "grid" | "calendario";

interface TopbarProps {
  view: TopbarView;
  onPeriodChange?: (period: "month" | "grid") => void;
  planLabel: string;
}

export default function Topbar({ view, onPeriodChange, planLabel }: TopbarProps) {
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-3 desktop:flex-nowrap desktop:px-8 desktop:py-4">
      <div className="flex min-w-0 items-center gap-3.5">
        <Logo className="h-6 w-auto shrink-0" />
        <div className="hidden h-[26px] w-px shrink-0 bg-line desktop:block" />
        <div className="min-w-0">
          <div className="text-[11px] tracking-[0.16em] text-tx-3 uppercase">
            Plan de contenido
          </div>
          <div className="text-[15px] font-bold whitespace-nowrap">{planLabel}</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <SegmentedGroup
          items={
            view === "calendario"
              ? [
                  { key: "calendario", label: "Calendario", active: true },
                  { key: "month", label: "Post", active: false, href: "/?period=month" },
                  { key: "grid", label: "Grilla", active: false, href: "/?period=grid" },
                ]
              : [
                  { key: "calendario", label: "Calendario", active: false, href: "/calendario" },
                  { key: "month", label: "Post", active: view === "month", onClick: () => onPeriodChange?.("month") },
                  { key: "grid", label: "Grilla", active: view === "grid", onClick: () => onPeriodChange?.("grid") },
                ]
          }
        />
        <div className="hidden h-[26px] w-px shrink-0 bg-line desktop:block" />
        <UserMenu />
      </div>
    </header>
  );
}

function UserMenu() {
  const { data: session } = useSession();
  if (!session?.user) return null;

  const label = session.user.name || session.user.email || "Usuario";
  const isAdmin = session.user.role === "ADMIN";

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className="hidden max-w-[140px] truncate text-xs text-tx-3 desktop:inline"
        title={label}
      >
        {label}
      </span>
      {isAdmin && (
        <Link
          href="/usuarios"
          aria-label="Editar usuarios"
          title="Editar usuarios"
          onPointerEnter={handleLiquidPointerEnter}
          className={iconButtonClass}
        >
          <PencilIcon className="relative" />
        </Link>
      )}
      <NotificationToggle />
      <SignOutButton iconOnly />
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
