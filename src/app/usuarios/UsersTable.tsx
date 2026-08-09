"use client";

import { useState, useTransition } from "react";
import { PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import type { User } from "@/generated/prisma/client";
import { deleteUser, setUserPassword, updateUserRole } from "./actions";

interface RoleOption {
  value: string;
  label: string;
}

interface UsersTableProps {
  users: User[];
  currentUserId: string;
  roleOptions: RoleOption[];
}

export default function UsersTable({ users, currentUserId, roleOptions }: UsersTableProps) {
  return (
    <div className="overflow-hidden rounded border border-line-2">
      <div className="grid grid-cols-[1.5fr_1fr_1fr_auto] gap-2 border-b border-line-2 bg-panel-2 px-4 py-2 text-[11px] font-bold tracking-[0.1em] text-tx-3 uppercase">
        <span>Email</span>
        <span>Nombre</span>
        <span>Rol</span>
        <span />
      </div>
      {users.map((user) => (
        <UserRow
          key={user.id}
          user={user}
          isSelf={user.id === currentUserId}
          roleOptions={roleOptions}
        />
      ))}
    </div>
  );
}

function UserRow({
  user,
  isSelf,
  roleOptions,
}: {
  user: User;
  isSelf: boolean;
  roleOptions: RoleOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  function handleRoleChange(role: string) {
    setError("");
    startTransition(async () => {
      try {
        await updateUserRole(user.id, role);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo cambiar el rol.");
      }
    });
  }

  function handleDelete() {
    setError("");
    startTransition(async () => {
      try {
        await deleteUser(user.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo eliminar.");
      }
    });
  }

  function handleSavePassword() {
    setError("");
    startTransition(async () => {
      try {
        await setUserPassword(user.id, password);
        setPassword("");
        setChangingPassword(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar la contraseña.");
      }
    });
  }

  return (
    <div className="border-b border-line px-4 py-2.5 last:border-b-0">
      <div className="grid grid-cols-[1.5fr_1fr_1fr_auto] items-center gap-2 text-sm">
        <span className="truncate">{user.email}</span>
        <span className="truncate text-tx-2">{user.name || "—"}</span>
        <select
          value={user.role}
          disabled={pending}
          onChange={(e) => handleRoleChange(e.target.value)}
          className="w-full rounded border border-line-2 bg-white px-2 py-1 text-xs disabled:opacity-60"
        >
          {roleOptions.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending || isSelf}
          title={isSelf ? "No podés eliminar tu propio usuario" : "Eliminar usuario"}
          className={`min-h-8 rounded border border-line-2 px-3 text-xs font-bold text-brand-red transition-transform duration-150 disabled:cursor-default disabled:text-line-2 ${PRESS_SCALE_CLASS}`}
        >
          Eliminar
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-tx-3">
        <span>{user.password ? "Contraseña: configurada" : "Contraseña: sin configurar"}</span>
        {changingPassword ? (
          <>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nueva contraseña (mín. 8)"
                minLength={8}
                className="rounded border border-line-2 bg-white py-1 pr-7 pl-2 text-xs"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                className="absolute top-1/2 right-1.5 -translate-y-1/2 text-tx-3 hover:text-brand-ink"
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            <button
              type="button"
              onClick={handleSavePassword}
              disabled={pending || password.length < 8}
              className={`rounded border border-brand-blue px-2 py-1 text-xs font-bold text-brand-blue disabled:cursor-default disabled:opacity-60 ${PRESS_SCALE_CLASS}`}
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => {
                setChangingPassword(false);
                setPassword("");
                setShowPassword(false);
              }}
              className={`rounded border border-line-2 px-2 py-1 text-xs font-bold text-brand-ink ${PRESS_SCALE_CLASS}`}
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setChangingPassword(true)}
            className={`font-bold text-brand-blue underline-offset-2 hover:underline ${PRESS_SCALE_CLASS}`}
          >
            {user.password ? "Cambiar" : "Configurar"}
          </button>
        )}
      </div>

      {error && <p className="mt-1 text-xs text-brand-red">{error}</p>}
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a17.4 17.4 0 0 1-3.06 4.14M6.61 6.61C3.9 8.3 2 12 2 12a17.4 17.4 0 0 0 5.06 5.94A9.12 9.12 0 0 0 12 20c1.5 0 2.9-.32 4.14-.9" />
      <path d="M9.53 9.53a3 3 0 0 0 4.24 4.24" />
      <path d="M1 1l22 22" />
    </svg>
  );
}
