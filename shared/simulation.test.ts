import { describe, expect, it } from 'vitest'
import { CITIES, countryName, findCity } from './cities'
import { classifyByKeywords } from './classify'
import { ACTIVITY_TYPES, MAP_COLORS, PROGRAMS, getProgram } from './programs'
import {
  cityIntensities,
  computeGlobalStats,
  computeHeatmap,
  computeRegionalStats,
  computeTrends,
  createRng,
  diurnal,
  generateActivity,
  localHour,
} from './simulation'

const NOON_UTC = Date.parse('2026-09-17T12:00:00Z')

describe('city data', () => {
  it('has valid, unique cities', () => {
    expect(CITIES.length).toBeGreaterThan(200)
    expect(new Set(CITIES.map((c) => c.name.toLowerCase())).size).toBe(CITIES.length)
    for (const c of CITIES) {
      expect(c.lat).toBeGreaterThanOrEqual(-90)
      expect(c.lat).toBeLessThanOrEqual(90)
      expect(c.lng).toBeGreaterThanOrEqual(-180)
      expect(c.lng).toBeLessThanOrEqual(180)
      expect(c.weight).toBeGreaterThanOrEqual(1)
      expect(c.weight).toBeLessThanOrEqual(100)
      expect(c.cc).toMatch(/^[A-Z]{2}$/)
      expect(getProgram(c.program)).toBeDefined()
    }
  })

  it('resolves country names and finds cities case-insensitively', () => {
    expect(countryName('JP')).toBe('Japan')
    expect(countryName('XK')).toBe('Kosovo')
    expect(findCity('  tOKyo ')?.name).toBe('Tokyo')
    expect(findCity('Atlantis')).toBeUndefined()
  })
})

describe('program registry', () => {
  it('gives only the three highlighted assistants their own map colour', () => {
    const highlighted = PROGRAMS.filter((p) => p.highlighted).map((p) => p.id)
    expect(highlighted.sort()).toEqual(['chatgpt', 'claude', 'gemini'])
    for (const p of PROGRAMS.filter((p) => !p.highlighted)) expect(p.color).toBe(MAP_COLORS.other)
  })

  it('only uses known activity types in activity mixes', () => {
    const ids = new Set<string>(ACTIVITY_TYPES.map((t) => t.id))
    for (const p of PROGRAMS) for (const key of Object.keys(p.activityMix)) expect(ids.has(key)).toBe(true)
  })
})

describe('time of day', () => {
  it('keeps diurnal activity between 0 and 1 and wraps at midnight', () => {
    for (let h = -24; h <= 48; h += 0.25) {
      const v = diurnal(h)
      expect(v).toBeGreaterThan(0)
      expect(v).toBeLessThanOrEqual(1)
    }
    expect(diurnal(0)).toBeCloseTo(diurnal(24), 10)
    expect(diurnal(14)).toBeGreaterThan(diurnal(3) * 3)
  })

  it('derives local solar time from longitude', () => {
    expect(localHour(0, NOON_UTC)).toBeCloseTo(12)
    expect(localHour(90, NOON_UTC)).toBeCloseTo(18)
    expect(localHour(-165, NOON_UTC)).toBeCloseTo(1)
  })

  it('makes daylit cities busier than cities at night', () => {
    const levels = new Map(cityIntensities(NOON_UTC).map((c) => [c.city.name, c.intensity]))
    // London (≈12:00) vs. Los Angeles (≈04:00): similar weights, very different local time.
    expect(levels.get('London')!).toBeGreaterThan(levels.get('Los Angeles')! * 3)
  })
})

describe('aggregates', () => {
  const stats = computeGlobalStats(NOON_UTC)

  it('is deterministic for the same instant', () => {
    expect(computeGlobalStats(NOON_UTC)).toEqual(stats)
  })

  it('keeps program totals consistent with the grand total', () => {
    const sum = stats.top_programs.reduce((s, p) => s + p.activity_count, 0)
    expect(Math.abs(sum - stats.total_activities_24h) / stats.total_activities_24h).toBeLessThan(0.001)
    const pct = stats.top_programs.reduce((s, p) => s + p.percentage, 0)
    expect(pct).toBeGreaterThan(99.5)
    expect(pct).toBeLessThan(100.5)
    expect(stats.top_programs.map((p) => p.activity_count)).toEqual(
      [...stats.top_programs.map((p) => p.activity_count)].sort((a, b) => b - a),
    )
  })

  it('reports ten busiest regions in descending order and real counts', () => {
    expect(stats.top_regions).toHaveLength(10)
    const counts = stats.top_regions.map((r) => r.activity_count)
    expect(counts).toEqual([...counts].sort((a, b) => b - a))
    expect(stats.active_cities).toBe(CITIES.length)
    expect(stats.active_countries).toBe(new Set(CITIES.map((c) => c.cc)).size)
    expect(stats.simulated).toBe(true)
  })

  it('returns hourly trends aligned to whole hours', () => {
    const trends = computeTrends(NOON_UTC + 25 * 60_000, 24)
    expect(trends).toHaveLength(24)
    for (const point of trends) expect(new Date(point.timestamp).getUTCMinutes()).toBe(0)
    expect(Date.parse(trends[23].timestamp)).toBe(NOON_UTC - 3_600_000)
  })

  it('returns regional stats for known cities only', () => {
    expect(computeRegionalStats('Nowhere', NOON_UTC)).toBeNull()
    const tokyo = computeRegionalStats('tokyo', NOON_UTC)!
    expect(tokyo.region.city).toBe('Tokyo')
    expect(tokyo.statistics.local_hour).toBeCloseTo(21.3, 1)
    expect(tokyo.statistics.current_intensity).toBeGreaterThan(0)
  })

  it('reports the same 24-hour total for a city in the rankings and in its details', () => {
    for (const region of stats.top_regions) {
      expect(computeRegionalStats(region.city, NOON_UTC)!.statistics.activity_24h).toBe(region.activity_count)
    }
  })

  it('produces a GeoJSON heatmap with one feature per city', () => {
    const heat = computeHeatmap(NOON_UTC)
    expect(heat.type).toBe('FeatureCollection')
    expect(heat.features).toHaveLength(CITIES.length)
    const [lng, lat] = heat.features[0].geometry.coordinates
    expect(lng).toBe(CITIES[0].lng)
    expect(lat).toBe(CITIES[0].lat)
  })
})

describe('live events', () => {
  it('generates valid events with a seeded RNG', () => {
    const rng = createRng(7)
    const types = new Set<string>(ACTIVITY_TYPES.map((t) => t.id))
    const ids = new Set<string>()
    for (let i = 0; i < 500; i++) {
      const a = generateActivity(rng, NOON_UTC)
      expect(getProgram(a.program_id)?.name).toBe(a.program_name)
      expect(types.has(a.activity_type)).toBe(true)
      const city = findCity(a.city)!
      expect(Math.abs(a.latitude - city.lat)).toBeLessThanOrEqual(0.2)
      expect(a.duration_seconds).toBeGreaterThan(0)
      ids.add(a.id)
    }
    expect(ids.size).toBe(500)
  })

  it('draws more events from daylit regions', () => {
    const rng = createRng(1)
    let europe = 0
    let americas = 0
    for (let i = 0; i < 3000; i++) {
      const { longitude } = generateActivity(rng, NOON_UTC)
      if (longitude > -15 && longitude < 45) europe++
      if (longitude < -60) americas++
    }
    expect(europe).toBeGreaterThan(americas)
  })

  it('only draws Midjourney events as image generation', () => {
    const rng = createRng(3)
    for (let i = 0; i < 2000; i++) {
      const a = generateActivity(rng, NOON_UTC)
      if (a.program_id === 'midjourney') expect(a.activity_type).toBe('image_generation')
    }
  })
})

describe('keyword classifier fallback', () => {
  it.each([
    ['Fix this TypeScript function, it throws an error', 'coding'],
    ['Translate this paragraph into English please', 'translation'],
    ['Summarize the key points of this article', 'summarization'],
    ['Draw a logo illustration of a fox', 'image_generation'],
  ])('%s → %s', (text, expected) => {
    const result = classifyByKeywords(text)
    expect(result.activity_type).toBe(expected)
    expect(result.source).toBe('keyword-fallback')
    const total = Object.values(result.scores).reduce((s, v) => s + v, 0)
    expect(total).toBeCloseTo(1, 2)
  })
})
