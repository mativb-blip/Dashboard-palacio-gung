"use client";

import { useEffect, useState } from "react";
import { getExistingSubscription, subscribeToPush, unsubscribeFromPush } from "@/lib/dashboard/push-client";
import { iconButtonClass } from "@/lib/dashboard/ui";

/** Activar/desactivar Web Push en este navegador. No tiene sentido en
 * desktop sin service worker (Safari viejo, navegación privada, etc.) — ahí
 * simplemente no se muestra. */
export default function NotificationToggle() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setSupported(true);
    getExistingSubscription().then((sub) => setSubscribed(Boolean(sub)));
  }, []);

  if (!supported) return null;

  async function toggle() {
    setBusy(true);
    try {
      if (subscribed) {
        await unsubscribeFromPush();
        setSubscribed(false);
      } else {
        await subscribeToPush();
        setSubscribed(true);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo cambiar el estado de las notificaciones.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-label={subscribed ? "Desactivar notificaciones" : "Activar notificaciones"}
      title={subscribed ? "Desactivar notificaciones" : "Activar notificaciones"}
      className={`${iconButtonClass}${subscribed ? " border-brand-blue text-brand-blue" : ""}`}
    >
      <BellIcon filled={subscribed} className="relative" />
    </button>
  );
}

function BellIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
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
