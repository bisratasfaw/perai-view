const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const whole = new Intl.NumberFormat('en')

/** 1234567 → "1.2M" */
export function formatCompact(n: number): string {
  return compact.format(n)
}

/** 1234567 → "1,234,567" */
export function formatNumber(n: number): string {
  return whole.format(Math.round(n))
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

/** Seconds ago → "just now", "12s ago", "3m ago". */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.round(minutes / 60)}h ago`
}

/** Decimal local hour (e.g. 14.5) → "14:30". */
export function formatHour(hour: number): string {
  const h = Math.floor(hour) % 24
  const m = Math.floor((hour - Math.floor(hour)) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** ISO timestamp → "14:00" in the viewer's time zone. */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
