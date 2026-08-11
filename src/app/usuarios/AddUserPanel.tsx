"use client";

import Link from "next/link";
import { useState } from "react";
import SignOutButton from "@/components/dashboard/SignOutButton";
import { handleLiquidPointerEnter, iconButtonClass, PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import { createUser } from "./actions";

interface RoleOption {
  value: string;
  label: string;
}

interface AddUserPanelProps {
  email: string;
  roleOptions: RoleOption[];
}

/** Cabecera de /usuarios + formulario "Cargar usuario" colapsable — el ícono
 * de "+" (junto a Salir, ambos solo-ícono) lo abre/cierra. La ruta ya
 * requiere sesión de Administrador (ver page.tsx), así que no hace falta
 * repetir ese chequeo acá. */
export default function AddUserPanel({ email, roleOptions }: AddUserPanelProps) {
  const [open, setOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Por default el mail de notificación es el mismo que el de acceso (caso
  // común) pero queda editable — si la persona ya lo tocó a mano, no lo
  // pisamos al seguir escribiendo el email de acceso.
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyEmailTouched, setNotifyEmailTouched] = useState(false);

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href="/"
            className={`inline-block text-xs font-bold text-brand-blue transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
          >
            ‹ Volver al panel
          </Link>
          <div className="mt-3 text-[11px] tracking-label text-tx-3 uppercase">Plan de contenido</div>
          <h1 className="text-2xl font-bold">Usuarios</h1>
          <p className="mt-1 text-sm text-tx-2">
            Sesión: <span className="font-bold">{email}</span> · Administrador
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            onPointerEnter={handleLiquidPointerEnter}
            aria-label={open ? "Cerrar formulario de nuevo usuario" : "Agregar usuario"}
            aria-pressed={open}
            title="Agregar usuario"
            className={`${iconButtonClass}${open ? " border-brand-blue bg-brand-blue/[0.06] text-brand-blue" : ""}`}
          >
            <UserPlusIcon className="relative" />
          </button>
          <SignOutButton iconOnly />
        </div>
      </div>

      {open && (
        <div className="rounded border border-line-2 p-4">
          <div className="mb-3 text-[11px] tracking-label text-tx-3 uppercase">Cargar usuario</div>
          <form action={createUser} className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 desktop:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] tracking-label text-tx-3 uppercase">Email de acceso</span>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="email@empresa.com"
                  onChange={(e) => {
                    if (!notifyEmailTouched) setNotifyEmail(e.target.value);
                  }}
                  className="w-full rounded border border-line-2 bg-panel-2 px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] tracking-label text-tx-3 uppercase">Nombre</span>
                <input
                  type="text"
                  name="name"
                  placeholder="Nombre (opcional)"
                  className="w-full rounded border border-line-2 bg-panel-2 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] tracking-label text-tx-3 uppercase">Mail de notificación</span>
              <input
                type="email"
                name="notifyEmail"
                required
                value={notifyEmail}
                onChange={(e) => {
                  setNotifyEmail(e.target.value);
                  setNotifyEmailTouched(true);
                }}
                placeholder="A dónde le llegan los avisos de comentarios/aprobaciones"
                className="w-full rounded border border-line-2 bg-panel-2 px-3 py-2 text-sm"
              />
            </label>
            <div className="grid grid-cols-1 gap-3 desktop:grid-cols-[1fr_1fr_auto]">
              <select name="role" defaultValue="COMMENTER" className="w-full rounded border border-line-2 bg-panel-2 px-3 py-2 text-sm">
                {roleOptions.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="Contraseña (opcional)"
                  minLength={8}
                  className="w-full rounded border border-line-2 bg-panel-2 py-2 pr-9 pl-3 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 text-tx-3 hover:text-brand-ink"
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              <button
                type="submit"
                className={`min-h-9 rounded bg-brand-ink px-4 text-xs font-bold whitespace-nowrap text-[var(--bg)] transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
              >
                + Agregar
              </button>
            </div>
            <p className="text-[11px] text-tx-3">
              La contraseña se puede dejar vacía y cargarla más tarde — sin ella, esta persona
              todavía no va a poder iniciar sesión.
            </p>
          </form>
        </div>
      )}
    </>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a17.4 17.4 0 0 1-3.06 4.14M6.61 6.61C3.9 8.3 2 12 2 12a17.4 17.4 0 0 0 5.06 5.94A9.12 9.12 0 0 0 12 20c1.5 0 2.9-.32 4.14-.9" />
      <path d="M9.53 9.53a3 3 0 0 0 4.24 4.24" />
      <path d="M1 1l22 22" />
    </svg>
  );
}

function UserPlusIcon({ className }: { className?: string }) {
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
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  );
}
