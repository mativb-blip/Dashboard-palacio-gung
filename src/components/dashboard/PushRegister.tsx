"use client";

import { useEffect } from "react";

/** Registra el service worker apenas carga la app — sin pedir permiso de
 * notificaciones todavía (eso lo hace NotificationToggle, a demanda). Sin
 * esto registrado, iOS ni siquiera deja instalar la PWA a Inicio. */
export default function PushRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((e) => {
        console.error("[push] no se pudo registrar el service worker:", e);
      });
    }
  }, []);

  return null;
}
