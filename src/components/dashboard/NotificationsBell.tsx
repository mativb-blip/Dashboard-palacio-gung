"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/dashboard/notifications-actions";
import { iconButtonClass, PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import type { NotificationItem, NotificationKind, NotificationsSnapshot } from "@/types/dashboard";
import NotificationToggle from "./NotificationToggle";

/** Cada cuánto vuelve a preguntar. No hay websocket ni push a la pestaña
 * abierta, así que la campana pregunta sola — un minuto es suficiente para
 * algo que se mira de reojo, y no vale la pena algo más caro. Con la pestaña
 * oculta no pregunta: ver refrescar(). */
const INTERVALO_MS = 60_000;

const VACIO: NotificationsSnapshot = { items: [], unread: 0 };

// ─── Estado compartido ──────────────────────────────────────────────────────
//
// El Topbar monta ESTA campana tres veces —una por tramo de ancho: desktop,
// compacta y mobile—, y CSS esconde dos. Con el estado adentro del
// componente eso serían tres sondeos en paralelo pidiendo lo mismo, y tres
// verdades distintas: marcar leído en una dejaba a las otras dos mostrando
// el número viejo hasta su propio tick. Se nota apenas cambia el ancho de la
// ventana, que es cuando aparece otra de las tres.
//
// Un store afuera de React lo resuelve de raíz: una sola consulta, un solo
// número, y las tres instancias leyendo lo mismo. El intervalo arranca con
// el primer suscriptor y se apaga con el último, así no queda un timer vivo
// en una pantalla sin Topbar.
let estado: NotificationsSnapshot = VACIO;
const oyentes = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function publicar(proximo: NotificationsSnapshot) {
  estado = proximo;
  for (const avisar of oyentes) avisar();
}

/** Consulta en curso, para que varias llamadas del mismo tick compartan UNA. */
let enVuelo: Promise<void> | null = null;
/** Cuándo terminó la última, para no repetirla enseguida. */
let ultimaConsulta = 0;

/** Piso entre dos consultas seguidas. Existe por algo medido, no por
 * prolijidad: al cargar una pantalla `refrescar()` se llamaba NUEVE veces.
 * Las tres instancias de la campana montan y desmontan sus suscripciones
 * (React lo hace dos veces en desarrollo), volver a la pestaña dispara
 * `focus` y `visibilitychange` casi juntos, y el intervalo puede caer en el
 * medio. Coalescer la consulta en vuelo tapaba solo las del mismo tick;
 * esto tapa el resto. */
const MINIMO_ENTRE_CONSULTAS_MS = 5_000;

/**
 * Cadena de promesas y no `async/await`: el resultado tiene que llegar como
 * una actualización aparte, no sincrónica con quien la disparó.
 *
 * `forzar` es para las acciones deliberadas —abrir el panel— que no pueden
 * quedar mostrando lo del tick anterior por respetar un piso pensado para
 * las automáticas.
 */
function refrescar(forzar = false): Promise<void> {
  // Con la pestaña en segundo plano no tiene sentido preguntar: nadie está
  // mirando el número, y al volver el listener de visibilidad refresca.
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return Promise.resolve();
  if (enVuelo) return enVuelo;
  if (!forzar && Date.now() - ultimaConsulta < MINIMO_ENTRE_CONSULTAS_MS) return Promise.resolve();

  enVuelo = getNotifications()
    .then(publicar, () => {
      // Sesión vencida, red caída: la campana se queda con lo último que
      // supo. Un error acá no tiene a quién avisarle ni qué arreglar.
    })
    .finally(() => {
      enVuelo = null;
      ultimaConsulta = Date.now();
    });
  return enVuelo;
}

/** Los listeners toman la función pelada: un handler recibe el Event como
 * primer argumento, y sin este envoltorio ese Event entraría como `forzar`. */
const refrescarPorEvento = () => void refrescar();

function suscribir(alCambiar: () => void): () => void {
  oyentes.add(alCambiar);
  if (oyentes.size === 1) {
    timer = setInterval(refrescarPorEvento, INTERVALO_MS);
    window.addEventListener("focus", refrescarPorEvento);
    document.addEventListener("visibilitychange", refrescarPorEvento);
    void refrescar();
  }
  return () => {
    oyentes.delete(alCambiar);
    if (oyentes.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
      window.removeEventListener("focus", refrescarPorEvento);
      document.removeEventListener("visibilitychange", refrescarPorEvento);
    }
  };
}

const leer = () => estado;
/** En el server no hay avisos que mostrar todavía; la primera consulta sale
 * al hidratar. Tiene que ser una referencia estable o React re-renderiza sin
 * parar. */
const leerEnElServer = () => VACIO;

export default function NotificationsBell() {
  const { status } = useSession();
  const router = useRouter();
  const snapshot = useSyncExternalStore(suscribir, leer, leerEnElServer);
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  // Cerrar con Escape y con un click afuera — mismo criterio que el resto de
  // las capas del dashboard (ver el visor de la Galería). Los listeners se
  // montan solo mientras el panel está abierto.
  useEffect(() => {
    if (!abierto) return;
    function alPresionarTecla(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    function alClickear(e: MouseEvent) {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    }
    window.addEventListener("keydown", alPresionarTecla);
    document.addEventListener("mousedown", alClickear);
    return () => {
      window.removeEventListener("keydown", alPresionarTecla);
      document.removeEventListener("mousedown", alClickear);
    };
  }, [abierto]);

  if (status !== "authenticated") return null;

  function abrir() {
    const proximo = !abierto;
    setAbierto(proximo);
    // Al abrir se refresca sí o sí: es un pedido explícito de mirar, no una
    // consulta de fondo, y no puede quedar atado al piso de más arriba.
    if (proximo) void refrescar(true);
  }

  function marcarTodo() {
    // Optimista: el panel está abierto y el usuario acaba de apretar; esperar
    // el round-trip para que se apaguen los puntos se siente roto.
    publicar({ items: estado.items.map((i) => ({ ...i, read: true })), unread: 0 });
    markAllNotificationsRead().then(publicar, () => void refrescar());
  }

  function abrirAviso(item: NotificationItem) {
    setAbierto(false);
    if (!item.read) {
      publicar({
        items: estado.items.map((i) => (i.id === item.id ? { ...i, read: true } : i)),
        unread: Math.max(0, estado.unread - 1),
      });
      markNotificationRead(item.id).then(publicar, () => void refrescar());
    }
    if (item.url) router.push(item.url);
  }

  const { items, unread } = snapshot;

  return (
    <div ref={contenedor} className="relative">
      <button
        type="button"
        onClick={abrir}
        aria-expanded={abierto}
        aria-label={unread > 0 ? `Avisos (${unread} sin leer)` : "Avisos"}
        title={unread > 0 ? `${unread} sin leer` : "Avisos"}
        className={`${iconButtonClass}${abierto || unread > 0 ? " border-brand-blue text-brand-blue" : ""}`}
      >
        <BellIcon className="relative" />
      </button>

      {/* El contador es hermano del botón, no hijo: `iconButtonClass` lleva
          overflow-hidden (lo necesita el relleno líquido del hover) y adentro
          quedaría recortado justo en la esquina donde va. `9+` a partir de
          diez — ahí lo que importa ya es "muchos", y tres dígitos no entran.
          pointer-events-none para que tapar el borde del botón no le robe el
          click. */}
      {unread > 0 && (
        <span className="pointer-events-none absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-red px-1 text-[10px] leading-none font-bold text-white tabular-nums">
          {unread > 9 ? "9+" : unread}
        </span>
      )}

      {abierto && (
        <div
          className="popover-in absolute top-full right-0 z-50 mt-2 flex max-h-[min(70vh,32rem)] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-line bg-[var(--bg)] shadow-xl"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2.5">
            <span className="text-[11px] tracking-label text-tx-3 uppercase">Avisos</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={marcarTodo}
                className={`rounded px-1.5 py-0.5 text-[11px] text-tx-2 transition-colors duration-[200ms] hover:text-brand-blue ${PRESS_SCALE_CLASS}`}
              >
                Marcar todo como leído
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-tx-3">
                Nada por ahora. Acá van a aparecer los comentarios, las aprobaciones y los cambios en los
                posts.
              </p>
            ) : (
              items.map((item) => <Fila key={item.id} item={item} onOpen={() => abrirAviso(item)} />)
            )}
          </div>

          {/* El opt-in de push vive acá y no suelto en el Topbar: son dos
              campanas para la misma idea, y la de al lado no decía de qué
              navegador hablaba. Se oculta solo donde no hay soporte. */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line px-3 py-2">
            <span className="text-[11px] text-tx-3">Avisar también en este dispositivo</span>
            <NotificationToggle />
          </div>
        </div>
      )}
    </div>
  );
}

function Fila({ item, onOpen }: { item: NotificationItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-start gap-2.5 border-b border-[var(--line-soft)] px-3 py-2.5 text-left transition-colors duration-[200ms] hover:bg-panel-2 ${PRESS_SCALE_CLASS} ${
        item.read ? "" : "bg-brand-blue/5"
      }`}
    >
      <span className={`mt-0.5 shrink-0 ${item.read ? "text-tx-3" : "text-brand-blue"}`}>
        <KindIcon kind={item.kind} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-xs leading-snug ${item.read ? "text-tx-2" : "font-bold text-brand-ink"}`}>
          {item.title}
        </span>
        {/* line-clamp-2: el cuerpo ya viene recortado del server, pero un
            caption de 400 caracteres igual haría de cada aviso un párrafo. */}
        <span className="mt-0.5 block line-clamp-2 text-[11px] leading-snug text-tx-3">{item.body}</span>
        <span className="mt-1 block text-[10px] text-tx-3">{item.when}</span>
      </span>
      {!item.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />}
    </button>
  );
}

/** Un glifo por tipo de aviso. No es decoración: en una lista de textos
 * parecidos ("X comentó", "X corrigió") la forma es lo que deja distinguir
 * de qué se trata cada uno sin leerlos. */
function KindIcon({ kind }: { kind: NotificationKind }) {
  const props = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (kind) {
    case "comment":
    case "gallery-comment":
      return (
        <svg {...props}>
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
        </svg>
      );
    case "approval":
      return (
        <svg {...props}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      );
    case "caption":
    case "caption-edit":
      return (
        <svg {...props}>
          <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        </svg>
      );
    case "music":
      return (
        <svg {...props}>
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      );
    case "post-new":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M12 8v8" />
          <path d="M8 12h8" />
        </svg>
      );
    case "post-edit":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
      );
    case "post-delete":
      return (
        <svg {...props}>
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="M19 6l-1 14H6L5 6" />
        </svg>
      );
    case "inspiration":
      return (
        <svg {...props}>
          <path d="M12 3v3" />
          <path d="M12 18v3" />
          <path d="M3 12h3" />
          <path d="M18 12h3" />
          <path d="m5.6 5.6 2.1 2.1" />
          <path d="m16.3 16.3 2.1 2.1" />
          <circle cx="12" cy="12" r="3.2" />
        </svg>
      );
  }
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
