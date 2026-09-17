import { afterEach, describe, expect, it, vi } from 'vitest'
import { EVENT_INTERVAL_MS } from '@shared/simulation'
import { createLocalSource } from './localSource'
import type { Activity, ConnectionState } from './types'

afterEach(() => {
  vi.useRealTimers()
})

describe('local (in-browser) data source', () => {
  it('serves the shared simulation', async () => {
    const source = createLocalSource(() => Date.parse('2026-09-17T12:00:00Z'))
    expect(source.kind).toBe('local')
    const stats = await source.getGlobalStats()
    expect(stats.simulated).toBe(true)
    expect(await source.getTrends(6)).toHaveLength(6)
    expect((await source.getRegional('Berlin'))?.region.country).toBe('DE')
    expect(await source.getRegional('Nowhere')).toBeNull()
    const intensities = await source.getCityIntensities()
    expect(intensities.every((c) => c.intensity >= 0 && c.intensity <= 1)).toBe(true)
  })

  it('streams a backlog, then new events, and stops when unsubscribed', () => {
    vi.useFakeTimers()
    const source = createLocalSource()
    const events: Activity[] = []
    const states: ConnectionState[] = []
    const unsubscribe = source.subscribe({ onActivity: (a) => events.push(a), onState: (s) => states.push(s) })

    expect(events).toHaveLength(5)
    expect(states).toEqual(['live'])

    vi.advanceTimersByTime(EVENT_INTERVAL_MS * 10)
    const afterStreaming = events.length
    expect(afterStreaming).toBeGreaterThan(8)

    unsubscribe()
    vi.advanceTimersByTime(EVENT_INTERVAL_MS * 10)
    expect(events).toHaveLength(afterStreaming)
  })
})
