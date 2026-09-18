const DAY_MS = 86_400_000

/** YYYY-MM-DD in UTC. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function parseIsoDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

export function addDays(iso: string, days: number): string {
  return toIsoDate(new Date(parseIsoDate(iso).getTime() + days * DAY_MS))
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / DAY_MS)
}

/** Every date from start to end, inclusive, oldest first. */
export function dateRange(start: string, end: string): string[] {
  const days: string[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d)
  return days
}

/** "20260917" as used by the Wikimedia REST API. */
export function compactDate(iso: string): string {
  return iso.replaceAll('-', '')
}

/** "May 2026" for the first day of a month. */
export function monthLabel(iso: string): string {
  return parseIsoDate(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** The last `count` complete UTC days, ending yesterday. */
export function lastFullDays(now: Date, count: number): { start: string; end: string; days: string[] } {
  const end = addDays(toIsoDate(now), -1)
  const start = addDays(end, -(count - 1))
  return { start, end, days: dateRange(start, end) }
}
