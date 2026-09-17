import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRng } from '@shared/simulation'
import { ActivityFeed } from '../src/services/activityFeed'

const NOW = Date.UTC(2026, 0, 1, 12)

function feed(capacity = 10) {
  return new ActivityFeed({ capacity, intervalMs: 1000, rng: createRng(7), now: () => NOW })
}

afterEach(() => {
  vi.useRealTimers()
})

describe('ActivityFeed', () => {
  it('seeds events one interval apart, ending now', () => {
    const f = feed()
    f.seed(3)
    const times = f.latest(3).map((a) => Date.parse(a.created_at))
    expect(times).toEqual([NOW - 2000, NOW - 1000, NOW])
  })

  it('keeps only the most recent `capacity` events', () => {
    const f = feed(10)
    f.seed(5)
    const ticked = Array.from({ length: 20 }, () => f.tick())
    expect(f.count).toBe(10)
    expect(f.newestFirst().map((a) => a.id)).toEqual(ticked.slice(-10).reverse().map((a) => a.id))
    expect(f.get(ticked[0].id)).toBeUndefined()
    expect(f.get(ticked[19].id)).toEqual(ticked[19])
  })

  it('returns the latest events oldest first and lists newest first', () => {
    const f = feed(50)
    const ticked = Array.from({ length: 8 }, () => f.tick())
    expect(f.latest(3)).toEqual(ticked.slice(-3))
    expect(f.list(2)).toEqual({ data: [ticked[7], ticked[6]], total: 8 })
  })

  it('filters by program and country and reports the filtered total', () => {
    const f = feed(200)
    f.seed(200)
    const all = f.newestFirst()
    const us = all.filter((a) => a.country === 'US')
    expect(us.length).toBeGreaterThan(0)
    expect(f.list(5, { country: 'US' })).toEqual({ data: us.slice(0, 5), total: us.length })
    const program = all[0].program_id
    const both = all.filter((a) => a.program_id === program && a.country === all[0].country)
    expect(f.list(100, { program, country: all[0].country })).toEqual({ data: both, total: both.length })
  })

  it('notifies subscribers until they unsubscribe', () => {
    const f = feed()
    const listener = vi.fn()
    const unsubscribe = f.subscribe(listener)
    const first = f.tick()
    unsubscribe()
    f.tick()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(first)
  })

  it('generates one event per interval while started', () => {
    vi.useFakeTimers()
    const f = feed(100)
    f.start()
    f.start() // idempotent: still a single timer
    vi.advanceTimersByTime(3500)
    expect(f.count).toBe(3)
    f.stop()
    vi.advanceTimersByTime(5000)
    expect(f.count).toBe(3)
  })
})
