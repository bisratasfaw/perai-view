/**
 * Deterministic simulation of global AI-assistant activity.
 *
 * Everything here is synthetic. Activity in a city follows a daily curve on
 * the city's approximate local time (longitude / 15), so the busy side of the
 * planet follows the sun. The backend API and the static browser demo both call
 * these functions, so the two data sources behave identically.
 */
import { CITIES, countryName, findCity, type City } from './cities'
import { ACTIVITY_TYPES, PROGRAMS, getProgram, type ActivityTypeId, type ProgramId } from './programs'

export const SIMULATION_VERSION = '2.0.0'
export const EVENT_INTERVAL_MS = 3000

const HOUR_MS = 3_600_000
/** Simulated events per hour for a weight-100 city at its daily peak. */
const HOURLY_SCALE = 250
/** Share of a city's activity that goes to its leading assistant. */
const LEADER_SHARE = 0.45
const USERS_PER_ACTIVITY = 0.31

export interface Activity {
  id: string
  program_id: ProgramId
  program_name: string
  city: string
  country: string
  country_name: string
  latitude: number
  longitude: number
  activity_type: ActivityTypeId
  duration_seconds: number
  created_at: string
}

export interface ProgramStat {
  program_id: ProgramId
  program_name: string
  activity_count: number
  percentage: number
}

export interface RegionStat {
  city: string
  country: string
  country_name: string
  latitude: number
  longitude: number
  activity_count: number
}

export interface GlobalStats {
  total_activities_24h: number
  active_users_24h: number
  total_programs: number
  active_cities: number
  active_countries: number
  top_programs: ProgramStat[]
  top_regions: RegionStat[]
  activity_by_type: { type: ActivityTypeId; label: string; count: number }[]
  timestamp: string
  simulated: true
}

export interface TrendPoint {
  timestamp: string
  activity_count: number
  unique_users: number
}

export interface RegionalStats {
  region: { city: string; country: string; country_name: string; latitude: number; longitude: number }
  statistics: {
    activity_24h: number
    active_users_24h: number
    leading_program: ProgramId
    top_activity_type: ActivityTypeId
    local_hour: number
    current_intensity: number
  }
  timestamp: string
  simulated: true
}

export interface CityIntensity {
  city: City
  /** 0–1: the city's activity right now relative to the busiest possible city. */
  intensity: number
}

// ── Random numbers ────────────────────────────────────────────────────────────

export type Rng = () => number

/** Small, fast, seedable PRNG (mulberry32). */
export function createRng(seed: number): Rng {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

function pickWeighted<T>(rng: Rng, items: readonly T[], weight: (item: T) => number): T {
  let total = 0
  for (const item of items) total += Math.max(0, weight(item))
  let r = rng() * total
  for (const item of items) {
    r -= Math.max(0, weight(item))
    if (r <= 0) return item
  }
  return items[items.length - 1]
}

/** ±pct noise that stays constant for a given key (e.g. minute or hour bucket). */
function stableNoise(key: number, pct: number): number {
  return 1 + (createRng(key)() - 0.5) * 2 * pct
}

// ── Time of day ───────────────────────────────────────────────────────────────

function gauss(x: number, mu: number, sigma: number): number {
  return Math.exp(-((x - mu) ** 2) / (2 * sigma ** 2))
}

function rawDiurnal(hour: number): number {
  // Morning and afternoon work peaks, a smaller evening bump, quiet nights.
  return 0.12 + 0.55 * gauss(hour, 10.5, 2.6) + 0.7 * gauss(hour, 15, 2.8) + 0.3 * gauss(hour, 21, 1.8)
}

const DIURNAL_MAX = (() => {
  let max = 0
  for (let h = 0; h < 24; h += 0.05) max = Math.max(max, rawDiurnal(h))
  return max
})()

/** Relative activity (0–1) at a local hour (0–24). */
export function diurnal(localHour: number): number {
  const h = ((localHour % 24) + 24) % 24
  // Wrap so 23:59 and 00:00 match.
  return Math.max(rawDiurnal(h), rawDiurnal(h + 24), rawDiurnal(h - 24)) / DIURNAL_MAX
}

/** Approximate solar local hour from longitude. */
export function localHour(lng: number, time: number): number {
  const utcHours = (((time % 86_400_000) + 86_400_000) % 86_400_000) / HOUR_MS
  return (((utcHours + lng / 15) % 24) + 24) % 24
}

/** Current activity level of every city, 0–1. */
export function cityIntensities(now: number): CityIntensity[] {
  return CITIES.map((city) => ({ city, intensity: (city.weight / 100) * diurnal(localHour(city.lng, now)) }))
}

function cityHourlyCount(city: City, time: number): number {
  return city.weight * diurnal(localHour(city.lng, time)) * HOURLY_SCALE
}

function city24hCount(city: City, now: number): number {
  let sum = 0
  for (let i = 0; i < 24; i++) sum += cityHourlyCount(city, now - i * HOUR_MS - HOUR_MS / 2)
  return sum
}

// ── Aggregates ────────────────────────────────────────────────────────────────

const TOTAL_SHARE = PROGRAMS.reduce((s, p) => s + p.share, 0)

function programSplit(city: City): Map<ProgramId, number> {
  const split = new Map<ProgramId, number>()
  for (const p of PROGRAMS) {
    const base = (1 - LEADER_SHARE) * (p.share / TOTAL_SHARE)
    split.set(p.id, base + (p.id === city.program ? LEADER_SHARE : 0))
  }
  return split
}

function typeSplit(programId: ProgramId): Map<ActivityTypeId, number> {
  const mix = getProgram(programId)?.activityMix ?? {}
  const total = Object.values(mix).reduce((s, v) => s + (v ?? 0), 0) || 1
  const split = new Map<ActivityTypeId, number>()
  for (const t of ACTIVITY_TYPES) split.set(t.id, (mix[t.id] ?? 0) / total)
  return split
}

export function computeGlobalStats(now: number): GlobalStats {
  const minuteNoise = stableNoise(Math.floor(now / 60_000), 0.015)
  const programTotals = new Map<ProgramId, number>()
  const typeTotals = new Map<ActivityTypeId, number>()
  const regions: RegionStat[] = []
  let total = 0

  for (const city of CITIES) {
    const count = city24hCount(city, now) * minuteNoise
    total += count
    regions.push({
      city: city.name,
      country: city.cc,
      country_name: countryName(city.cc),
      latitude: city.lat,
      longitude: city.lng,
      activity_count: Math.round(count),
    })
    for (const [pid, share] of programSplit(city)) {
      const programCount = count * share
      programTotals.set(pid, (programTotals.get(pid) ?? 0) + programCount)
      for (const [tid, tShare] of typeSplit(pid)) {
        typeTotals.set(tid, (typeTotals.get(tid) ?? 0) + programCount * tShare)
      }
    }
  }

  const topPrograms = PROGRAMS.map((p) => ({
    program_id: p.id,
    program_name: p.name,
    activity_count: Math.round(programTotals.get(p.id) ?? 0),
    percentage: Math.round(((programTotals.get(p.id) ?? 0) / total) * 1000) / 10,
  })).sort((a, b) => b.activity_count - a.activity_count)

  return {
    total_activities_24h: Math.round(total),
    active_users_24h: Math.round(total * USERS_PER_ACTIVITY),
    total_programs: PROGRAMS.length,
    active_cities: CITIES.length,
    active_countries: new Set(CITIES.map((c) => c.cc)).size,
    top_programs: topPrograms,
    top_regions: regions.sort((a, b) => b.activity_count - a.activity_count).slice(0, 10),
    activity_by_type: ACTIVITY_TYPES.map((t) => ({ type: t.id, label: t.label, count: Math.round(typeTotals.get(t.id) ?? 0) }))
      .sort((a, b) => b.count - a.count),
    timestamp: new Date(now).toISOString(),
    simulated: true,
  }
}

/** Hourly activity for the last `hours` complete hours, oldest first. */
export function computeTrends(now: number, hours = 24): TrendPoint[] {
  const currentHour = Math.floor(now / HOUR_MS) * HOUR_MS
  const points: TrendPoint[] = []
  for (let i = hours; i >= 1; i--) {
    const start = currentHour - i * HOUR_MS
    let count = 0
    for (const city of CITIES) count += cityHourlyCount(city, start + HOUR_MS / 2)
    count *= stableNoise(start / HOUR_MS, 0.03)
    points.push({
      timestamp: new Date(start).toISOString(),
      activity_count: Math.round(count),
      unique_users: Math.round(count * USERS_PER_ACTIVITY * 1.9),
    })
  }
  return points
}

export function computeRegionalStats(cityName: string, now: number): RegionalStats | null {
  const city = findCity(cityName)
  if (!city) return null
  // Same per-minute noise as computeGlobalStats, so a city's total matches its ranking entry.
  const count = city24hCount(city, now) * stableNoise(Math.floor(now / 60_000), 0.015)
  const leaderTypes = [...typeSplit(city.program)].sort((a, b) => b[1] - a[1])
  const hour = localHour(city.lng, now)
  return {
    region: { city: city.name, country: city.cc, country_name: countryName(city.cc), latitude: city.lat, longitude: city.lng },
    statistics: {
      activity_24h: Math.round(count),
      active_users_24h: Math.round(count * USERS_PER_ACTIVITY),
      leading_program: city.program,
      top_activity_type: leaderTypes[0][0],
      local_hour: Math.round(hour * 10) / 10,
      current_intensity: Math.round((city.weight / 100) * diurnal(hour) * 1000) / 1000,
    },
    timestamp: new Date(now).toISOString(),
    simulated: true,
  }
}

export interface HeatmapFeatureCollection {
  type: 'FeatureCollection'
  features: {
    type: 'Feature'
    properties: { city: string; country: string; activity_24h: number; intensity: number }
    geometry: { type: 'Point'; coordinates: [number, number] }
  }[]
  simulated: true
}

export function computeHeatmap(now: number): HeatmapFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: cityIntensities(now).map(({ city, intensity }) => ({
      type: 'Feature',
      properties: {
        city: city.name,
        country: city.cc,
        activity_24h: Math.round(city24hCount(city, now)),
        intensity: Math.round(intensity * 1000) / 1000,
      },
      geometry: { type: 'Point', coordinates: [city.lng, city.lat] },
    })),
    simulated: true,
  }
}

// ── Live events ───────────────────────────────────────────────────────────────

const DURATION_RANGE: Record<ActivityTypeId, [number, number]> = {
  conversation: [30, 900],
  writing: [60, 1200],
  coding: [20, 1500],
  image_generation: [15, 180],
  summarization: [10, 240],
  translation: [5, 180],
  research: [30, 600],
}

let eventCounter = 0

/** One simulated activity. Cities in daylight are proportionally more likely. */
export function generateActivity(rng: Rng, now: number): Activity {
  const city = pickWeighted(rng, CITIES, (c) => c.weight * diurnal(localHour(c.lng, now)))
  const program = rng() < LEADER_SHARE
    ? getProgram(city.program)!
    : pickWeighted(rng, PROGRAMS, (p) => p.share)
  const mix = program.activityMix
  const type = pickWeighted(rng, ACTIVITY_TYPES, (t) => mix[t.id] ?? 0).id
  const [minDur, maxDur] = DURATION_RANGE[type]
  eventCounter = (eventCounter + 1) % 1_000_000

  return {
    id: `${now.toString(36)}-${eventCounter.toString(36)}-${Math.floor(rng() * 1e6).toString(36)}`,
    program_id: program.id,
    program_name: program.name,
    city: city.name,
    country: city.cc,
    country_name: countryName(city.cc),
    latitude: Math.round((city.lat + (rng() - 0.5) * 0.4) * 10_000) / 10_000,
    longitude: Math.round((city.lng + (rng() - 0.5) * 0.4) * 10_000) / 10_000,
    activity_type: type,
    duration_seconds: Math.round(minDur + rng() * (maxDur - minDur)),
    created_at: new Date(now).toISOString(),
  }
}
