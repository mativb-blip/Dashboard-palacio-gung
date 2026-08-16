"use client";

import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { useBrand } from "@/lib/dashboard/BrandContext";
import { PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import { updateLoginAppearance } from "./actions";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const DEFAULT_REDIRECT = "/calendario";
// Logo de esta deployment (Palacio Gung) — se usa mientras un Admin no suba
// otro desde "Personalizar"; ese logo subido (logoUrl, dato de SiteSettings)
// sigue teniendo prioridad.
const DEFAULT_LOGO_URL = "/login-logo.png";

interface LoginFormProps {
  isAdmin: boolean;
  backgroundUrl: string | null;
  logoUrl: string | null;
  callbackUrl?: string;
}

// callbackUrl viene de la URL (Auth.js lo agrega al redirigir a /login desde
// src/proxy.ts) como una URL absoluta (request.nextUrl.href). Se descarta el
// host a propósito y solo se usa path+query+hash: así un callbackUrl
// manipulado ("https://evil.com/...") no puede mandar a otro origen.
function safeRedirectTarget(callbackUrl: string | undefined): string {
  if (!callbackUrl) return DEFAULT_REDIRECT;
  try {
    const url = new URL(callbackUrl, "http://internal.invalid");
    const target = `${url.pathname}${url.search}${url.hash}`;
    return target.startsWith("/") ? target : DEFAULT_REDIRECT;
  } catch {
    return DEFAULT_REDIRECT;
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function LoginForm({ isAdmin, backgroundUrl, logoUrl, callbackUrl }: LoginFormProps) {
  const router = useRouter();
  const { brandName } = useBrand();
  const redirectTarget = safeRedirectTarget(callbackUrl);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [panelOpen, setPanelOpen] = useState(false);
  const [appearanceError, setAppearanceError] = useState("");
  const [pending, startTransition] = useTransition();

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await signIn("credentials", {
      email: email.trim(),
      password,
      redirect: false,
    });
    if (result?.error) {
      setLoading(false);
      setError("Email o contraseña incorrectos.");
      return;
    }

    // La contraseña era correcta, pero eso no garantiza que la cookie de
    // sesión haya quedado guardada: si el navegador bloquea cookies, navegar
    // a la app solo rebota de vuelta acá, una y otra vez, sin decir por qué
    // (pasó en un iPad). Se confirma antes de irse, y si no está se explica.
    const session = await getSession();
    setLoading(false);
    if (!session) {
      setError(
        "Tu usuario y contraseña son correctos, pero el navegador no guardó la sesión. Si estás en iPhone o iPad: Ajustes → Safari → desactivá «Bloquear todas las cookies», y volvé a probar. En modo de navegación privada tampoco se guarda.",
      );
      return;
    }

    window.location.href = redirectTarget;
  }

  async function handleAppearanceFile(e: ChangeEvent<HTMLInputElement>, field: "background" | "logo") {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setAppearanceError("La imagen no puede pesar más de 2MB.");
      return;
    }
    setAppearanceError("");
    const dataUrl = await fileToDataUrl(file);
    startTransition(async () => {
      try {
        await updateLoginAppearance(
          field === "background" ? { backgroundDataUrl: dataUrl } : { logoDataUrl: dataUrl },
        );
        router.refresh();
      } catch (err) {
        setAppearanceError(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    });
  }

  function handleAppearanceReset(field: "background" | "logo") {
    setAppearanceError("");
    startTransition(async () => {
      try {
        await updateLoginAppearance(field === "background" ? { backgroundDataUrl: null } : { logoDataUrl: null });
        router.refresh();
      } catch (err) {
        setAppearanceError(err instanceof Error ? err.message : "No se pudo restablecer.");
      }
    });
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--bg)] px-4 py-8 font-sans">
      {/* Fondo con degradé + acentos de marca (o imagen subida por un Admin) —
          excepción deliberada al "fondo siempre blanco" del design system,
          acotada solo a esta pantalla. */}
      {backgroundUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen subida por un Administrador, servida como data URL */}
          <img src={backgroundUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-0 bg-black/45" />
        </>
      ) : (
        <>
          {/* Antes: gradiente + un blob azul y uno rojo compitiendo por atención.
              Ahora: humo neutro (blancos muy tenues) + un solo acento azul de
              marca, más grano — deja el azul como único acento, sin rojo. */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--color-brand-blue)_0%,_var(--bg)_55%,_var(--bg)_100%)] opacity-70" />
          <div className="pointer-events-none absolute -top-[10%] -left-[8%] h-[55%] w-[55%] rounded-full bg-white/[0.05] blur-[100px]" />
          <div className="pointer-events-none absolute -right-[10%] -bottom-[15%] h-[60%] w-[60%] rounded-full bg-brand-blue/25 blur-[100px]" />
          <div className="pointer-events-none absolute top-[35%] right-[5%] h-[38%] w-[38%] rounded-full bg-white/[0.04] blur-[100px]" />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-overlay"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
            }}
          />
        </>
      )}

      {isAdmin && (
        <div className="absolute top-4 right-4 z-10 text-left">
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            className={`flex items-center gap-1.5 rounded-full border border-white/15 bg-transparent px-3 py-1.5 text-[10px] font-semibold tracking-label text-white/75 uppercase transition-colors duration-[400ms] hover:border-white/40 hover:text-white ${PRESS_SCALE_CLASS}`}
          >
            <GearIcon />
            Personalizar
          </button>

          {panelOpen && (
            <div className="art-fade-in absolute top-full right-0 mt-2 w-72 rounded-xl border border-white/15 bg-[var(--bg)]/95 p-4 shadow-2xl backdrop-blur-xl">
              <div className="mb-3 text-xs font-bold tracking-label text-white/70 uppercase">
                Apariencia del login
              </div>

              <div className="mb-3 flex flex-col gap-1.5">
                <span className="text-xs text-white/60">Fondo</span>
                <div className="flex items-center gap-2">
                  <label
                    className={`flex-1 cursor-pointer rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-center text-xs font-bold text-white transition-colors duration-[400ms] hover:bg-white/10 ${PRESS_SCALE_CLASS}`}
                  >
                    Subir imagen
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleAppearanceFile(e, "background")}
                    />
                  </label>
                  {backgroundUrl && (
                    <button
                      type="button"
                      onClick={() => handleAppearanceReset("background")}
                      className={`rounded-lg border border-white/20 px-2.5 py-2 text-xs text-white/60 transition-colors duration-[400ms] hover:text-white ${PRESS_SCALE_CLASS}`}
                    >
                      Quitar
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-white/60">Logo superior</span>
                <div className="flex items-center gap-2">
                  <label
                    className={`flex-1 cursor-pointer rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-center text-xs font-bold text-white transition-colors duration-[400ms] hover:bg-white/10 ${PRESS_SCALE_CLASS}`}
                  >
                    Subir imagen
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleAppearanceFile(e, "logo")}
                    />
                  </label>
                  {logoUrl && (
                    <button
                      type="button"
                      onClick={() => handleAppearanceReset("logo")}
                      className={`rounded-lg border border-white/20 px-2.5 py-2 text-xs text-white/60 transition-colors duration-[400ms] hover:text-white ${PRESS_SCALE_CLASS}`}
                    >
                      Quitar
                    </button>
                  )}
                </div>
              </div>

              {appearanceError && <p className="mt-3 text-xs text-red-300">{appearanceError}</p>}
              {pending && <p className="mt-3 text-xs text-white/40">Guardando…</p>}
            </div>
          )}
        </div>
      )}

      <div className="art-fade-in relative w-full max-w-sm rounded-2xl border border-white/15 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- logoUrl puede ser una data URL subida por un Administrador */}
          <img
            src={logoUrl ?? DEFAULT_LOGO_URL}
            alt={brandName}
            className="mb-4 h-14 w-14 rounded-full object-cover"
          />
          <div className="mb-3 flex w-full items-center gap-2.5">
            <span className="h-px flex-1 bg-white/15" />
            <span className="text-[10px] font-semibold tracking-label text-[var(--color-login-accent)] uppercase">
              Acceso
            </span>
            <span className="h-px flex-1 bg-white/15" />
          </div>
          <h1 className="font-thin text-[32px] leading-[1.15] font-light text-balance text-white">
            Bienvenido de nuevo
          </h1>
          <p className="mt-2 text-sm text-white/55">
            Iniciá sesión para revisar y aprobar el contenido de {brandName}
          </p>
        </div>

        <div className="mt-6 h-px w-full bg-white/10" />

        <form onSubmit={handleLogin} className="mt-6 flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs text-white/70">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@empresa.com"
              className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/40 transition-colors duration-[400ms] outline-none focus:border-white/50"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs text-white/70">Contraseña</span>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 pr-11 text-sm text-white placeholder-white/40 transition-colors duration-[400ms] outline-none focus:border-white/50"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                className={`absolute top-1/2 right-3 -translate-y-1/2 text-white/50 transition-colors duration-[400ms] hover:text-white/80 ${PRESS_SCALE_CLASS}`}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </label>

          {error && <p className="text-sm text-red-300">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className={`mt-2 min-h-12 rounded-full bg-white text-sm font-bold text-[var(--bg)] transition-[transform,opacity] duration-[400ms] disabled:cursor-default disabled:opacity-60 ${PRESS_SCALE_CLASS}`}
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs leading-[1.5] text-white/40">
          Solo funciona si un Administrador te cargó una contraseña en Usuarios.
        </p>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a17.4 17.4 0 0 1-3.06 4.14M6.61 6.61C3.9 8.3 2 12 2 12a17.4 17.4 0 0 0 5.06 5.94A9.12 9.12 0 0 0 12 20c1.5 0 2.9-.32 4.14-.9" />
      <path d="M9.53 9.53a3 3 0 0 0 4.24 4.24" />
      <path d="M1 1l22 22" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}
