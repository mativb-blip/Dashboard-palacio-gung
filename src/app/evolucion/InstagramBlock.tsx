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

/**
 * Bloque de Instagram dentro de /evolucion.
 *
 * Va SEPARADO de Producción y no mezclado en el mismo scroll: aquello se
 * deriva solo de las propuestas y se actualiza con cada carga; esto es una
 * captura manual de una ventana cerrada del panel de Instagram. Ponerlos
 * juntos sugeriría que se actualizan al mismo ritmo, y no es así.
 *
 * La pantalla no guarda ninguna de las cifras que muestra: se cargan ~17
 * lecturas y todo lo demás sale de deriveMetrics(). Ver el comentario de
 * InstagramSnapshot en el schema.
 */
export default function InstagramBlock({ canEdit }: { canEdit: boolean }) {
  const [snapshots, setSnapshots] = useState<SnapshotWithMetrics[] | null>(null);
  const [elegido, setElegido] = useState(0);
  const [cargando, setCargando] = useState(false);
  // El fit se guarda JUNTO al id de la medición a la que corresponde. Si
  // fuera un estado suelto habría que limpiarlo al cambiar de período, y
  // limpiarlo dentro del efecto encadena un render de más además de hacer
  // parpadear la tarjeta. Así, un fit de otra medición simplemente no se lee.
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

  // El cruce con el calendario se pide aparte: depende de la medición
  // elegida y de las propuestas, y no tiene sentido traerlo si la medición
  // no trae franja horaria cargada.
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
    <section className="flex flex-col gap-5">
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

          {/* El encabezado del período va SIEMPRE a la vista: "+490
              seguidores" no significa nada sin saber en cuántos días, y la
              fecha de captura importa porque el contenido sigue circulando
              entre el fin del período y el momento en que se miró. */}
          <p className="text-[11px] text-tx-3">
            {rangoLargo(actual.periodStart, actual.periodEnd)} · {actual.metrics.days} días · capturado el{" "}
            {new Date(actual.capturedAt).toLocaleDateString("es-DO", { day: "numeric", month: "long", year: "numeric" })}
            {actual.addedBy ? ` por ${actual.addedBy}` : ""}
          </p>

          <Tiles s={actual} />

          <div className="grid gap-5 desktop:grid-cols-2">
            <Card
              title="Del alcance al seguidor"
              description="Cuánta gente vio algo, cuánta entró al perfil y cuánta se quedó."
            >
              <Funnel s={actual} />
            </Card>

            <Card
              title="Alcance contra eficiencia, por formato"
              description="Dos medidas distintas, cada una en su escala. La comparación es entre formatos, no entre las dos columnas."
            >
              <FormatComparison s={actual} />
            </Card>

            <Card
              title="Penetración en la base propia"
              description="Cuánto de tu propia gente vio algo, y cuánta gente de afuera alcanzaste."
            >
              <Penetration s={actual} />
            </Card>

            <Card title="Altas y bajas" description="Lo que entró, lo que salió y lo que quedó.">
              <Churn s={actual} />
            </Card>
          </div>

          {actual.bestHourFrom != null && actual.bestHourTo != null && (
            <Card
              title="Cuándo publicás contra cuándo está tu gente"
              description="Lo único de esta medición que se cruza con tu calendario."
            >
              <ScheduleCard s={actual} fit={fitActual} />
            </Card>
          )}

          <Limits s={actual} />

          <RawTable s={actual} />
        </>
      )}
    </section>
  );
}

// ─── Formato ────────────────────────────────────────────────────────────────

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function rangoCorto(inicio: string, fin: string): string {
  const [, mi, di] = inicio.split("-").map(Number);
  const [, mf, df] = fin.split("-").map(Number);
  if (mi === mf) return `${di}–${df} ${MESES_CORTOS[mf - 1]}`;
  return `${di} ${MESES_CORTOS[mi - 1]} – ${df} ${MESES_CORTOS[mf - 1]}`;
}

function rangoLargo(inicio: string, fin: string): string {
  const [ai] = inicio.split("-").map(Number);
  return `${rangoCorto(inicio, fin)} ${ai}`;
}

/** es-ES y no es-DO, que es el locale del resto del dashboard: `Intl` para
 * República Dominicana devuelve el formato estadounidense (10,479 y 1.14),
 * y el informe del que se transcriben estas cifras usa el europeo (10.479 y
 * 1,14). Se lee con el documento al lado, así que tienen que coincidir —
 * "1.14 %" contra "1,14 %" se presta a leer catorce donde dice catorce
 * centésimas. Las FECHAS siguen en es-DO, que ahí no hay ambigüedad. */
const LOCALE_NUM = "es-ES";

/** `useGrouping: "always"` porque el español, por defecto, NO agrupa los
 * números de cuatro cifras: 42427 sale "42.427" pero 4194 sale "4194", y en
 * la misma columna eso parece un error de la pantalla. El informe los escribe
 * todos agrupados. */
const num = (v: number) => Math.round(v).toLocaleString(LOCALE_NUM, { useGrouping: "always" });
const dec = (v: number, d = 2) =>
  v.toLocaleString(LOCALE_NUM, { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: "always" });
const porc = (v: number, d = 2) => `${dec(v, d)} %`;

// ─── Tarjetas de indicador ──────────────────────────────────────────────────

/** Los ocho indicadores de seguimiento del informe. Ocho y no treinta: el
 * resto son fórmulas de apoyo y viven en la tabla de abajo. */
function Tiles({ s }: { s: SnapshotWithMetrics }) {
  const m = s.metrics;
  const p = s.previous?.metrics;
  return (
    <div className="grid grid-cols-2 gap-3 desktop:grid-cols-4">
      <Tile label="Seguidores netos" value={`${m.followersNet >= 0 ? "+" : ""}${num(m.followersNet)}`} nota={`${dec(m.netPerDay, 1)}/día · ${porc(m.growthPct)}`} delta={delta(m.followersNet, p?.followersNet)} mejorSi="sube" />
      <Tile label="Churn de la ventana" value={porc(m.churnPct)} nota={`${num(s.readings.unfollows)} bajas por ${num(s.readings.follows)} altas`} delta={delta(m.churnPct, p?.churnPct)} mejorSi="baja" />
      <Tile label="Penetración en tu base" value={porc(m.ownBasePenetrationPct)} nota={`${num(m.followerViewers)} de ${num(m.followersAvgBase)} seguidores`} delta={delta(m.ownBasePenetrationPct, p?.ownBasePenetrationPct)} mejorSi="sube" />
      <Tile label="Interacción sobre alcance" value={porc(m.interactionRatePct)} nota={`${num(s.readings.interactions)} sobre ${num(s.readings.viewers)}`} delta={delta(m.interactionRatePct, p?.interactionRatePct)} mejorSi="sube" />
      <Tile label="Perfil → seguidor" value={porc(m.visitToFollowPct)} nota={`${num(s.readings.follows)} de ${num(s.readings.profileVisits)} visitas`} delta={delta(m.visitToFollowPct, p?.visitToFollowPct)} mejorSi="sube" />
      <Tile label="Visitas al perfil" value={num(s.readings.profileVisits)} nota={`${porc(m.profileVisitRatePct)} de quienes vieron algo`} delta={delta(s.readings.profileVisits, s.previous?.readings.profileVisits)} mejorSi="sube" />
      <Tile label="Toques en la dirección" value={num(s.readings.addressTaps)} nota={`${porc(m.addressRatePct)} de las visitas`} delta={delta(m.addressRatePct, p?.addressRatePct)} mejorSi="sube" />
      <Tile
        label="Ventaja de Reels"
        value={m.reelsAdvantage === undefined ? "—" : `${dec(m.reelsAdvantage, 2)}×`}
        nota={`${porc(m.efficiencyReelsPct)} contra ${porc(m.efficiencyPostsPct)}`}
        delta={delta(m.reelsAdvantage, p?.reelsAdvantage)}
      />
    </div>
  );
}

function delta(ahora?: number, antes?: number): number | undefined {
  if (ahora === undefined || antes === undefined) return undefined;
  return ahora - antes;
}

function Tile({
  label,
  value,
  nota,
  delta: d,
  mejorSi,
}: {
  label: string;
  value: string;
  nota: string;
  delta?: number;
  mejorSi?: "sube" | "baja";
}) {
  // Sin comparación no se dibuja un 0 %: se leería como "no cambió", cuando
  // lo que pasa es que no hay con qué comparar. El valor de este panel
  // aparece recién en la segunda medición, y conviene que se note.
  const mejor = d === undefined || mejorSi === undefined ? null : mejorSi === "sube" ? d > 0 : d < 0;
  return (
    <div className="rounded-lg border border-line-2 bg-panel-2 p-4">
      <div className="text-[11px] tracking-label text-tx-3 uppercase">{label}</div>
      <div className="mt-1 text-2xl leading-none font-bold tabular-nums">{value}</div>
      {d === undefined ? (
        <div className="mt-2 text-[11px] leading-snug text-tx-3">Primera medición — sin comparación</div>
      ) : (
        <div
          className="mt-2 text-[11px] leading-snug tabular-nums"
          style={{
            color:
              mejor === null
                ? "var(--muted)"
                : mejor
                  ? "var(--color-brand-blue)"
                  : "var(--color-brand-red-text)",
          }}
        >
          {/* Flecha + signo, no solo color: el sentido tiene que leerse sin
              distinguir el azul del rojo. */}
          {d > 0 ? "↑ +" : d < 0 ? "↓ " : "= "}
          {dec(Math.abs(d), 2)} vs. la anterior
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

// ─── Gráficos ───────────────────────────────────────────────────────────────

/** Embudo de tres pasos. Cada barra es proporcional al primero, así se ve la
 * caída real — y la tasa entre pasos va rotulada, porque una barra de 630
 * sobre 42.000 es un hilo y el número es lo que la hace legible. */
function Funnel({ s }: { s: SnapshotWithMetrics }) {
  const r = s.readings;
  const m = s.metrics;
  const pasos = [
    { nombre: "Vieron algo", valor: r.viewers, tasa: "" },
    { nombre: "Entraron al perfil", valor: r.profileVisits, tasa: porc(m.profileVisitRatePct) },
    { nombre: "Se hicieron seguidores", valor: r.follows, tasa: porc(m.visitToFollowPct) },
  ];
  const max = Math.max(1, r.viewers);
  return (
    <div className="flex flex-col gap-3">
      {pasos.map((p, i) => (
        <div key={p.nombre}>
          <div className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className="text-tx-2">{p.nombre}</span>
            <span className="shrink-0 tabular-nums">
              {num(p.valor)}
              {p.tasa && <span className="ml-1.5 text-[11px] text-tx-3">{p.tasa} del paso anterior</span>}
            </span>
          </div>
          <div className="mt-1.5 h-2 w-full rounded-full bg-[var(--line-soft)]">
            <div
              className="h-full rounded-full bg-brand-blue"
              style={{ width: `${Math.max((p.valor / max) * 100, p.valor > 0 ? 0.6 : 0)}%` }}
            />
          </div>
          {i === pasos.length - 1 && (
            <p className="mt-3 rounded border border-line-2 px-3 py-2 text-[12px] leading-snug text-tx-2">
              {r.bioLinkTaps === 0 ? (
                <>
                  <strong className="text-[var(--color-brand-red-text)]">0 toques</strong> en el enlace de la bio
                  sobre {num(r.profileVisits)} visitas — y {num(r.addressTaps)} personas tocaron la dirección. Hay
                  intención; el canal medible está apagado.
                </>
              ) : (
                <>
                  {num(r.bioLinkTaps)} toques en el enlace de la bio ({porc(m.bioLinkRatePct)} de las visitas) y{" "}
                  {num(r.addressTaps)} en la dirección.
                </>
              )}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/** Alcance y eficiencia, uno al lado del otro pero CADA UNO EN SU ESCALA.
 * Nunca dos escalas en un mismo eje: la comparación honesta es entre
 * formatos dentro de cada columna, no entre columnas. */
function FormatComparison({ s }: { s: SnapshotWithMetrics }) {
  const r = s.readings;
  const m = s.metrics;
  const filas = [
    { nombre: "Publicaciones", alcance: r.viewersPosts, ef: m.efficiencyPostsPct },
    { nombre: "Reels", alcance: r.viewersReels, ef: m.efficiencyReelsPct },
    { nombre: "Historias", alcance: r.viewersStories, ef: m.efficiencyStoriesPct },
  ];
  const maxAlcance = Math.max(1, ...filas.map((f) => f.alcance));
  const maxEf = Math.max(0.01, ...filas.map((f) => f.ef));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 text-[11px] tracking-label text-tx-3 uppercase">
        <span>Alcance</span>
        <span>Interacción por espectador</span>
      </div>
      {filas.map((f) => (
        <div key={f.nombre}>
          <div className="text-[13px] text-tx-2">{f.nombre}</div>
          <div className="mt-1.5 grid grid-cols-2 gap-4">
            <div>
              <div className="h-1.5 w-full rounded-full bg-[var(--line-soft)]">
                <div className="h-full rounded-full bg-brand-blue" style={{ width: `${(f.alcance / maxAlcance) * 100}%` }} />
              </div>
              <div className="mt-1 text-[11px] tabular-nums text-tx-3">{num(f.alcance)}</div>
            </div>
            <div>
              <div className="h-1.5 w-full rounded-full bg-[var(--line-soft)]">
                <div className="h-full rounded-full bg-brand-blue" style={{ width: `${(f.ef / maxEf) * 100}%` }} />
              </div>
              <div className="mt-1 text-[11px] tabular-nums text-tx-3">{porc(f.ef)}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Penetration({ s }: { s: SnapshotWithMetrics }) {
  const m = s.metrics;
  const base = m.followersAvgBase;
  const vieron = Math.min(m.followerViewers, base);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-baseline justify-between gap-2 text-[13px]">
          <span className="text-tx-2">De tu base vieron algo</span>
          <span className="tabular-nums">
            {num(vieron)} <span className="text-[11px] text-tx-3">de {num(base)}</span>
          </span>
        </div>
        <div className="mt-1.5 flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-[var(--line-soft)]">
          <div className="h-full rounded-l-full bg-brand-blue" style={{ width: `${(vieron / base) * 100}%` }} />
        </div>
        <p className="mt-1.5 text-[11px] text-tx-3">
          {porc(m.ownBasePenetrationPct)} — el resto de tu base no vio nada en {m.days} días.
        </p>
      </div>

      <div className="border-t border-[var(--line-soft)] pt-3">
        <div className="flex items-baseline justify-between gap-2 text-[13px]">
          <span className="text-tx-2">Gente de afuera alcanzada</span>
          <span className="tabular-nums">{num(m.nonFollowerViewers)}</span>
        </div>
        <p className="mt-1 text-[11px] text-tx-3">
          Equivale al {porc(m.externalReachVsBasePct)} del tamaño de tu propia base.
        </p>
      </div>
    </div>
  );
}

function Churn({ s }: { s: SnapshotWithMetrics }) {
  const r = s.readings;
  const m = s.metrics;
  const max = Math.max(1, r.follows);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="text-tx-2">Empezaron a seguirte</span>
          <span className="tabular-nums">{num(r.follows)}</span>
        </div>
        <div className="mt-1.5 h-2 w-full rounded-full bg-[var(--line-soft)]">
          <div className="h-full rounded-full bg-brand-blue" style={{ width: "100%" }} />
        </div>
      </div>
      <div>
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="text-tx-2">Dejaron de seguirte</span>
          <span className="tabular-nums">{num(r.unfollows)}</span>
        </div>
        <div className="mt-1.5 h-2 w-full rounded-full bg-[var(--line-soft)]">
          <div
            className="h-full rounded-full"
            style={{ width: `${(r.unfollows / max) * 100}%`, backgroundColor: "var(--color-brand-red-text)" }}
          />
        </div>
      </div>
      <p className="mt-1 text-[12px] leading-snug text-tx-2">
        Quedaron <strong>+{num(m.followersNet)}</strong>. De cada cien que entran, {dec(m.churnPct, 0)} se van dentro
        del mismo período.
      </p>
    </div>
  );
}

const NOMBRE_HORA = (h: number) => {
  const ampm = h < 12 ? "a. m." : "p. m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${ampm}`;
};

function ScheduleCard({ s, fit }: { s: SnapshotWithMetrics; fit: ScheduleFit | null }) {
  const desde = s.bestHourFrom!;
  const hasta = s.bestHourTo!;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-tx-2">
        Tu gente está más activa{" "}
        {s.bestDays.length > 0 && <strong className="text-brand-ink">{s.bestDays.join(", ").toLowerCase()}</strong>} de{" "}
        <strong className="text-brand-ink">
          {NOMBRE_HORA(desde)} a {NOMBRE_HORA(hasta)}
        </strong>
      </p>

      {fit === null ? (
        <p className="text-[12px] text-tx-3">Cruzando con el calendario…</p>
      ) : fit.total === 0 ? (
        <p className="text-[12px] text-tx-3">
          No hay propuestas con hora legible en este período, así que no hay nada que comparar.
        </p>
      ) : (
        <>
          <div>
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="text-tx-2">Propuestas dentro de la franja</span>
              <span className="tabular-nums">
                {fit.dentro} <span className="text-[11px] text-tx-3">de {fit.total}</span>
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full rounded-full bg-[var(--line-soft)]">
              <div className="h-full rounded-full bg-brand-blue" style={{ width: `${(fit.dentro / fit.total) * 100}%` }} />
            </div>
          </div>

          {fit.fueraPorHora.length > 0 && (
            <div>
              <div className="text-[11px] tracking-label text-tx-3 uppercase">Las que caen afuera</div>
              <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-tx-2">
                {fit.fueraPorHora.slice(0, 6).map((f) => (
                  <li key={f.hora} className="tabular-nums">
                    {NOMBRE_HORA(f.hora)} · {f.cantidad}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Los límites declarados van a la vista, no escondidos. Un panel que oculta
 * su propia incertidumbre es peor que no tenerlo: alguien va a sumar el
 * desglose tarde o temprano y va a dejar de creerle a todo. */
function Limits({ s }: { s: SnapshotWithMetrics }) {
  const m = s.metrics;
  return (
    <div className="rounded-lg border border-line-2 px-4 py-3">
      <div className="text-[11px] tracking-label text-tx-3 uppercase">Qué no mide esto</div>
      <ul className="mt-2 flex flex-col gap-1.5 text-[12px] leading-snug text-tx-3">
        {m.unattributedInteractions !== 0 && (
          <li>
            <strong className="text-tx-2">
              {num(Math.abs(m.unattributedInteractions))} interacciones ({porc(Math.abs(m.unattributedPct), 1)})
            </strong>{" "}
            {m.unattributedInteractions > 0 ? "que la cabecera cuenta y el desglose por tipo no" : "de más en el desglose respecto de la cabecera"}. Es del panel de Instagram, no de la transcripción.
          </li>
        )}
        <li>
          <strong className="text-tx-2">Pauta y orgánico van mezclados.</strong> Estadísticas de Instagram no los
          separa por ventana; para eso hace falta Meta Ads Manager.
        </li>
        <li>
          <strong className="text-tx-2">No hay datos por pieza.</strong> Todo acá es de cuenta. El panel de Contenido
          muestra métricas acumuladas desde que se publicó cada post, no recortadas al período, así que no sirven para
          comparar entre piezas de distinta antigüedad.
        </li>
        {s.notes && <li className="text-tx-2">{s.notes}</li>}
      </ul>
    </div>
  );
}

/** Las lecturas tal como se cargaron, plegadas. Es lo que permite auditar
 * cualquier cifra de arriba sin abrir la base. */
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
    ["Espectadores · Publicaciones", num(r.viewersPosts)],
    ["Espectadores · Reels", num(r.viewersReels)],
    ["Espectadores · Historias", num(r.viewersStories)],
    ["Interacciones · Publicaciones", num(r.interactionsPosts)],
    ["Interacciones · Reels", num(r.interactionsReels)],
    ["Interacciones · Historias", num(r.interactionsStories)],
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
