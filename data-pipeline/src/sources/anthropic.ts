import { activityTypeSeriesSchema, aiUsageByCountrySchema, type ActivityTypeSeries, type AiUsageByCountry } from '@shared/realData'
import { z } from 'zod'
import { type PipelineContext } from '../context'
import { alpha3ToAlpha2, countryName } from '../lib/countries'
import { csvRecords } from '../lib/csv'
import { addDays, monthLabel } from '../lib/dates'
import { fetchJson, fetchWithRetry } from '../lib/http'
import { linesOf } from '../lib/lines'
import { usStateName } from '../lib/usStates'
import { type Source, type SourceResult } from './types'

const DATASET = 'Anthropic/EconomicIndex'
const API_BASE = `https://huggingface.co/api/datasets/${DATASET}`
const RESOLVE_BASE = `https://huggingface.co/datasets/${DATASET}/resolve/main`
const DATASET_URL = `https://huggingface.co/datasets/${DATASET}`

const CSV_PATH = /^release_(\d{4})_(\d{2})_(\d{2})\/data\/aei_claude_ai_[^/]+\.csv$/

const stateSchema = z.object({
  fingerprint: z.string(),
  csv_path: z.string(),
  release: z.string(),
  processed_at: z.string(),
  usage: aiUsageByCountrySchema,
  series: z.array(activityTypeSeriesSchema),
  notes: z.array(z.string()),
})
type AnthropicState = z.infer<typeof stateSchema>

interface Extraction {
  usage: AiUsageByCountry
  series: ActivityTypeSeries[]
  notes: string[]
}

interface GeoMetrics {
  usage_pct?: number
  usage_per_capita_index?: number
  usage_count?: number
  usage_tier?: string
}

interface RequestRow {
  month: string
  end: string
  level: number
  label: string
  value: number
}

interface HfSibling {
  rfilename: string
}

interface HfTreeEntry {
  path: string
  oid: string
  lfs?: { oid: string }
}

const USAGE_METRICS = new Set(['usage_pct', 'usage_per_capita_index', 'usage_count', 'usage_tier'])

function lineMightMatter(line: string): boolean {
  // Cheap pre-filter before CSV parsing: 1.6 M rows, we need well under 1%.
  return line.includes(',overall,') || line.includes(',GLOBAL,global,request,')
}

/**
 * Streams the release CSV and keeps only the rows the snapshots need. Exported for tests,
 * which feed a small fixture instead of the 219 MB file.
 */
export async function extractFromCsv(lines: AsyncIterable<string> | Iterable<string>, release: string, releaseDate: string): Promise<Extraction> {
  const countries = new Map<string, Map<string, GeoMetrics>>()
  const usStates = new Map<string, Map<string, GeoMetrics>>()
  const monthEnds = new Map<string, string>()
  const requests: RequestRow[] = []

  const filtered = (async function* () {
    let first = true
    for await (const line of lines) {
      if (first || lineMightMatter(line)) yield line
      first = false
    }
  })()

  for await (const row of csvRecords(filtered)) {
    const month = row.date_start ?? ''
    const category = row.category_name
    const geoLevel = row.geo_level
    const geoId = row.geo_id ?? ''
    const metric = row.metric_id ?? ''
    if (category === 'overall' && USAGE_METRICS.has(metric)) {
      let bucket: Map<string, Map<string, GeoMetrics>> | undefined
      if (geoLevel === 'country') bucket = countries
      else if (geoLevel === 'subregion' && geoId.startsWith('US-')) bucket = usStates
      else if (geoLevel === 'global') monthEnds.set(month, row.date_end ?? '')
      if (!bucket) continue
      const byGeo = bucket.get(month) ?? new Map<string, GeoMetrics>()
      bucket.set(month, byGeo)
      const metrics = byGeo.get(geoId) ?? {}
      byGeo.set(geoId, metrics)
      if (metric === 'usage_tier') metrics.usage_tier = row.value ?? ''
      else metrics[metric as 'usage_pct' | 'usage_per_capita_index' | 'usage_count'] = Number(row.value)
      monthEnds.set(month, row.date_end ?? '')
    } else if (category === 'request' && geoLevel === 'global' && metric === 'pct') {
      requests.push({
        month,
        end: row.date_end ?? '',
        level: Number(row.hierarchy_level),
        label: row.node_name ?? '',
        value: Number(row.value),
      })
    }
  }

  const months = [...monthEnds.keys()].sort()
  const latest = months.at(-1)
  if (latest === undefined) throw new Error('no overall usage rows found in the CSV')
  const latestEnd = addDays(monthEnds.get(latest) ?? addDays(latest, 31), -1)
  const notes: string[] = []

  const unmapped: string[] = []
  const countryRows = [...(countries.get(latest) ?? new Map<string, GeoMetrics>())]
    .flatMap(([alpha3, m]) => {
      const cc = alpha3ToAlpha2(alpha3)
      if (cc === undefined) {
        unmapped.push(alpha3)
        return []
      }
      if (m.usage_pct === undefined) return []
      return [
        {
          cc,
          name: countryName(cc),
          usage_pct: m.usage_pct,
          usage_per_capita_index: m.usage_per_capita_index ?? null,
          usage_tier: m.usage_tier ?? null,
          usage_count: m.usage_count ?? null,
        },
      ]
    })
    .sort((a, b) => b.usage_pct - a.usage_pct || a.cc.localeCompare(b.cc))
  if (unmapped.length > 0) notes.push(`Skipped geo_ids without an ISO alpha-2 mapping: ${unmapped.sort().join(', ')}.`)

  const stateRows = [...(usStates.get(latest) ?? new Map<string, GeoMetrics>())]
    .flatMap(([geoId, m]) => {
      if (m.usage_pct === undefined) return []
      const code = geoId.slice(3)
      return [{ code, name: usStateName(code) ?? code, usage_pct: m.usage_pct, usage_per_capita_index: m.usage_per_capita_index ?? null }]
    })
    .sort((a, b) => b.usage_pct - a.usage_pct || a.code.localeCompare(b.code))

  const usage: AiUsageByCountry = {
    source: 'anthropic_economic_index',
    release,
    product: 'Claude.ai chat and Cowork (Free, Pro and Max plans)',
    period: { start: latest, end: latestEnd },
    as_of: monthLabel(latest),
    metrics: {
      usage_pct: "Share of global Claude.ai usage in the month, in percent (Anthropic 'usage_pct', relative to the global total).",
      usage_per_capita_index:
        "Anthropic Usage Index: usage share divided by working-age (15-64) population share; 1.0 means proportional to population ('usage_per_capita_index').",
    },
    countries: countryRows,
    ...(stateRows.length > 0 ? { us_states: stateRows } : {}),
  }

  const series = buildRequestSeries(requests, release, releaseDate, notes)
  const monthsLabel = months.map((m) => monthLabel(m)).join(' and ')
  notes.unshift(
    `${release} covers ${monthsLabel}; snapshot shows ${monthLabel(latest)}: ${countryRows.length} countries, ${stateRows.length} US states.`,
    'Cells below Anthropic\'s aggregation thresholds are not published, so smaller countries are missing rather than zero.',
  )
  return { usage, series, notes }
}

function buildRequestSeries(rows: RequestRow[], release: string, releaseDate: string, notes: string[]): ActivityTypeSeries[] {
  if (rows.length === 0) return []
  const topLevel = Math.max(...rows.map((r) => r.level))
  const top = rows.filter((r) => r.level === topLevel)
  const months = [...new Set(top.map((r) => r.month))].sort()
  const latest = months.at(-1)
  if (latest === undefined) return []

  const categoriesFor = (month: string) => {
    const monthRows = top.filter((r) => r.month === month).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    const categories = monthRows.map((r) => ({ label: r.label, share: round6(r.value / 100) }))
    const sum = categories.reduce((acc, c) => acc + c.share, 0)
    if (sum > 1.0005) {
      for (const c of categories) c.share = round6(c.share / sum)
    } else if (sum < 0.9995) {
      categories.push({ label: 'Not published (below reporting threshold)', share: round6(1 - sum) })
    }
    return { categories, end: monthRows[0]?.end ?? addDays(month, 31) }
  }

  const current = categoriesFor(latest)
  const previousMonth = months.at(-2)
  const previous = previousMonth === undefined ? null : { as_of: monthLabel(previousMonth), categories: categoriesFor(previousMonth).categories }
  const remainder = current.categories.find((c) => c.label.startsWith('Not published'))
  notes.push(
    `Request-topic shares use hierarchy level ${topLevel} ('Major' topics); ${remainder ? `${(remainder.share * 100).toFixed(2)}% of conversations fall in topics below the publication threshold and are shown as a remainder.` : 'published topics sum to 100%.'}`,
  )
  return [
    {
      source: 'anthropic_economic_index',
      title: 'What people use Claude for',
      subject: 'Claude.ai conversations by request topic (major category), global',
      as_of: monthLabel(latest),
      period: { start: latest, end: addDays(current.end, -1) },
      method: `Global 'request' category shares (hierarchy level ${topLevel}) from ${release} (released ${releaseDate}); unpublished remainder added so shares sum to 1`,
      url: `${DATASET_URL}/tree/main/${release}`,
      categories: current.categories.map((c) =>
        c.label.startsWith('Not published') ? { ...c, note: 'Remainder: topics whose cells fell below Anthropic\'s publication threshold' } : c,
      ),
      previous,
    },
  ]
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

async function findLatestCsv(): Promise<{ path: string; release: string; releaseDate: string }> {
  const listing = await fetchJson<{ siblings?: HfSibling[] }>(API_BASE)
  const matches = (listing.siblings ?? [])
    .map((s) => s.rfilename)
    .filter((name) => CSV_PATH.test(name))
    .sort()
  const path = matches.at(-1)
  if (path === undefined) throw new Error(`no release_*/data/aei_claude_ai_*.csv found in ${DATASET}`)
  const m = CSV_PATH.exec(path)
  if (!m) throw new Error(`unexpected path ${path}`)
  return { path, release: path.split('/')[0] ?? path, releaseDate: `${m[1] ?? ''}-${m[2] ?? ''}-${m[3] ?? ''}` }
}

async function fingerprintOf(path: string): Promise<string> {
  const dir = path.slice(0, path.lastIndexOf('/'))
  const entries = await fetchJson<HfTreeEntry[]>(`${API_BASE}/tree/main/${dir}`)
  const entry = entries.find((e) => e.path === path)
  if (!entry) throw new Error(`${path} not found in tree listing`)
  return entry.lfs?.oid ?? entry.oid
}

export const anthropicSource: Source = {
  meta: {
    id: 'anthropic_economic_index',
    key: 'anthropic',
    title: 'Anthropic Economic Index',
    publisher: 'Anthropic',
    url: DATASET_URL,
    license: 'CC-BY (release data documentation); dataset card lists MIT',
    description:
      'Monthly Claude.ai usage by country and US state (share of global usage and per-capita index) and the global mix of request topics, from the Anthropic Economic Index releases on Hugging Face.',
    // Releases are roughly quarterly (Jan, Mar, Jun 2026), so 45 days would flag every release as stale.
    staleAfterDays: 120,
  },
  async fetch(ctx: PipelineContext): Promise<SourceResult> {
    const log = ctx.log.child('anthropic')
    const { path, release, releaseDate } = await findLatestCsv()
    const fingerprint = await fingerprintOf(path)
    const cached = ctx.state.get('anthropic', stateSchema)

    let extraction: Extraction
    let processedAt: string
    if (!ctx.force && cached?.fingerprint === fingerprint && cached.csv_path === path) {
      log.info(`${path} unchanged (oid ${fingerprint.slice(0, 12)}); reusing extraction from ${cached.processed_at}`)
      extraction = { usage: cached.usage, series: cached.series, notes: cached.notes }
      processedAt = cached.processed_at
    } else {
      log.info(`streaming ${path} (oid ${fingerprint.slice(0, 12)})`)
      const res = await fetchWithRetry(`${RESOLVE_BASE}/${path}`, { timeoutMs: 120_000 })
      if (!res.body) throw new Error('empty response body')
      extraction = await extractFromCsv(linesOf(res.body), release, releaseDate)
      processedAt = ctx.now.toISOString()
      const state: AnthropicState = { fingerprint, csv_path: path, release, processed_at: processedAt, ...extraction }
      ctx.state.set('anthropic', state)
    }
    log.info(`${extraction.usage.countries.length} countries, ${extraction.usage.us_states?.length ?? 0} US states, ${extraction.series.length} series`)
    return {
      file: 'ai-usage-by-country.json',
      data: extraction.usage,
      series: extraction.series,
      as_of: extraction.usage.as_of,
      freshness_date: releaseDate,
      notes: [...extraction.notes, `Source file ${path} (oid ${fingerprint}), processed ${processedAt}.`],
    }
  },
}
