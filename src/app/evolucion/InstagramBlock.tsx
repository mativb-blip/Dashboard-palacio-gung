"use client";

import { useEffect, useState } from "react";
import {
  addInstagramSnapshot,
  deleteInstagramSnapshot,
  getInstagramSnapshots,
  getScheduleFit,
  type ScheduleFit,
  type SnapshotWithMetrics,
} from "@/lib/dashboard/instagram-actions";
import { PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import {
  AudienceSplit,
  BubbleChart,
  ChurnChart,
  ClockChart,
  FunnelChart,
  RingChart,
  dec,
  num,
  porc,
} from "./InstagramCharts";

/**
 * Bloque de Instagram dentro de /evolucion.
 *
 * Va SEPARADO de Producción y no mezclado en el mismo scroll: aquello se
 * deriva solo de las propuestas y se actualiza con cada carga; esto es una
 * captura manual de una ventana cerrada del panel de Instagram. Ponerlos
 * juntos sugeriría que se actualizan al mismo ritmo.
 *
 * La pantalla no guarda ninguna de las cifras que muestra: se cargan ~17
 * lecturas y el resto sale de deriveMetrics(). Los gráficos viven en
 * InstagramCharts.tsx, cada uno dibujado a partir de una escala declarada.
 */
export default function InstagramBlock({ canEdit }: { canEdit: boolean }) {
  const [snapshots, setSnapshots] = useState<SnapshotWithMetrics[] | null>(null);
  const [elegido, setElegido] = useState(0);
  const [cargando, setCargando] = useState(false);
  // El fit se guarda junto al id de su medición: así, al cambiar de período,
  // el de la anterior simplemente no se lee — sin limpiarlo dentro del efecto,
  // que encadena un render de más y hace parpadear la tarjeta.
  const [fit, setFit] = useState<{ id: string; data: ScheduleFit } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getInstagramSnapshots().then(
      (data) => {
        if (!cancelled) setSnapshots(data);
      },
      () => {
        if (!cancelled) setSnapshots([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const actual = snapshots?.[elegido];

  useEffect(() => {
    let cancelled = false;
    if (!actual || actual.bestHourFrom == null || actual.bestHourTo == null) return;
    const id = actual.id;
    getScheduleFit(actual.periodStart, actual.periodEnd, actual.bestHourFrom, actual.bestHourTo).then(
      (data) => {
        if (!cancelled) setFit({ id, data });
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [actual]);

  const fitActual = actual && fit?.id === actual.id ? fit.data : null;

  async function handleDelete(id: string) {
    if (!window.confirm("¿Borrar esta medición?")) return;
    try {
      const data = await deleteInstagramSnapshot(id);
      setSnapshots(data);
      setElegido(0);
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo borrar.");
    }
  }

  return (
    <section className="charts flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-line pt-6">
        <div className="min-w-0">
          <h2 className="text-xl font-bold">Instagram</h2>
          <p className="mt-0.5 text-sm text-tx-2">
            Qué hizo Instagram con el contenido. Se carga a mano desde Estadísticas, por período.
          </p>
        </div>
        {canEdit && !cargando && (
          <button
            type="button"
            onClick={() => setCargando(true)}
            className={`inline-flex min-h-9 shrink-0 items-center rounded border border-brand-blue bg-brand-blue px-3.5 text-xs leading-none font-bold tracking-[0.04em] text-[var(--bg)] transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
          >
            Cargar medición
          </button>
        )}
      </div>

      {cargando && (
        <SnapshotForm
          onCancel={() => setCargando(false)}
          onSaved={(data) => {
            setSnapshots(data);
            setElegido(0);
            setCargando(false);
          }}
        />
      )}

      {snapshots === null && <p className="text-sm text-tx-3">Cargando…</p>}

      {snapshots?.length === 0 && !cargando && (
        <p className="text-sm text-tx-3">
          Todavía no hay ninguna medición cargada.
          {canEdit ? " Cargá la primera desde Estadísticas de Instagram." : ""}
        </p>
      )}

      {actual && snapshots && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {snapshots.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setElegido(i)}
                  className={`rounded border px-2.5 py-1 text-[11px] leading-none font-bold tracking-label transition-colors duration-[200ms] ${
                    i === elegido
                      ? "border-brand-blue bg-brand-blue text-[var(--bg)]"
                      : "border-line-2 bg-panel-2 text-tx-2 hover:border-brand-blue"
                  } ${PRESS_SCALE_CLASS}`}
                >
                  {rangoCorto(s.periodStart, s.periodEnd)}
                </button>
              ))}
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => void handleDelete(actual.id)}
                className={`text-[11px] text-tx-3 transition-colors duration-[200ms] hover:text-[var(--color-brand-red-text)] ${PRESS_SCALE_CLASS}`}
              >
                Borrar esta medición
              </button>
            )}
          </div>

          {/* El período va siempre a la vista: "+490 seguidores" no significa
              nada sin saber en cuántos días, y la fecha de captura importa
              porque el contenido sigue circulando después del cierre. */}
          <p className="text-[11px] text-tx-3">
            {rangoCorto(actual.periodStart, actual.periodEnd)} {actual.periodEnd.slice(0, 4)} · {actual.metrics.days} días ·
            capturado el{" "}
            {new Date(actual.capturedAt).toLocaleDateString("es-DO", { day: "numeric", month: "long" })}
            {actual.addedBy ? ` por ${actual.addedBy}` : ""}
          </p>

          <Tiles s={actual} />

          {actual.bestHourFrom != null && actual.bestHourTo != null && (
            <Card
              title="El reloj de tu audiencia"
              description="Seguidores activos a lo largo del día. La banda es la franja que marca Instagram; los puntos, tus publicaciones del período."
            >
              <ClockChart
                desde={actual.bestHourFrom}
                hasta={actual.bestHourTo}
                publicaciones={fitActual?.horas ?? []}
              />
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-tx-3">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px] bg-brand-blue" />
                  Dentro de la franja
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px] bg-brand-ink" />
                  Fuera
                </span>
                {actual.bestDays.length > 0 && <span>Mejores días: {actual.bestDays.join(", ").toLowerCase()}</span>}
              </div>
              {fitActual && fitActual.total > 0 && (
                <p className="mt-3 text-[13px] text-tx-2">
                  <b className="text-brand-ink">
                    {fitActual.dentro} de {fitActual.total}
                  </b>{" "}
                  propuestas del período caen dentro de la franja.
                </p>
              )}
              {fitActual && fitActual.total === 0 && (
                <p className="mt-3 text-[12px] text-tx-3">
                  No hay propuestas con hora legible en este período, así que no hay puntos que ubicar.
                </p>
              )}
            </Card>
          )}

          <div className="grid gap-5 desktop:grid-cols-3">
            <Card title="Del alcance al seguidor" description="El ancho de cada tramo es su valor sobre el primero.">
              <FunnelChart
                viewers={actual.readings.viewers}
                profileVisits={actual.readings.profileVisits}
                follows={actual.readings.follows}
                bioLinkTaps={actual.readings.bioLinkTaps}
                visitRatePct={actual.metrics.profileVisitRatePct}
                followRatePct={actual.metrics.visitToFollowPct}
              />
              <p className="mt-2 text-[12px] leading-snug text-tx-3">
                {actual.readings.addressTaps > 0 && (
                  <>
                    <b className="text-brand-ink">{num(actual.readings.addressTaps)} personas</b> tocaron la dirección
                    del local.{" "}
                  </>
                )}
                {actual.readings.bioLinkTaps === 0
                  ? "El enlace de la bio no registró un solo toque."
                  : `El enlace de la bio tuvo ${num(actual.readings.bioLinkTaps)} toques.`}
              </p>
            </Card>

            <Card title="Alcance contra rendimiento" description="Cada burbuja es un formato. El área son sus interacciones.">
              <BubbleChart
                formatos={[
                  { nombre: "Publicaciones", alcance: actual.readings.viewersPosts, eficiencia: actual.metrics.efficiencyPostsPct, interacciones: actual.readings.interactionsPosts },
                  { nombre: "Reels", alcance: actual.readings.viewersReels, eficiencia: actual.metrics.efficiencyReelsPct, interacciones: actual.readings.interactionsReels },
                  { nombre: "Historias", alcance: actual.readings.viewersStories, eficiencia: actual.metrics.efficiencyStoriesPct, interacciones: actual.readings.interactionsStories },
                ]}
              />
              {actual.metrics.reelsAdvantage !== undefined && (
                <p className="mt-2 text-[12px] leading-snug text-tx-3">
                  Un Reel rinde <b className="text-brand-ink">{dec(actual.metrics.reelsAdvantage)}×</b> más por persona
                  alcanzada que una Publicación.
                </p>
              )}
            </Card>

            <Card title="Penetración en tu base" description="Cuánta de tu propia gente vio algo en el período.">
              <RingChart
                pct={actual.metrics.ownBasePenetrationPct}
                vieron={actual.metrics.followerViewers}
                base={actual.metrics.followersAvgBase}
              />
              <p className="mt-2 text-[12px] leading-snug text-tx-3">
                Además alcanzaste a <b className="text-brand-ink">{num(actual.metrics.nonFollowerViewers)}</b> personas
                de afuera, el {porc(actual.metrics.externalReachVsBasePct)} del tamaño de tu base.
              </p>
            </Card>
          </div>

          <div className="grid gap-5 desktop:grid-cols-2">
            <Card title="Lo que entra y lo que se va" description="Las tres barras comparten la escala de las altas.">
              <ChurnChart
                follows={actual.readings.follows}
                unfollows={actual.readings.unfollows}
                net={actual.metrics.followersNet}
              />
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-tx-3">
                <span>
                  Churn <b className="text-brand-ink">{porc(actual.metrics.churnPct)}</b>
                </span>
                <span>
                  Retención <b className="text-brand-ink">{porc(actual.metrics.retentionPct)}</b>
                </span>
                <span>
                  <b className="text-brand-ink">{dec(actual.metrics.netPerDay, 1)}</b> por día
                </span>
              </div>
            </Card>

            <Card title="Quién mira y quién responde" description="Dos cosas distintas: a quién llegás y quién reacciona.">
              <AudienceSplit
                vistaPct={actual.readings.viewersFollowersPct}
                interaccionPct={actual.readings.interactionsFollowersPct}
              />
              {actual.metrics.commentsPerThousandViewers !== undefined && (
                <p className="mt-2 text-[12px] leading-snug text-tx-3">
                  {num(actual.readings.comments ?? 0)} comentarios:{" "}
                  <b className="text-brand-ink">{dec(actual.metrics.commentsPerThousandViewers)}</b> por cada mil
                  espectadores.
                </p>
              )}
            </Card>
          </div>

          <Limits s={actual} />
          <RawTable s={actual} />
        </>
      )}
    </section>
  );
}

// ─── Formato de fechas ──────────────────────────────────────────────────────

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function rangoCorto(inicio: string, fin: string): string {
  const [, mi, di] = inicio.split("-").map(Number);
  const [, mf, df] = fin.split("-").map(Number);
  if (mi === mf) return `${di} al ${df} de ${MESES_CORTOS[mf - 1]}`;
  return `${di} ${MESES_CORTOS[mi - 1]} al ${df} ${MESES_CORTOS[mf - 1]}`;
}

// ─── Piezas de la pantalla ──────────────────────────────────────────────────

/** Los ocho indicadores de seguimiento. Ocho y no treinta: el resto son
 * fórmulas de apoyo y viven en la tabla plegada de abajo. */
function Tiles({ s }: { s: SnapshotWithMetrics }) {
  const m = s.metrics;
  const p = s.previous;
  return (
    <div className="grid grid-cols-2 gap-3 desktop:grid-cols-4">
      <Tile label="Seguidores netos" value={`${m.followersNet >= 0 ? "+" : ""}${num(m.followersNet)}`} nota={`${dec(m.netPerDay, 1)} por día`} delta={diff(m.followersNet, p?.metrics.followersNet)} mejorSi="sube" />
      <Tile label="Churn de la ventana" value={porc(m.churnPct)} nota={`${num(s.readings.unfollows)} bajas por ${num(s.readings.follows)} altas`} delta={diff(m.churnPct, p?.metrics.churnPct)} mejorSi="baja" />
      <Tile label="Penetración en tu base" value={porc(m.ownBasePenetrationPct)} nota={`${num(m.followerViewers)} de ${num(m.followersAvgBase)}`} delta={diff(m.ownBasePenetrationPct, p?.metrics.ownBasePenetrationPct)} mejorSi="sube" />
      <Tile label="Interacción sobre alcance" value={porc(m.interactionRatePct)} nota={`${num(s.readings.interactions)} sobre ${num(s.readings.viewers)}`} delta={diff(m.interactionRatePct, p?.metrics.interactionRatePct)} mejorSi="sube" />
      <Tile label="Perfil a seguidor" value={porc(m.visitToFollowPct)} nota={`${num(s.readings.follows)} de ${num(s.readings.profileVisits)} visitas`} delta={diff(m.visitToFollowPct, p?.metrics.visitToFollowPct)} mejorSi="sube" />
      <Tile label="Visitas al perfil" value={num(s.readings.profileVisits)} nota={`${porc(m.profileVisitRatePct)} de quienes vieron algo`} delta={diff(s.readings.profileVisits, p?.readings.profileVisits)} mejorSi="sube" />
      <Tile label="Toques en la dirección" value={num(s.readings.addressTaps)} nota={`${porc(m.addressRatePct)} de las visitas`} delta={diff(m.addressRatePct, p?.metrics.addressRatePct)} mejorSi="sube" />
      <Tile label="Ventaja de Reels" value={m.reelsAdvantage === undefined ? "sin dato" : `${dec(m.reelsAdvantage)}×`} nota={`${porc(m.efficiencyReelsPct)} contra ${porc(m.efficiencyPostsPct)}`} delta={diff(m.reelsAdvantage, p?.metrics.reelsAdvantage)} />
    </div>
  );
}

function diff(ahora?: number, antes?: number): number | undefined {
  if (ahora === undefined || antes === undefined) return undefined;
  return ahora - antes;
}

function Tile({
  label,
  value,
  nota,
  delta,
  mejorSi,
}: {
  label: string;
  value: string;
  nota: string;
  delta?: number;
  mejorSi?: "sube" | "baja";
}) {
  // Sin medición anterior no se dibuja un 0 %: se leería como "no cambió",
  // cuando lo que pasa es que no hay con qué comparar.
  const mejor = delta === undefined || mejorSi === undefined ? null : mejorSi === "sube" ? delta > 0 : delta < 0;
  return (
    <div className="rounded-lg border border-line-2 bg-panel-2 p-4">
      <div className="text-[11px] tracking-label text-tx-3 uppercase">{label}</div>
      <div className="mt-1 text-2xl leading-none font-bold tabular-nums">{value}</div>
      {delta === undefined ? (
        <div className="mt-2 text-[11px] leading-snug text-tx-3">Primera medición, sin comparación</div>
      ) : (
        <div
          className="mt-2 text-[11px] leading-snug tabular-nums"
          style={{ color: mejor === null ? "var(--muted)" : mejor ? "var(--color-brand-blue)" : "var(--color-brand-red-text)" }}
        >
          {/* Flecha y signo además del color: el sentido tiene que leerse sin
              distinguir el azul del rojo. */}
          {delta > 0 ? "↑ +" : delta < 0 ? "↓ " : "= "}
          {dec(Math.abs(delta))} contra la anterior
        </div>
      )}
      <div className="mt-1.5 text-[11px] leading-snug text-tx-3">{nota}</div>
    </div>
  );
}

function Card({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line-2 bg-panel-2 p-4 desktop:p-5">
      <h3 className="text-sm font-bold">{title}</h3>
      <p className="mt-0.5 text-[12px] leading-snug text-tx-3">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Los límites declarados van a la vista. Un panel que esconde su propia
 * incertidumbre es peor que no tenerlo: alguien va a sumar el desglose tarde
 * o temprano y va a dejar de creerle a todo. */
function Limits({ s }: { s: SnapshotWithMetrics }) {
  const m = s.metrics;
  return (
    <div className="rounded-lg border border-line-2 px-4 py-3">
      <div className="text-[11px] tracking-label text-tx-3 uppercase">Qué no mide esto</div>
      <ul className="mt-2 flex flex-col gap-1.5 text-[12px] leading-snug text-tx-3">
        {m.unattributedInteractions !== 0 && (
          <li>
            <b className="text-tx-2">
              {num(Math.abs(m.unattributedInteractions))} interacciones ({porc(Math.abs(m.unattributedPct), 1)})
            </b>{" "}
            {m.unattributedInteractions > 0
              ? "que la cabecera cuenta y el desglose por tipo no"
              : "de más en el desglose respecto de la cabecera"}
            . Es del panel de Instagram, no de la transcripción.
          </li>
        )}
        <li>
          <b className="text-tx-2">Pauta y orgánico van mezclados.</b> Estadísticas de Instagram no los separa por
          ventana; para eso hace falta Meta Ads Manager.
        </li>
        <li>
          <b className="text-tx-2">No hay datos por pieza.</b> El panel de Contenido muestra métricas acumuladas desde
          que se publicó cada post, no recortadas al período, así que no sirven para comparar entre piezas de distinta
          antigüedad.
        </li>
        <li>
          <b className="text-tx-2">La curva horaria es aproximada.</b> Instagram publica la forma del día, no el valor
          exacto de cada hora.
        </li>
        {s.notes && <li className="text-tx-2">{s.notes}</li>}
      </ul>
    </div>
  );
}

/** Las lecturas tal como se cargaron, plegadas. Permite auditar cualquier
 * cifra de arriba sin abrir la base. */
function RawTable({ s }: { s: SnapshotWithMetrics }) {
  const [abierto, setAbierto] = useState(false);
  const r = s.readings;
  const filas: [string, string][] = [
    ["Visualizaciones", num(r.views)],
    ["Espectadores (cuentas únicas)", num(r.viewers)],
    ["Interacciones", num(r.interactions)],
    ["Empezaron a seguirte", num(r.follows)],
    ["Dejaron de seguirte", num(r.unfollows)],
    ["Seguidores al cierre", num(r.followersEnd)],
    ["Espectadores que ya te seguían", `${dec(r.viewersFollowersPct, 1)} %`],
    ["Interacciones de seguidores", `${dec(r.interactionsFollowersPct, 1)} %`],
    ["Visitas al perfil", num(r.profileVisits)],
    ["Toques en el enlace de la bio", num(r.bioLinkTaps)],
    ["Toques en la dirección", num(r.addressTaps)],
    ["Espectadores en Publicaciones", num(r.viewersPosts)],
    ["Espectadores en Reels", num(r.viewersReels)],
    ["Espectadores en Historias", num(r.viewersStories)],
    ["Interacciones en Publicaciones", num(r.interactionsPosts)],
    ["Interacciones en Reels", num(r.interactionsReels)],
    ["Interacciones en Historias", num(r.interactionsStories)],
    ...(r.likes != null ? ([["Me gusta", num(r.likes)]] as [string, string][]) : []),
    ...(r.shares != null ? ([["Compartidos", num(r.shares)]] as [string, string][]) : []),
    ...(r.saves != null ? ([["Guardados", num(r.saves)]] as [string, string][]) : []),
    ...(r.comments != null ? ([["Comentarios", num(r.comments)]] as [string, string][]) : []),
    ...(r.reposts != null ? ([["Reposts", num(r.reposts)]] as [string, string][]) : []),
    ...(r.replies != null ? ([["Respuestas", num(r.replies)]] as [string, string][]) : []),
  ];
  return (
    <div className="rounded-lg border border-line-2">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left ${PRESS_SCALE_CLASS}`}
      >
        <span className="text-[11px] tracking-label text-tx-3 uppercase">Lecturas cargadas ({filas.length})</span>
        <span className="text-[11px] text-tx-3">{abierto ? "Ocultar" : "Ver"}</span>
      </button>
      {abierto && (
        <ul className="flex flex-col gap-1.5 border-t border-line-2 px-4 py-3">
          {filas.map(([nombre, valor]) => (
            <li key={nombre} className="flex items-baseline justify-between gap-3 text-[12px]">
              <span className="min-w-0 text-tx-3">{nombre}</span>
              <span className="shrink-0 tabular-nums text-tx-2">{valor}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Carga ──────────────────────────────────────────────────────────────────

/** Los campos están en el ORDEN EN QUE APARECEN EN EL PANEL de Instagram, no
 * agrupados por afinidad conceptual: esto se llena mirando el teléfono y
 * copiando, así que lo que importa es no tener que buscar dos veces la misma
 * pantalla. */
const GRUPOS: { titulo: string; campos: { key: string; label: string; opcional?: boolean; pct?: boolean }[] }[] = [
  {
    titulo: "Resumen",
    campos: [
      { key: "views", label: "Visualizaciones" },
      { key: "viewers", label: "Espectadores" },
      { key: "interactions", label: "Interacciones" },
      { key: "follows", label: "Empezaron a seguirte" },
      { key: "unfollows", label: "Dejaron de seguirte" },
      { key: "followersEnd", label: "Seguidores al cierre" },
      { key: "viewersFollowersPct", label: "% espectadores que ya te seguían", pct: true },
      { key: "interactionsFollowersPct", label: "% interacciones de seguidores", pct: true },
    ],
  },
  {
    titulo: "Actividad del perfil",
    campos: [
      { key: "profileVisits", label: "Visitas al perfil" },
      { key: "bioLinkTaps", label: "Toques en el enlace de la bio" },
      { key: "addressTaps", label: "Toques en la dirección" },
    ],
  },
  {
    titulo: "Por tipo de contenido",
    campos: [
      { key: "viewersPosts", label: "Espectadores · Publicaciones" },
      { key: "viewersReels", label: "Espectadores · Reels" },
      { key: "viewersStories", label: "Espectadores · Historias" },
      { key: "interactionsPosts", label: "Interacciones · Publicaciones" },
      { key: "interactionsReels", label: "Interacciones · Reels" },
      { key: "interactionsStories", label: "Interacciones · Historias" },
    ],
  },
  {
    titulo: "Desglose por acción (opcional)",
    campos: [
      { key: "likes", label: "Me gusta", opcional: true },
      { key: "shares", label: "Compartidos", opcional: true },
      { key: "saves", label: "Guardados", opcional: true },
      { key: "comments", label: "Comentarios", opcional: true },
      { key: "reposts", label: "Reposts", opcional: true },
      { key: "replies", label: "Respuestas", opcional: true },
    ],
  },
];

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function SnapshotForm({
  onCancel,
  onSaved,
}: {
  onCancel: () => void;
  onSaved: (data: SnapshotWithMetrics[]) => void;
}) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [capturedAt, setCapturedAt] = useState("");
  const [dias, setDias] = useState<string[]>([]);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const set = (key: string, v: string) => setValores((prev) => ({ ...prev, [key]: v }));

  async function handleSubmit() {
    setError("");
    const numero = (key: string, opcional = false): number | undefined => {
      const crudo = (valores[key] ?? "").trim().replace(/\./g, "").replace(",", ".");
      if (crudo === "") {
        if (opcional) return undefined;
        throw new Error("Faltan campos por completar.");
      }
      const v = Number(crudo);
      if (!Number.isFinite(v)) throw new Error("Hay un campo que no es un número.");
      return v;
    };

    setGuardando(true);
    try {
      // `obligatorio` tira si falta, así que el `!` no oculta nada: el catch
      // de abajo muestra el mensaje. Se arma campo por campo y no con un
      // Record volcado a la fuerza — un cast acá dejaría pasar un renombre de
      // GRUPOS sin que el compilador dijera nada.
      const obligatorio = (k: string) => numero(k) as number;
      const data = await addInstagramSnapshot({
        periodStart,
        periodEnd,
        capturedAt: capturedAt ? new Date(`${capturedAt}T12:00:00`).toISOString() : undefined,
        views: obligatorio("views"),
        viewers: obligatorio("viewers"),
        interactions: obligatorio("interactions"),
        follows: obligatorio("follows"),
        unfollows: obligatorio("unfollows"),
        followersEnd: obligatorio("followersEnd"),
        viewersFollowersPct: obligatorio("viewersFollowersPct"),
        interactionsFollowersPct: obligatorio("interactionsFollowersPct"),
        profileVisits: obligatorio("profileVisits"),
        bioLinkTaps: obligatorio("bioLinkTaps"),
        addressTaps: obligatorio("addressTaps"),
        viewersPosts: obligatorio("viewersPosts"),
        viewersReels: obligatorio("viewersReels"),
        viewersStories: obligatorio("viewersStories"),
        interactionsPosts: obligatorio("interactionsPosts"),
        interactionsReels: obligatorio("interactionsReels"),
        interactionsStories: obligatorio("interactionsStories"),
        likes: numero("likes", true),
        shares: numero("shares", true),
        saves: numero("saves", true),
        comments: numero("comments", true),
        reposts: numero("reposts", true),
        replies: numero("replies", true),
        bestDays: dias,
        bestHourFrom: desde === "" ? null : Number(desde),
        bestHourTo: hasta === "" ? null : Number(hasta),
        notes: notas,
      });
      onSaved(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 rounded-lg border border-line-2 bg-panel-2 p-4 desktop:p-5">
      <div>
        <h3 className="text-sm font-bold">Cargar una medición</h3>
        <p className="mt-0.5 text-[12px] leading-snug text-tx-3">
          Copiá los números de Estadísticas de Instagram. Solo se cargan las lecturas: los porcentajes, las tasas y
          las comparaciones los calcula el panel, así que no se pueden cargar cifras que se contradigan.
        </p>
      </div>

      <div className="grid gap-3 desktop:grid-cols-3">
        <Field label="Inicio del período">
          <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Fin del período">
          <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Fecha de captura">
          <input type="date" value={capturedAt} onChange={(e) => setCapturedAt(e.target.value)} className={inputClass} />
        </Field>
      </div>

      {GRUPOS.map((g) => (
        <div key={g.titulo}>
          <div className="text-[11px] tracking-label text-tx-3 uppercase">{g.titulo}</div>
          <div className="mt-2 grid gap-3 desktop:grid-cols-3">
            {g.campos.map((c) => (
              <Field key={c.key} label={c.label}>
                <input
                  inputMode="decimal"
                  value={valores[c.key] ?? ""}
                  onChange={(e) => set(c.key, e.target.value)}
                  placeholder={c.pct ? "24,7" : c.opcional ? "opcional" : "0"}
                  className={inputClass}
                />
              </Field>
            ))}
          </div>
        </div>
      ))}

      <div>
        <div className="text-[11px] tracking-label text-tx-3 uppercase">
          Momentos de actividad (opcional, pero es lo que se cruza con tu calendario)
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DIAS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDias((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))}
              className={`rounded border px-2.5 py-1 text-[11px] leading-none font-bold transition-colors duration-[200ms] ${
                dias.includes(d)
                  ? "border-brand-blue bg-brand-blue text-[var(--bg)]"
                  : "border-line-2 bg-[var(--bg)] text-tx-2"
              } ${PRESS_SCALE_CLASS}`}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 desktop:grid-cols-3">
          <Field label="Franja desde (hora, 0–23)">
            <input inputMode="numeric" value={desde} onChange={(e) => setDesde(e.target.value)} placeholder="18" className={inputClass} />
          </Field>
          <Field label="Franja hasta (hora, 0–23)">
            <input inputMode="numeric" value={hasta} onChange={(e) => setHasta(e.target.value)} placeholder="21" className={inputClass} />
          </Field>
        </div>
      </div>

      <Field label="Notas (opcional)">
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          placeholder="Anomalías, cosas que el panel no mostró, lo que haga falta recordar de esta captura."
          className={`${inputClass} resize-y py-2`}
        />
      </Field>

      {error && <p className="text-[12px] text-[var(--color-brand-red-text)]">{error}</p>}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={`inline-flex min-h-9 items-center rounded border border-line-2 bg-[var(--bg)] px-3.5 text-xs leading-none font-bold tracking-[0.04em] text-brand-ink transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={guardando}
          className={`inline-flex min-h-9 items-center rounded border border-brand-blue bg-brand-blue px-3.5 text-xs leading-none font-bold tracking-[0.04em] text-[var(--bg)] transition-transform duration-[400ms] disabled:opacity-60 ${PRESS_SCALE_CLASS}`}
        >
          {guardando ? "Guardando…" : "Guardar medición"}
        </button>
      </div>
    </div>
  );
}

const inputClass =
  "min-h-9 w-full rounded border border-line-2 bg-[var(--bg)] px-3 text-[13px] text-brand-ink";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-tx-3">{label}</span>
      {children}
    </label>
  );
}
