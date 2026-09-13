/**
 * Corre deriveMetrics() contra el informe de Instagram del 16 al 31 de agosto
 * de 2026 y compara cada resultado con la cifra publicada ahí.
 *
 *   npx tsx scripts/check-instagram-metrics.ts
 *
 * POR QUÉ EXISTE: /evolucion afirma treinta cifras que la base no guarda —
 * las guarda como diecisiete lecturas y calcula el resto. Sin esto, la única
 * forma de saber si una fórmula está bien sería mirar la pantalla y creerle.
 * El informe de agosto trae sus propios resultados, así que sirve de banco de
 * pruebas: si una fórmula se rompe al refactorizar, esto lo dice.
 *
 * No necesita credenciales ni base: es una función pura con datos fijos.
 */

import { deriveMetrics, daysInWindow, type SnapshotReadings } from "../src/lib/dashboard/instagram-metrics";

/** Las lecturas del panel, tal cual figuran en §3.1–§3.4 del informe. */
const AGOSTO_2026: SnapshotReadings = {
  periodStart: "2026-08-16",
  periodEnd: "2026-08-31",
  views: 102_487,
  viewers: 42_427,
  interactions: 1_348,
  follows: 632,
  unfollows: 142,
  followersEnd: 43_427,
  viewersFollowersPct: 24.7,
  interactionsFollowersPct: 56.7,
  profileVisits: 4_194,
  bioLinkTaps: 0,
  addressTaps: 168,
  viewersPosts: 28_000,
  viewersReels: 14_000,
  viewersStories: 6_300,
  interactionsPosts: 283,
  interactionsReels: 756,
  interactionsStories: 49,
  likes: 587,
  shares: 274,
  comments: 16,
  saves: 195,
  reposts: 11,
  replies: 3,
};

interface Caso {
  etiqueta: string;
  obtenido: number | undefined;
  esperado: number;
  /** Tolerancia absoluta. El informe publica sus derivadas redondeadas a dos
   * decimales, así que comparar por igualdad exacta fallaría por el redondeo
   * de él, no por un error nuestro. */
  tolerancia: number;
}

function main() {
  const m = deriveMetrics(AGOSTO_2026);

  const casos: Caso[] = [
    // §3.6, con el número de fila del informe entre paréntesis
    { etiqueta: "Ventana en días", obtenido: m.days, esperado: 16, tolerancia: 0 },
    { etiqueta: "(—) Seguidores al inicio", obtenido: m.followersStart, esperado: 42_937, tolerancia: 0 },
    { etiqueta: "(—) Seguidores netos ★", obtenido: m.followersNet, esperado: 490, tolerancia: 0 },
    { etiqueta: "(—) Base media de la ventana", obtenido: m.followersAvgBase, esperado: 43_182, tolerancia: 0 },
    { etiqueta: "(1) Frecuencia de visualización", obtenido: m.viewsPerViewer, esperado: 2.42, tolerancia: 0.01 },
    { etiqueta: "(2) Visualizaciones diarias", obtenido: m.viewsPerDay, esperado: 6_405, tolerancia: 1 },
    { etiqueta: "(3) Interacción sobre alcance ★", obtenido: m.interactionRatePct, esperado: 3.18, tolerancia: 0.01 },
    { etiqueta: "(4) Interacción sobre visualizaciones", obtenido: m.interactionOverViewsPct, esperado: 1.32, tolerancia: 0.01 },
    { etiqueta: "(5) Tasa de clic al perfil", obtenido: m.profileVisitRatePct, esperado: 9.89, tolerancia: 0.01 },
    { etiqueta: "(6) Conversión perfil → seguidor ★", obtenido: m.visitToFollowPct, esperado: 15.07, tolerancia: 0.01 },
    { etiqueta: "(7) Conversión alcance → seguidor", obtenido: m.reachToFollowPct, esperado: 1.49, tolerancia: 0.01 },
    { etiqueta: "(8) Altas diarias", obtenido: m.followsPerDay, esperado: 39.5, tolerancia: 0.05 },
    { etiqueta: "(9) Bajas diarias", obtenido: m.unfollowsPerDay, esperado: 8.9, tolerancia: 0.05 },
    { etiqueta: "(10) Crecimiento neto diario", obtenido: m.netPerDay, esperado: 30.6, tolerancia: 0.05 },
    { etiqueta: "(11) Churn de la ventana ★", obtenido: m.churnPct, esperado: 22.47, tolerancia: 0.01 },
    { etiqueta: "(12) Retención neta del alta", obtenido: m.retentionPct, esperado: 77.53, tolerancia: 0.01 },
    { etiqueta: "(13) Crecimiento de la ventana", obtenido: m.growthPct, esperado: 1.14, tolerancia: 0.01 },
    { etiqueta: "(14) Intención de visita física ★", obtenido: m.addressRatePct, esperado: 4.01, tolerancia: 0.01 },
    { etiqueta: "(15) Activación del enlace de bio", obtenido: m.bioLinkRatePct, esperado: 0, tolerancia: 0 },
    { etiqueta: "(16) Espectadores ya seguidores", obtenido: m.followerViewers, esperado: 10_479, tolerancia: 1 },
    { etiqueta: "(17) Espectadores no seguidores", obtenido: m.nonFollowerViewers, esperado: 31_948, tolerancia: 1 },
    { etiqueta: "(18) Penetración en la base propia ★", obtenido: m.ownBasePenetrationPct, esperado: 24.27, tolerancia: 0.01 },
    { etiqueta: "(19) Alcance total vs. base", obtenido: m.reachVsBasePct, esperado: 98.25, tolerancia: 0.01 },
    { etiqueta: "(20) Captación externa vs. base", obtenido: m.externalReachVsBasePct, esperado: 73.98, tolerancia: 0.01 },
    { etiqueta: "(21) Interacciones de seguidores", obtenido: m.followerInteractions, esperado: 764, tolerancia: 1 },
    { etiqueta: "(22) Interacciones de no seguidores", obtenido: m.nonFollowerInteractions, esperado: 584, tolerancia: 1 },
    { etiqueta: "(23) Eficiencia — Reels", obtenido: m.efficiencyReelsPct, esperado: 5.4, tolerancia: 0.01 },
    { etiqueta: "(24) Eficiencia — Publicaciones", obtenido: m.efficiencyPostsPct, esperado: 1.01, tolerancia: 0.01 },
    { etiqueta: "(25) Eficiencia — Historias", obtenido: m.efficiencyStoriesPct, esperado: 0.78, tolerancia: 0.01 },
    { etiqueta: "(26) Ventaja Reels vs. Publicaciones ★", obtenido: m.reelsAdvantage, esperado: 5.34, tolerancia: 0.02 },
    { etiqueta: "(29) Compartidos por me gusta", obtenido: m.sharesPerLike, esperado: 0.47, tolerancia: 0.01 },
    { etiqueta: "(30) Comentarios por mil espectadores", obtenido: m.commentsPerThousandViewers, esperado: 0.38, tolerancia: 0.01 },
    // §3.7, anomalía 1: la cabecera y el desglose no cuadran, y el panel lo dice
    { etiqueta: "(§3.7) Interacciones sin atribuir", obtenido: m.unattributedInteractions, esperado: 260, tolerancia: 0 },
    { etiqueta: "(§3.7) % sin atribuir", obtenido: m.unattributedPct, esperado: 19.3, tolerancia: 0.05 },
  ];

  let fallaron = 0;
  for (const c of casos) {
    const ok = c.obtenido !== undefined && Math.abs(c.obtenido - c.esperado) <= c.tolerancia;
    if (!ok) fallaron++;
    const valor = c.obtenido === undefined ? "sin dato" : c.obtenido.toFixed(2);
    console.log(
      `  ${ok ? "ok  " : "FALLA"}  ${c.etiqueta.padEnd(42)} calculado ${valor.padStart(10)}  informe ${c.esperado.toFixed(2).padStart(10)}`,
    );
  }

  // Comprobación aparte: los días se cuentan inclusive de los dos extremos.
  const rangos: [string, string, number][] = [
    ["2026-08-16", "2026-08-31", 16],
    ["2026-09-01", "2026-09-30", 30],
    ["2026-08-31", "2026-08-31", 1],
    ["2026-08-31", "2026-08-16", 0], // al revés = 0, no un negativo
  ];
  for (const [a, b, esperado] of rangos) {
    const obtenido = daysInWindow(a, b);
    const ok = obtenido === esperado;
    if (!ok) fallaron++;
    console.log(`  ${ok ? "ok  " : "FALLA"}  días ${a} → ${b}`.padEnd(52) + `calculado ${obtenido}  esperado ${esperado}`);
  }

  console.log(
    `\n${fallaron === 0 ? "Todo coincide con el informe" : `${fallaron} diferencia(s) con el informe`} — ${casos.length + rangos.length} comprobaciones`,
  );
  if (fallaron > 0) process.exit(1);
}

main();
