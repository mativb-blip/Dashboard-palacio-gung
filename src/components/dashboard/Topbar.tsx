"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { handleLiquidPointerEnter, iconButtonClass, PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import NotificationToggle from "./NotificationToggle";
import SegmentedGroup, { type SegmentedItem } from "./SegmentedGroup";
import SignOutButton from "./SignOutButton";

/** Ancho bajo el cual se usa el menú de hamburguesa apilado (mobile real).
 * Entre esto y `desktop` (861px, ver globals.css) el ancho ya sobra para
 * botones sueltos pero no para las etiquetas de texto completas del row de
 * desktop — de ahí el tercer tramo "compacto" (solo íconos) en vez de mover
 * el breakpoint global, que también controla el layout de dos columnas del
 * resto del dashboard. */
const COMPACT_NAV_QUERY = "(min-width: 640px)";

/** "calendario" cuando el Topbar se muestra en /calendario — ahí Post/Grilla
 * navegan de vuelta al panel (`/?period=...`) en lugar de alternar in-place. */
type TopbarView = "month" | "grid" | "calendario";

interface TopbarProps {
  view: TopbarView;
  onPeriodChange?: (period: "month" | "grid") => void;
  planLabel: string;
}

/** Ítems de navegación grandes y livianos (Montserrat Light) en vez de
 * versalitas chicas — clonado de la referencia (clevante.cz), ver la
 * grabación del 2026-08-09. Activo: solo cambia de color, sin relleno —
 * la referencia no rellena sus links, mantiene esa misma sobriedad. */
const mobileNavClass =
  // text-left: "Post"/"Grilla" son <button> (onClick, no href) — un <button>
  // centra su texto por default del navegador; "Calendario" es <a> y por
  // eso no se notaba ahí. Sin esto quedan desalineados entre sí.
  `w-full rounded px-3 py-1.5 text-left font-thin text-[28px] leading-tight font-light transition-colors duration-[400ms] ${PRESS_SCALE_CLASS}`;

const mobileRowClass =
  `flex items-center gap-2.5 rounded px-3 py-2.5 text-sm font-bold text-tx-2 transition-colors duration-[400ms] hover:bg-panel-2 hover:text-brand-blue ${PRESS_SCALE_CLASS}`;

export default function Topbar({ view, onPeriodChange, planLabel }: TopbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Si la ventana crece a desktop con el menú de mobile abierto (resize,
  // rotar una tablet), cerrarlo — el botón de hamburguesa ya está oculto ahí
  // por CSS, pero el panel apilado se quedaría flotando sin forma de cerrarlo.
  useEffect(() => {
    if (!menuOpen) return;
    const mql = window.matchMedia(COMPACT_NAV_QUERY);
    const closeIfDesktop = () => {
      if (mql.matches) setMenuOpen(false);
    };
    mql.addEventListener("change", closeIfDesktop);
    return () => mql.removeEventListener("change", closeIfDesktop);
  }, [menuOpen]);

  // Misma fuente de datos para el SegmentedGroup de desktop y la lista
  // apilada de mobile — se calcula una sola vez, no se duplica la lógica de
  // ruteo (href vs. onClick) en dos lugares distintos.
  const items: SegmentedItem[] =
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
        ];

  return (
    <header className="relative flex shrink-0 items-center justify-between gap-3 px-4 py-3 desktop:px-8 desktop:py-4">
      <div className="min-w-0">
        <div className="text-[11px] tracking-label text-tx-3 uppercase">Plan de contenido</div>
        <div className="text-[15px] font-bold whitespace-nowrap">{planLabel}</div>
      </div>

      {/* Desktop: sin cambios — segmented group + divisor + menú de usuario. */}
      <div className="hidden items-center gap-3 desktop:flex">
        <SegmentedGroup items={items} />
        <div className="h-[26px] w-px shrink-0 bg-line" />
        <UserMenu />
      </div>

      {/* Tramo intermedio (640px–861px): ya sobra ancho para botones sueltos,
          pero no para las etiquetas de texto completas del row de desktop —
          misma fila, solo íconos en vez de pills con texto. */}
      <div className="hidden min-[640px]:flex desktop:hidden items-center gap-2">
        <CompactNav items={items} />
        <div className="h-[26px] w-px shrink-0 bg-line" />
        <UserMenu />
      </div>

      {/* Mobile real (<640px): un solo botón de hamburguesa reemplaza toda
          esa fila — antes se apretaba envolviendo (flex-wrap) en pantallas
          chicas. El ícono se transforma en X (mismo botón, sin cambiar de
          elemento). */}
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
        aria-expanded={menuOpen}
        aria-controls="topbar-mobile-menu"
        className={`${iconButtonClass} min-[640px]:hidden`}
      >
        <HamburgerIcon open={menuOpen} className="relative" />
      </button>

      {menuOpen && (
        <MobileMenu id="topbar-mobile-menu" items={items} onNavigate={() => setMenuOpen(false)} />
      )}
    </header>
  );
}

/** Panel apilado de mobile: mismos items de navegación que el SegmentedGroup
 * de desktop + todo lo que en desktop vive en UserMenu, uno debajo del otro.
 * Se revela con un "wipe" de arriba hacia abajo y el contenido aparece en
 * cascada — clonado de clevante.cz. Cerrar es instantáneo (sin reversa del
 * wipe), igual que en la referencia real. */
function MobileMenu({
  id,
  items,
  onNavigate,
}: {
  id: string;
  items: SegmentedItem[];
  onNavigate: () => void;
}) {
  const { data: session } = useSession();
  const user = session?.user;
  const label = user?.name || user?.email;
  const isAdmin = user?.role === "ADMIN";

  // Delay de cascada por índice fijo (no una variable mutable durante el
  // render) — el orden de los "slots" de abajo es siempre el mismo, admin o
  // no, así que alcanza con la posición literal de cada uno.
  const delayOf = (index: number) => `${index * 45}ms`;

  return (
    <div
      id={id}
      className="menu-wipe-in absolute inset-x-0 top-full z-40 flex flex-col gap-1 border-b border-line bg-[var(--bg)] p-4 shadow-lg min-[640px]:hidden"
    >
      {items.map((item, index) => {
        const className = `stagger-in ${mobileNavClass} ${item.active ? "text-brand-blue" : "text-brand-ink hover:bg-panel-2"}`;
        const style = { animationDelay: delayOf(index) };
        if (item.href) {
          return (
            <Link key={item.key} href={item.href} onClick={onNavigate} className={className} style={style}>
              {item.label}
            </Link>
          );
        }
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              item.onClick?.();
              onNavigate();
            }}
            className={className}
            style={style}
          >
            {item.label}
          </button>
        );
      })}

      {user && (
        <>
          <div className="stagger-in my-1.5 h-px bg-line" style={{ animationDelay: delayOf(items.length) }} />
          {label && (
            <div
              className="stagger-in truncate px-3 py-1 text-xs text-tx-3"
              style={{ animationDelay: delayOf(items.length + 1) }}
            >
              {label}
            </div>
          )}

          {isAdmin && (
            <Link
              href="/usuarios"
              onClick={onNavigate}
              className={`stagger-in ${mobileRowClass}`}
              style={{ animationDelay: delayOf(items.length + 2) }}
            >
              <PencilIcon className="h-4 w-4" />
              Editar usuarios
            </Link>
          )}

          <div
            className={`stagger-in ${mobileRowClass} justify-between hover:bg-transparent hover:text-tx-2`}
            style={{ animationDelay: delayOf(items.length + (isAdmin ? 3 : 2)) }}
          >
            <span className="flex items-center gap-2.5">
              <BellIcon className="h-4 w-4" />
              Notificaciones
            </span>
            <NotificationToggle />
          </div>

          <div className="stagger-in mt-1 px-3" style={{ animationDelay: delayOf(items.length + (isAdmin ? 4 : 3)) }}>
            <SignOutButton />
          </div>
        </>
      )}
    </div>
  );
}

/** Fila de navegación solo-ícono para el tramo 640–861px (ver
 * COMPACT_NAV_QUERY más arriba) — mismos `items` que el SegmentedGroup de
 * desktop, mismo estilo de botón que el resto de íconos del Topbar
 * (`iconButtonClass`), con el estado activo marcado en azul en vez de
 * texto. `title` cubre la etiqueta que en desktop da el texto del pill. */
function CompactNav({ items }: { items: SegmentedItem[] }) {
  return (
    <div className="flex items-center gap-2">
      {items.map((item) => {
        const className = `${iconButtonClass} ${item.active ? "border-brand-blue text-brand-blue" : ""}`;
        const icon = <NavIcon itemKey={item.key} className="relative" />;
        if (item.href) {
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-label={item.label}
              title={item.label}
              onPointerEnter={handleLiquidPointerEnter}
              className={className}
            >
              {icon}
            </Link>
          );
        }
        return (
          <button
            key={item.key}
            type="button"
            onClick={item.onClick}
            onPointerEnter={handleLiquidPointerEnter}
            aria-label={item.label}
            title={item.label}
            className={className}
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
}

function NavIcon({ itemKey, className }: { itemKey: string; className?: string }) {
  switch (itemKey) {
    case "calendario":
      return <CalendarIcon className={className} />;
    case "grid":
      return <GridIcon className={className} />;
    default:
      return <PostIcon className={className} />;
  }
}

function CalendarIcon({ className }: { className?: string }) {
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
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </svg>
  );
}

function PostIcon({ className }: { className?: string }) {
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
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

function GridIcon({ className }: { className?: string }) {
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
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
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

/** Hamburguesa que se transforma en X con el mismo botón (sin cambiar de
 * ícono): las barras 1 y 3 rotan 45°/-45° hasta el centro, la del medio se
 * desvanece. Solo transform/opacity — nunca top/left (ver Performance Rules
 * del proyecto). */
function HamburgerIcon({ open, className }: { open: boolean; className?: string }) {
  const bar = "absolute inset-x-0 h-[1.5px] rounded-full bg-current transition-transform duration-[400ms]";
  return (
    <span className={`block h-4 w-4 ${className ?? ""}`}>
      <span className={`${bar} top-[3px] ${open ? "translate-y-[4px] rotate-45" : ""}`} />
      <span
        className={`absolute inset-x-0 top-[7px] h-[1.5px] rounded-full bg-current transition-opacity duration-[250ms] ${
          open ? "opacity-0" : "opacity-100"
        }`}
      />
      <span className={`${bar} top-[11px] ${open ? "-translate-y-[4px] -rotate-45" : ""}`} />
    </span>
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

function BellIcon({ className }: { className?: string }) {
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
      <path d="M18 8a6 6 0 1 0-12 0c0 3.5-1 5.5-2 7h16c-1-1.5-2-3.5-2-7Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}
