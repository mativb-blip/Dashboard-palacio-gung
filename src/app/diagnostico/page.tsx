"use client";

import { useEffect, useState } from "react";

// Página de diagnóstico para el caso "inicio sesión y me rebota al login".
// Ese síntoma casi siempre significa que el navegador no está guardando la
// cookie de sesión, pero desde la app no se distingue de "no hay sesión": las
// dos cosas se ven igual. Acá se prueba cada eslabón por separado y se dice
// cuál falla, en un formato que se pueda leer (o fotografiar) desde el
// teléfono.
//
// Ruta abierta a propósito (ver el callback `authorized` en lib/auth.ts):
// tiene que servir justamente cuando no se puede iniciar sesión.

interface Check {
  label: string;
  ok: boolean | null;
  detail: string;
}

const TEST_COOKIE = "diag-cookie-test";

export default function DiagnosticoPage() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [raw, setRaw] = useState("");

  useEffect(() => {
    async function run() {
      const results: Check[] = [];

      results.push({
        label: "El navegador dice que acepta cookies",
        ok: navigator.cookieEnabled,
        detail: navigator.cookieEnabled
          ? "navigator.cookieEnabled = true"
          : "navigator.cookieEnabled = false — están bloqueadas en los ajustes del navegador.",
      });

      // Prueba real: escribir una cookie y ver si sobrevive. El navegador
      // puede decir que las acepta y bloquearlas igual.
      document.cookie = `${TEST_COOKIE}=1; path=/; SameSite=Lax`;
      const written = document.cookie.includes(TEST_COOKIE);
      results.push({
        label: "Puede guardar una cookie de prueba",
        ok: written,
        detail: written
          ? "Se escribió y se volvió a leer sin problema."
          : "Se escribió y desapareció: el navegador las está descartando. En iPhone/iPad: Ajustes → Safari → «Bloquear todas las cookies» debe estar DESACTIVADO.",
      });
      document.cookie = `${TEST_COOKIE}=; path=/; Max-Age=0`;

      let serverTime: string | null = null;
      try {
        const res = await fetch("/api/diagnostico", { cache: "no-store" });
        const data = await res.json();
        serverTime = data.horaDelServidor;
        setRaw(JSON.stringify(data, null, 2));
        results.push({
          label: "El servidor recibe tu cookie de sesión",
          ok: data.llegoCookieDeSesion,
          detail: data.llegoCookieDeSesion
            ? `Sí: ${data.cookiesDeSesion.join(", ")}`
            : `No llegó ninguna cookie de sesión. El servidor vio ${data.totalDeCookies} cookie(s) en total.`,
        });
      } catch (e) {
        results.push({
          label: "El servidor recibe tu cookie de sesión",
          ok: false,
          detail: `No se pudo consultar: ${e instanceof Error ? e.message : "error de red"}`,
        });
      }

      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        const session = await res.json();
        const logged = Boolean(session?.user);
        results.push({
          label: "Hay una sesión iniciada",
          ok: logged,
          detail: logged ? `Sesión de ${session.user.email}` : "Sin sesión (todavía no iniciaste, o no se guardó).",
        });
      } catch {
        results.push({ label: "Hay una sesión iniciada", ok: false, detail: "No se pudo consultar." });
      }

      // Un reloj corrido invalida el token apenas se emite, con el mismo
      // síntoma de rebote.
      if (serverTime) {
        const skewSeconds = Math.round(Math.abs(Date.now() - new Date(serverTime).getTime()) / 1000);
        results.push({
          label: "El reloj del dispositivo está en hora",
          ok: skewSeconds < 120,
          detail:
            skewSeconds < 120
              ? `Diferencia con el servidor: ${skewSeconds} s.`
              : `Diferencia de ${skewSeconds} s con el servidor. Activá Ajustes → General → Fecha y hora → Automáticamente.`,
        });
      }

      results.push({
        label: "Dirección que estás usando",
        ok: null,
        detail: `${window.location.origin} · ${window.location.protocol}`,
      });

      results.push({ label: "Navegador", ok: null, detail: navigator.userAgent });

      setChecks(results);
    }

    void run();
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 bg-[var(--bg)] px-4 py-8 font-sans text-brand-ink">
      <div>
        <h1 className="text-lg font-bold">Diagnóstico de acceso</h1>
        <p className="mt-1 text-xs leading-relaxed text-tx-3">
          Si al iniciar sesión volvés siempre a la pantalla de login, esta página dice en qué paso se
          corta.
        </p>
      </div>

      {checks.length === 0 && <p className="text-sm text-tx-3">Ejecutando comprobaciones…</p>}

      <ul className="flex flex-col gap-2">
        {checks.map((check) => (
          <li key={check.label} className="rounded border border-line-2 bg-panel-2 p-3">
            <div className="flex items-start gap-2">
              <span
                aria-hidden
                className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                  check.ok === null ? "bg-tx-3" : check.ok ? "bg-emerald-500" : "bg-brand-red"
                }`}
              />
              <div className="min-w-0">
                <p className="text-sm font-bold">{check.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed break-words text-tx-2">{check.detail}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {raw && (
        <details className="rounded border border-line-2 bg-panel-2 p-3">
          <summary className="cursor-pointer text-xs font-bold text-tx-2">Detalle técnico</summary>
          <pre className="mt-2 overflow-x-auto text-[10px] leading-relaxed text-tx-3">{raw}</pre>
        </details>
      )}
    </main>
  );
}
