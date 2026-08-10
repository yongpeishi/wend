/**
 * Date and time formatting for Wend.
 *
 * House style, from the design system's content fundamentals:
 *   - 24-hour times: `09:40`
 *   - en-dash ranges, no spaces: `10:15–11:40`
 *   - middot separators for metadata: `morning · east`
 * Numbers are written plainly. No "AM/PM", no relative fuzz like "in 3 days".
 */

const EN_DASH = '–';
export const MIDDOT = ' · ';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Parse a `YYYY-MM-DD` date string without letting the local timezone shift the day. */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y as number, (m as number) - 1, d as number);
}

/** `2026-11-02` -> `2 Nov`. */
export function formatDay(iso: string): string {
  const date = parseDay(iso);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** `2026-11-02` -> `Mon 2`, for day tabs on the schedule. */
export function formatDayTab(iso: string): string {
  const date = parseDay(iso);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
  return `${weekday} ${date.getDate()}`;
}

/**
 * A trip's date range, or null when the trip has no dates yet — which is a
 * normal, permanent state, not a gap to nag about.
 * Same month: `2–16 Nov`. Different months: `28 Oct – 3 Nov`.
 */
export function formatTripDates(
  startsOn: string | null,
  endsOn: string | null,
): string | null {
  if (!startsOn && !endsOn) return null;
  if (startsOn && !endsOn) return `From ${formatDay(startsOn)}`;
  if (!startsOn && endsOn) return `Until ${formatDay(endsOn)}`;

  const start = parseDay(startsOn as string);
  const end = parseDay(endsOn as string);
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()}${EN_DASH}${end.getDate()} ${MONTHS[start.getMonth()]}`;
  }
  return `${formatDay(startsOn as string)} ${EN_DASH} ${formatDay(endsOn as string)}`;
}

/** Minutes from midnight -> `09:40`. */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** `10:15–11:40`, or just the start when there is no end. */
export function formatTimeRange(
  startMinutes: number | null,
  endMinutes: number | null,
): string {
  if (startMinutes == null) return '';
  if (endMinutes == null) return formatMinutes(startMinutes);
  return `${formatMinutes(startMinutes)}${EN_DASH}${formatMinutes(endMinutes)}`;
}

/** `40 min`, `2 hr`, `1 hr 30 min`. Plain words, no abbreviating to "1h30". */
export function formatDuration(minutes: number | null): string | null {
  if (minutes == null) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/** `400 m` under a kilometre, else `1.2 km`. */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/** Join metadata parts with middots, dropping anything empty. */
export function joinMeta(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(MIDDOT);
}
