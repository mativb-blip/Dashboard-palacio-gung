// Las métricas derivadas de una medición de Instagram.
//
// FUNCIÓN PURA, y exportada aparte del resto a propósito: acá vive todo lo
// que la pantalla afirma y la base no guarda. Enterrada dentro de una server
// action no habría forma de comprobarla más que mirando la pantalla y
// creyéndole — y una estadística que nadie puede auditar no vale nada.
// Ver scripts/check-instagram-metrics.ts, que la corre contra el informe de
// agosto de 2026 y compara cada resultado con la cifra publicada ahí.
//
// Nada se redondea hacia arriba ni se completa por estimación: lo que no se
// puede calcular con las lecturas cargadas vuelve como `undefined`, y la UI
// dice que falta en vez de inventar un cero.

/** Las lecturas del panel de Instagram — lo único que se carga a mano. */
export interface SnapshotReadings {
  periodStart: string;
  periodEnd: string;
  views: number;
  viewers: number;
  interactions: number;
  follows: number;
  unfollows: number;
  followersEnd: number;
  viewersFollowersPct: number;
  interactionsFollowersPct: number;
  profileVisits: number;
  bioLinkTaps: number;
  addressTaps: number;
  viewersPosts: number;
  viewersReels: number;
  viewersStories: number;
  interactionsPosts: number;
  interactionsReels: number;
  interactionsStories: number;
  likes?: number | null;
  shares?: number | null;
  saves?: number | null;
  comments?: number | null;
  reposts?: number | null;
  replies?: number | null;
}

export interface DerivedMetrics {
  /** Días que cubre la ventana, inclusive de los dos extremos. */
  days: number;
  followersStart: number;
  followersNet: number;
  followersAvgBase: number;
  growthPct: number;
  netPerDay: number;
  followsPerDay: number;
  unfollowsPerDay: number;
  /** Bajas sobre altas. 22,47 % = de cada cien que entran, veintidós se van. */
  churnPct: number;
  retentionPct: number;

  viewsPerViewer: number;
  viewsPerDay: number;
  /** Interacciones sobre cuentas alcanzadas. */
  interactionRatePct: number;
  interactionOverViewsPct: number;

  profileVisitRatePct: number;
  /** Visitas al perfil que terminaron en un seguidor nuevo. */
  visitToFollowPct: number;
  reachToFollowPct: number;
  bioLinkRatePct: number;
  addressRatePct: number;

  followerViewers: number;
  nonFollowerViewers: number;
  /** Cuánto de la propia base vio algo. El indicador central del informe. */
  ownBasePenetrationPct: number;
  reachVsBasePct: number;
  externalReachVsBasePct: number;
  followerInteractions: number;
  nonFollowerInteractions: number;

  efficiencyPostsPct: number;
  efficiencyReelsPct: number;
  efficiencyStoriesPct: number;
  /** Cuántas veces rinde más un Reel que una Publicación, por persona
   * alcanzada. `undefined` si Publicaciones quedó en cero: dividir por cero
   * daría Infinity y la pantalla mostraría "∞×". */
  reelsAdvantage?: number;

  /** Interacciones que la cabecera cuenta y el desglose por tipo no. El
   * informe lo llama "no atribuido" y son 260 (19,3 %) en agosto. Se expone
   * porque esconderlo es peor: alguien va a sumar el desglose tarde o
   * temprano y va a dejar de creerle al panel. */
  unattributedInteractions: number;
  unattributedPct: number;

  /** Solo si se cargó el desglose por acción. */
  commentsPerThousandViewers?: number;
  sharesPerLike?: number;
}

/** Días entre dos fechas ISO, contando los dos extremos. Con UTC a propósito:
 * las fechas son "yyyy-mm-dd" sin hora, y usar la zona local haría que el
 * mismo período diera 15 o 16 días según dónde esté el navegador. */
export function daysInWindow(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

/** Divide devolviendo 0 cuando no hay denominador. Un 0 acá significa "no
 * hubo de qué", que es distinto de no poder calcularlo — esos casos usan
 * `undefined` explícito más abajo. */
function ratio(parte: number, total: number): number {
  return total === 0 ? 0 : parte / total;
}

const pct = (parte: number, total: number) => ratio(parte, total) * 100;

export function deriveMetrics(r: SnapshotReadings): DerivedMetrics {
  const days = daysInWindow(r.periodStart, r.periodEnd);
  const followersNet = r.follows - r.unfollows;
  const followersStart = r.followersEnd - followersNet;
  // Base media de la ventana, no la del cierre: la penetración pregunta
  // "de los seguidores que había mientras se publicaba", y usar solo el
  // cierre la subestimaría en una cuenta que creció.
  const followersAvgBase = (followersStart + r.followersEnd) / 2;

  const followerViewers = r.viewers * (r.viewersFollowersPct / 100);
  const nonFollowerViewers = r.viewers - followerViewers;

  const interactionsBreakdown = r.interactionsPosts + r.interactionsReels + r.interactionsStories;
  const unattributedInteractions = r.interactions - interactionsBreakdown;

  const efficiencyPostsPct = pct(r.interactionsPosts, r.viewersPosts);
  const efficiencyReelsPct = pct(r.interactionsReels, r.viewersReels);

  return {
    days,
    followersStart,
    followersNet,
    followersAvgBase,
    growthPct: pct(followersNet, followersStart),
    netPerDay: ratio(followersNet, days),
    followsPerDay: ratio(r.follows, days),
    unfollowsPerDay: ratio(r.unfollows, days),
    churnPct: pct(r.unfollows, r.follows),
    retentionPct: pct(followersNet, r.follows),

    viewsPerViewer: ratio(r.views, r.viewers),
    viewsPerDay: ratio(r.views, days),
    interactionRatePct: pct(r.interactions, r.viewers),
    interactionOverViewsPct: pct(r.interactions, r.views),

    profileVisitRatePct: pct(r.profileVisits, r.viewers),
    visitToFollowPct: pct(r.follows, r.profileVisits),
    reachToFollowPct: pct(r.follows, r.viewers),
    bioLinkRatePct: pct(r.bioLinkTaps, r.profileVisits),
    addressRatePct: pct(r.addressTaps, r.profileVisits),

    followerViewers,
    nonFollowerViewers,
    ownBasePenetrationPct: pct(followerViewers, followersAvgBase),
    reachVsBasePct: pct(r.viewers, followersAvgBase),
    externalReachVsBasePct: pct(nonFollowerViewers, followersAvgBase),
    followerInteractions: r.interactions * (r.interactionsFollowersPct / 100),
    nonFollowerInteractions: r.interactions * (1 - r.interactionsFollowersPct / 100),

    efficiencyPostsPct,
    efficiencyReelsPct,
    efficiencyStoriesPct: pct(r.interactionsStories, r.viewersStories),
    reelsAdvantage: efficiencyPostsPct === 0 ? undefined : efficiencyReelsPct / efficiencyPostsPct,

    unattributedInteractions,
    unattributedPct: pct(unattributedInteractions, r.interactions),

    commentsPerThousandViewers:
      r.comments == null ? undefined : ratio(r.comments, r.viewers / 1000),
    sharesPerLike:
      r.shares == null || r.likes == null ? undefined : ratio(r.shares, r.likes),
  };
}
