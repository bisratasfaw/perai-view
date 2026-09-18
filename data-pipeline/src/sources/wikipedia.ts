import { PROGRAM_IDS, type ProgramId } from '@shared/programs'
import { type WikipediaInterest } from '@shared/realData'
import { z } from 'zod'
import { type PipelineContext } from '../context'
import { countryName, isAlpha2 } from '../lib/countries'
import { compactDate, lastFullDays } from '../lib/dates'
import { fetchJson, fetchWithRetry } from '../lib/http'
import { linesOf } from '../lib/lines'
import { mapConcurrent } from '../lib/pool'
import { type Source, type SourceResult } from './types'

export const WINDOW_DAYS = 30

/** Wikidata items for each assistant's article ("other" has none). Company articles where no product article exists. */
export const ARTICLES: readonly { assistant: ProgramId; qid: string }[] = [
  { assistant: 'chatgpt', qid: 'Q115564437' },
  { assistant: 'claude', qid: 'Q118876059' },
  { assistant: 'gemini', qid: 'Q116698014' },
  { assistant: 'copilot', qid: 'Q107435063' },
  { assistant: 'midjourney', qid: 'Q113070628' },
  { assistant: 'mistral', qid: 'Q119718658' },
  { assistant: 'llama', qid: 'Q116894231' },
  { assistant: 'perplexity', qid: 'Q124333951' },
]

const REST_BASE = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article'
const COUNTRY_DATASET_BASE = 'https://analytics.wikimedia.org/published/datasets/country_project_page'
const WIKIDATA_ENTITY = 'https://www.wikidata.org/wiki/Special:EntityData'

export type CountryViews = Record<string, Partial<Record<ProgramId, number>>>

const dayCacheSchema = z.record(z.string(), z.record(z.string(), z.partialRecord(z.enum(PROGRAM_IDS), z.number())))
const stateSchema = z.object({
  qids: z.array(z.string()),
  by_country_days: dayCacheSchema,
})
type DayCache = z.infer<typeof dayCacheSchema>

interface Sitelink {
  site: string
  title: string
  url?: string
}

interface WikidataEntity {
  labels?: Record<string, { value: string }>
  sitelinks?: Record<string, Sitelink>
}

interface ArticleProject {
  project: string
  title: string
}

interface PageviewsResponse {
  items?: { timestamp: string; views: number }[]
}

/**
 * Sums one day of the country_project_page TSV for the tracked Wikidata items.
 * Columns: country name, ISO alpha-2, project, page id, title, Wikidata item, views (no header).
 */
export async function sumCountryViews(lines: AsyncIterable<string> | Iterable<string>, qidToAssistant: ReadonlyMap<string, ProgramId>): Promise<CountryViews> {
  const out: CountryViews = {}
  for await (const line of lines) {
    if (!line) continue
    const cols = line.split('\t')
    const qid = cols[5]
    if (qid === undefined) continue
    const assistant = qidToAssistant.get(qid)
    if (assistant === undefined) continue
    const cc = cols[1] ?? ''
    if (!isAlpha2(cc)) continue
    const views = Number(cols[6])
    if (!Number.isFinite(views)) continue
    const byAssistant = (out[cc] ??= {})
    byAssistant[assistant] = (byAssistant[assistant] ?? 0) + views
  }
  return out
}

/** Sums cached per-day country views over the window; days missing from the cache are skipped. */
export function aggregateCountryDays(cache: DayCache, days: readonly string[]): { by_country: WikipediaInterest['by_country']; days_covered: string[] } {
  const totals = new Map<string, Partial<Record<ProgramId, number>>>()
  const covered: string[] = []
  for (const day of days) {
    const dayViews = cache[day]
    if (dayViews === undefined) continue
    covered.push(day)
    for (const [cc, byAssistant] of Object.entries(dayViews)) {
      const acc = totals.get(cc) ?? {}
      totals.set(cc, acc)
      for (const [assistant, views] of Object.entries(byAssistant) as [ProgramId, number][]) {
        acc[assistant] = (acc[assistant] ?? 0) + views
      }
    }
  }
  const by_country = [...totals]
    .map(([cc, views]) => {
      const sorted = sortedCounts(views)
      const total = Object.values(sorted).reduce((a, b) => a + b, 0)
      return { cc, name: countryName(cc), views: sorted, total, leading: leadingProgram(sorted) }
    })
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total || a.cc.localeCompare(b.cc))
  return { by_country, days_covered: covered }
}

/** Assistant with the highest count; ties go to the earlier PROGRAM_IDS entry, all-zero to "other". */
export function leadingProgram(counts: Partial<Record<ProgramId, number>>): ProgramId {
  let best: ProgramId = 'other'
  let bestValue = 0
  for (const id of PROGRAM_IDS) {
    const value = counts[id] ?? 0
    if (value > bestValue) {
      best = id
      bestValue = value
    }
  }
  return best
}

/** Counts in PROGRAM_IDS order so files diff cleanly. */
export function sortedCounts(counts: Partial<Record<ProgramId, number>>): Partial<Record<ProgramId, number>> {
  const out: Partial<Record<ProgramId, number>> = {}
  for (const id of PROGRAM_IDS) {
    const value = counts[id]
    if (value !== undefined && value > 0) out[id] = value
  }
  return out
}

async function loadArticle(qid: string): Promise<{ label: string; projects: ArticleProject[] }> {
  const data = await fetchJson<{ entities?: Record<string, WikidataEntity> }>(`${WIKIDATA_ENTITY}/${qid}.json`)
  const entity = Object.values(data.entities ?? {})[0]
  if (!entity) throw new Error(`Wikidata returned no entity for ${qid}`)
  const projects: ArticleProject[] = []
  for (const link of Object.values(entity.sitelinks ?? {})) {
    if (!link.url) continue
    const host = new URL(link.url).host
    if (!host.endsWith('.wikipedia.org')) continue
    projects.push({ project: host.slice(0, -'.org'.length), title: link.title })
  }
  return { label: entity.labels?.en?.value ?? qid, projects }
}

async function dailyViews(project: string, title: string, start: string, end: string): Promise<Map<string, number>> {
  const article = encodeURIComponent(title.replaceAll(' ', '_'))
  const url = `${REST_BASE}/${project}/all-access/user/${article}/daily/${compactDate(start)}00/${compactDate(end)}00`
  const res = await fetchWithRetry(url, { okStatuses: [404], headers: { accept: 'application/json' } })
  const views = new Map<string, number>()
  if (res.status === 404) return views
  const body = (await res.json()) as PageviewsResponse
  for (const item of body.items ?? []) {
    const ts = item.timestamp
    views.set(`${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`, item.views)
  }
  return views
}

export const wikipediaSource: Source = {
  meta: {
    id: 'wikipedia_pageviews',
    key: 'wikipedia',
    title: 'Wikipedia pageviews for AI-assistant articles',
    publisher: 'Wikimedia Foundation (Wikimedia Analytics)',
    url: 'https://wikitech.wikimedia.org/wiki/Analytics/AQS/Pageviews',
    license: 'CC0 (Wikimedia Analytics pageview datasets are released under the Creative Commons CC0 dedication)',
    description:
      'Daily human pageviews of each assistant\'s Wikipedia article summed across language editions (Pageviews REST API), plus per-country sums from the differentially private country_project_page dataset, over the last 30 full days.',
    staleAfterDays: 45,
  },
  async fetch(ctx: PipelineContext): Promise<SourceResult> {
    const log = ctx.log.child('wikipedia')
    // Fetch two extra days: Wikimedia publishes a UTC day a few hours after it ends (and the API
    // answers with zero-view rows until then), so the newest day or two may be dropped below.
    const fetched = lastFullDays(ctx.now, WINDOW_DAYS + 2)
    const qidToAssistant = new Map(ARTICLES.map((a) => [a.qid, a.assistant]))

    const articles = await mapConcurrent(ARTICLES, 4, async (a) => ({ ...a, ...(await loadArticle(a.qid)) }))
    const jobs = articles.flatMap((a) => a.projects.map((p) => ({ assistant: a.assistant, ...p })))
    log.info(`${articles.length} articles, ${jobs.length} language editions, fetching ${fetched.start}..${fetched.end}`)

    const daily = new Map<string, Partial<Record<ProgramId, number>>>(fetched.days.map((d) => [d, {}]))
    let failures = 0
    await mapConcurrent(jobs, 4, async (job) => {
      let views: Map<string, number>
      try {
        views = await dailyViews(job.project, job.title, fetched.start, fetched.end)
      } catch (error) {
        failures++
        log.warn(`${job.project}/${job.title}: ${error instanceof Error ? error.message : String(error)}`)
        return
      }
      for (const [date, count] of views) {
        const bucket = daily.get(date)
        if (bucket) bucket[job.assistant] = (bucket[job.assistant] ?? 0) + count
      }
    })
    if (failures > jobs.length / 4) throw new Error(`${failures} of ${jobs.length} per-article requests failed`)

    const totalViews = (date: string) => Object.values(daily.get(date) ?? {}).reduce((sum, v) => sum + v, 0)
    const published = [...fetched.days]
    while (published.length > WINDOW_DAYS && totalViews(published.at(-1) ?? "") === 0) published.pop()
    const days = published.slice(-WINDOW_DAYS)
    const window = { start: days[0] ?? fetched.start, end: days.at(-1) ?? fetched.end, days }
    if (window.end !== fetched.end) log.info(`${fetched.end} not published yet; window is ${window.start}..${window.end}`)

    const previous = ctx.state.get('wikipedia', stateSchema)
    const qids = ARTICLES.map((a) => a.qid)
    const cache: DayCache =
      previous && !ctx.force && JSON.stringify(previous.qids) === JSON.stringify(qids) ? { ...previous.by_country_days } : {}
    const missingDays = window.days.filter((d) => cache[d] === undefined)
    log.info(`country dataset: ${window.days.length - missingDays.length} days cached, fetching ${missingDays.length}`)
    const unavailable: string[] = []
    await mapConcurrent(missingDays, 2, async (day) => {
      const res = await fetchWithRetry(`${COUNTRY_DATASET_BASE}/${day}.tsv`, { okStatuses: [404], timeoutMs: 60_000 })
      if (res.status === 404 || !res.body) {
        unavailable.push(day)
        return
      }
      cache[day] = await sumCountryViews(linesOf(res.body), qidToAssistant)
    })
    for (const day of Object.keys(cache)) if (!window.days.includes(day)) delete cache[day] // eslint-disable-line @typescript-eslint/no-dynamic-delete
    ctx.state.set('wikipedia', { qids, by_country_days: cache })

    const { by_country, days_covered } = aggregateCountryDays(cache, window.days)
    const data: WikipediaInterest = {
      source: 'wikipedia_pageviews',
      as_of: window.end,
      days: WINDOW_DAYS,
      articles: articles.map((a) => ({ assistant: a.assistant, qid: a.qid, label: a.label, projects: a.projects.length })),
      daily: window.days.map((date) => ({ date, views: sortedCounts(daily.get(date) ?? {}) })),
      by_country,
      by_country_note:
        `Lower bound: Wikimedia's differentially private country dataset only publishes page/country/day cells above a privacy threshold, ` +
        `so small countries and low-traffic days are missing rather than zero. Sums cover ${days_covered.length} of ${WINDOW_DAYS} days` +
        `${days_covered.length > 0 ? ` (${days_covered[0] ?? ''} to ${days_covered.at(-1) ?? ''})` : ''}; all language editions combined.`,
    }
    const notes = [
      `Daily series: ${jobs.length} language editions across ${articles.length} articles, agent=user, all-access, ${window.start} to ${window.end}.`,
      `Country sums: ${days_covered.length} of ${WINDOW_DAYS} days available, ${by_country.length} countries.`,
    ]
    if (window.end !== fetched.end) notes.push(`Pageviews for ${fetched.end} were not published yet at run time; the window ends on ${window.end}.`)
    if (unavailable.length > 0) notes.push(`Country dataset not yet published for: ${unavailable.sort().join(', ')}.`)
    if (failures > 0) notes.push(`${failures} per-article requests failed and were counted as zero.`)
    return { file: 'wikipedia-interest.json', data, as_of: window.end, freshness_date: window.end, notes }
  },
}
