import type { RealDataKey, SourceId } from '@shared/realData'

/**
 * Map layers. Simulated layers draw the deterministic simulation; real layers draw a snapshot
 * from /data/real and say where it came from.
 */
export type LayerId = 'activity' | 'heat' | 'usage-index' | 'wiki-interest' | 'dev-cities' | 'sdk-downloads'

export interface LayerDef {
  id: LayerId
  label: string
  short: string
  kind: 'simulated' | 'real'
  /** Country choropleth or city points. */
  geometry: 'points' | 'countries'
  /** Snapshot the layer needs, for real layers. */
  data?: RealDataKey
  /** Manifest entry that describes the snapshot's provenance. */
  source?: SourceId
  description: string
}

export const LAYERS: readonly LayerDef[] = [
  { id: 'activity', label: 'Activity (simulated)', short: 'Activity', kind: 'simulated', geometry: 'points', description: 'Beams per city sized by simulated activity right now.' },
  { id: 'heat', label: 'Heat map (simulated)', short: 'Heat map', kind: 'simulated', geometry: 'points', description: 'A continuous glow of simulated activity.' },
  { id: 'usage-index', label: 'Claude usage by country', short: 'Usage index', kind: 'real', geometry: 'countries', data: 'aiUsageByCountry', source: 'anthropic_economic_index', description: 'Anthropic Economic Index: usage share relative to working-age population.' },
  { id: 'wiki-interest', label: 'Wikipedia interest by country', short: 'Wikipedia', kind: 'real', geometry: 'countries', data: 'wikipediaInterest', source: 'wikipedia_pageviews', description: 'Views of the assistants’ Wikipedia articles per country, last 30 days.' },
  { id: 'dev-cities', label: 'Developers by city', short: 'Developers', kind: 'real', geometry: 'points', data: 'developerCities', source: 'github_forks', description: 'GitHub users who forked the official AI SDKs, by self-reported location.' },
  { id: 'sdk-downloads', label: 'SDK downloads by country', short: 'SDK downloads', kind: 'real', geometry: 'countries', data: 'sdkDownloadsByCountry', source: 'pypi_downloads', description: 'PyPI downloads of the official Python SDKs per country, last 7 days.' },
]

const BY_ID = new Map(LAYERS.map((l) => [l.id, l]))

export function getLayer(id: string): LayerDef | undefined {
  return BY_ID.get(id as LayerId)
}

export function isLayerId(id: string | null | undefined): id is LayerId {
  return Boolean(id && BY_ID.has(id as LayerId))
}
