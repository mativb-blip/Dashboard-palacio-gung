import type { ProposalFormat, ProposalStatus } from "@/types/dashboard";

export const WEEKDAY_ABBR = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const WEEKDAY_FULL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const MONTH_FULL = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** Año mostrado en el selector de meses del calendario. */
export const YEAR = new Date().getFullYear();

/** ISO de hoy, recalculado en cada llamado (no una constante fija) — usado
 * para resaltar el día actual y para el estado inicial de la vista Post. */
export function todayIso(): string {
  return isoFromDate(new Date());
}

export const MONTHS_SHORT = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

export function daysOfMonth(year: number, monthIndex: number): Date[] {
  const total = new Date(year, monthIndex + 1, 0).getDate();
  return Array.from({ length: total }, (_, i) => new Date(year, monthIndex, i + 1));
}

export interface MonthGridCell {
  date: Date;
  inMonth: boolean;
}

/** Grilla completa de semanas (domingo a sábado) para la vista de calendario
 * de página completa — incluye los días del mes anterior/siguiente que
 * completan la primera y última semana, marcados con `inMonth: false`. */
export function monthGridDays(year: number, monthIndex: number): MonthGridCell[] {
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, monthIndex, 0).getDate();

  const cells: MonthGridCell[] = [];
  for (let i = firstWeekday - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, monthIndex - 1, daysInPrevMonth - i), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, monthIndex, d), inMonth: true });
  }
  let trailing = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ date: new Date(year, monthIndex + 1, trailing), inMonth: false });
    trailing += 1;
  }
  return cells;
}

/** Parsea "yyyy-mm-dd" como fecha local — evita el corrimiento de día que
 * causa `new Date(iso)` al interpretarlo como medianoche UTC. */
export function dateFromIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function isoFromDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function weekdayAbbr(iso: string): string {
  return WEEKDAY_ABBR[dateFromIso(iso).getDay()];
}

/** "Miércoles 15 de julio" */
export function dateLong(iso: string): string {
  const date = dateFromIso(iso);
  return `${WEEKDAY_FULL[date.getDay()]} ${date.getDate()} de ${MONTH_FULL[date.getMonth()]}`;
}

/** "{marca} · mes año" del Topbar — mes/año reales, no un string fijo. */
export function currentPlanLabel(brandName: string): string {
  const now = new Date();
  const month = MONTH_FULL[now.getMonth()];
  const capitalized = month.charAt(0).toUpperCase() + month.slice(1);
  return `${brandName} · ${capitalized} ${now.getFullYear()}`;
}

/** Iniciales para el avatar de un comentario, p. ej. "María Guzmán" → "MG". */
export function initials(name: string): string {
  const words = name.replace(/[()]/g, "").trim().split(/\s+/);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
}

/** "Ahora mismo" recién creado, "Hoy 4:20 p. m." / "Ayer 4:20 p. m." el
 * mismo día o el anterior, o una fecha corta más allá de eso. Se calcula
 * una sola vez contra la hora real al momento de pedir los comentarios
 * (mismo criterio que antes: el string quedaba fijo al crear el comentario,
 * nunca se recalculaba en vivo mientras la pantalla seguía abierta). */
export function formatCommentWhen(createdAt: Date, now: Date): string {
  const diffMs = now.getTime() - createdAt.getTime();
  if (diffMs >= 0 && diffMs < 2 * 60 * 1000) return "Ahora mismo";

  const time = createdAt.toLocaleTimeString("es-DO", { hour: "numeric", minute: "2-digit" });
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(createdAt)) / 86_400_000);

  if (dayDiff === 0) return `Hoy ${time}`;
  if (dayDiff === 1) return `Ayer ${time}`;
  return `${createdAt.toLocaleDateString("es-DO", { day: "numeric", month: "short" })} ${time}`;
}

export function toneHex(format: ProposalFormat): string {
  return format === "Historia" || format === "Reel" ? "#E81F35" : "#163F6B";
}

export function fmtShort(format: ProposalFormat): string {
  return format === "Post simple" ? "Post" : format;
}

export function isVerticalFormat(format: ProposalFormat): boolean {
  return format === "Historia" || format === "Reel";
}

const ART_LABELS = ["Portada", "Beneficio", "Detalle", "Cierre", "Modelo"];

export function artLabel(index: number, total: number): string {
  if (total === 1) return "Arte único";
  return ART_LABELS[index] ?? `Arte ${index + 1}`;
}

interface StatusPillStyle {
  background: string;
  color: string;
  borderColor: string;
}

export function statusPillStyle(status: ProposalStatus): StatusPillStyle {
  switch (status) {
    case "Aprobado":
      return { background: "#163F6B", color: "#fff", borderColor: "#163F6B" };
    case "Cambios solicitados":
      return { background: "#fff", color: "#E81F35", borderColor: "#E81F35" };
    case "En revisión":
    default:
      return { background: "#fff", color: "#4A4A52", borderColor: "#E2E2E6" };
  }
}
