import { describe, expect, it } from 'vitest'
import { formatCompact, formatHour, formatNumber, formatPercent, formatRelative } from './format'

describe('format', () => {
  it('formats compact and whole numbers', () => {
    expect(formatCompact(1_234_567)).toBe('1.2M')
    expect(formatCompact(950)).toBe('950')
    expect(formatNumber(1234567.4)).toBe('1,234,567')
    expect(formatPercent(41.26)).toBe('41.3%')
  })

  it('formats relative times', () => {
    const now = Date.parse('2026-09-17T12:00:00Z')
    expect(formatRelative('2026-09-17T11:59:58Z', now)).toBe('just now')
    expect(formatRelative('2026-09-17T11:59:30Z', now)).toBe('30s ago')
    expect(formatRelative('2026-09-17T11:57:00Z', now)).toBe('3m ago')
    expect(formatRelative('2026-09-17T09:00:00Z', now)).toBe('3h ago')
    expect(formatRelative('2026-09-17T12:00:05Z', now)).toBe('just now')
  })

  it('formats decimal hours as a clock', () => {
    expect(formatHour(14.5)).toBe('14:30')
    expect(formatHour(0.1)).toBe('00:06')
    expect(formatHour(23.99)).toBe('23:59')
  })
})
