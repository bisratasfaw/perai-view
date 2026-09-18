import { MAP_COLORS, getProgram, type ProgramId } from '@shared/programs'
import type { AiUsageByCountry, DeveloperCities, SdkDownloadsByCountry, WikipediaInterest } from '@shared/realData'
import { normaliseValues } from '@/globe/choropleth'
import type { CityPointDatum, CountryValue } from '@/globe/engine'
import type { LayerId } from '@/layers'
import { formatCompact } from '@/utils/format'

export interface CountryLayerData {
  geometry: 'countries'
  values: CountryValue[]
  /** Raw value per country for cards and tooltips. */
  raw: Map<string, number>
  metric: string
  format: (v: number) => string
  /** Legend endpoints, formatted. */
  range: { min: string; max: string }
}

export interface PointLayerData {
  geometry: 'points'
  points: CityPointDatum[]
  raw: Map<string, number>
  metric: string
  format: (v: number) => string
}

export type LayerData = CountryLayerData | PointLayerData

function leadingProgram(counts: Partial<Record<ProgramId, number>>): ProgramId {
  let best: ProgramId = 'other'
  let max = -1
  for (const [id, n] of Object.entries(counts) as [ProgramId, number][]) {
    if (n > max) {
      max = n
      best = id
    }
  }
  return best
}

function countryLayer(raw: Map<string, number>, mode: 'sqrt' | 'linear', metric: string, format: (v: number) => string): CountryLayerData {
  const normalised = normaliseValues(raw, mode)
  const nums = [...raw.values()].filter((v) => v > 0)
  return {
    geometry: 'countries',
    values: [...normalised].map(([cc, value]) => ({ cc, value })),
    raw,
    metric,
    format,
    range: { min: nums.length ? format(Math.min(...nums)) : '–', max: nums.length ? format(Math.max(...nums)) : '–' },
  }
}

export function usageIndexLayer(data: AiUsageByCountry): CountryLayerData {
  const raw = new Map<string, number>()
  for (const c of data.countries) if (c.usage_per_capita_index !== null) raw.set(c.cc, c.usage_per_capita_index)
  return countryLayer(raw, 'linear', 'Usage index (1 = proportional to population)', (v) => `${v.toFixed(2)}×`)
}

export function wikipediaLayer(data: WikipediaInterest): CountryLayerData {
  const raw = new Map<string, number>()
  for (const c of data.by_country) if (c.total > 0) raw.set(c.cc, c.total)
  return countryLayer(raw, 'sqrt', `Article views, last ${data.days} days`, formatCompact)
}

export function sdkDownloadsLayer(data: SdkDownloadsByCountry): CountryLayerData {
  const raw = new Map<string, number>()
  for (const c of data.countries) if (c.total > 0) raw.set(c.cc, c.total)
  return countryLayer(raw, 'sqrt', `SDK downloads, last ${data.period_days} days`, formatCompact)
}

export function developerCitiesLayer(data: DeveloperCities): PointLayerData {
  const max = Math.max(1, ...data.cities.map((c) => c.total))
  const raw = new Map<string, number>()
  const points: CityPointDatum[] = data.cities.map((c) => {
    raw.set(c.name, c.total)
    const leader = leadingProgram(c.counts)
    return {
      key: c.name,
      name: c.name,
      lat: c.lat,
      lng: c.lng,
      intensity: Math.sqrt(c.total / max),
      color: getProgram(leader)?.color ?? MAP_COLORS.other,
    }
  })
  return { geometry: 'points', points, raw, metric: 'Developers who forked an AI SDK', format: formatCompact }
}

/** Which snapshot each real layer reads. */
export const LAYER_DATA_KEY = {
  'usage-index': 'aiUsageByCountry',
  'wiki-interest': 'wikipediaInterest',
  'sdk-downloads': 'sdkDownloadsByCountry',
  'dev-cities': 'developerCities',
} as const satisfies Partial<Record<LayerId, string>>

export type RealLayerId = keyof typeof LAYER_DATA_KEY

export function isRealLayer(id: LayerId): id is RealLayerId {
  return id in LAYER_DATA_KEY
}
