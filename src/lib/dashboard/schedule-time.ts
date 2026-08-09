// Helpers de fecha/hora para los recordatorios de publicación (ver
// /api/cron/reminders). Santo Domingo no tiene horario de verano, así que un
// offset fijo -04:00 es correcto todo el año — no hace falta Intl/tz db.

const SANTO_DOMINGO_OFFSET_HOURS = -4;

/** Fecha de "hoy" en Santo Domingo, como yyyy-mm-dd — para acotar la query
 * del cron a propuestas de los últimos/próximos días, no toda la tabla. */
export function todayInSantoDomingo(): string {
  const shifted = new Date(Date.now() + SANTO_DOMINGO_OFFSET_HOURS * 3600_000);
  return shifted.toISOString().slice(0, 10);
}

/** Combina `Proposal.date` ("yyyy-mm-dd") y `Proposal.time` (texto libre
 * tipo "6:30 PM", cargado a mano en Cargar propuesta) en un instante real.
 * Devuelve null si `time` no matchea el formato esperado — un cron corriendo
 * solo no debe romper por un dato viejo o mal tipeado. */
export function parseProposalDateTime(date: string, time: string): Date | null {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === "PM" && hour !== 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;

  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  const parsed = new Date(`${date}T${hh}:${mm}:00-04:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
