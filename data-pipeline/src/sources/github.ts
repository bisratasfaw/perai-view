import { getProgram, PROGRAM_IDS, type ProgramId } from '@shared/programs'
import { type DeveloperCities } from '@shared/realData'
import { type PipelineContext } from '../context'
import { countryName } from '../lib/countries'
import { toIsoDate } from '../lib/dates'
import { geocodeLocation, GEOCODING_METHOD, type GeoMatch } from '../lib/geocode'
import { fetchJson } from '../lib/http'
import { type Source, type SourceResult } from './types'
import { sortedCounts } from './wikipedia'

/** Most recent forks enumerated per repository; bounds runtime to a few hundred GraphQL calls. */
export const MAX_FORKS_PER_REPO = 6000
const PAGE_SIZE = 100

export const REPOS: readonly { full_name: string; assistant: ProgramId }[] = [
  { full_name: 'openai/openai-python', assistant: 'chatgpt' },
  { full_name: 'openai/openai-node', assistant: 'chatgpt' },
  { full_name: 'anthropics/anthropic-sdk-python', assistant: 'claude' },
  { full_name: 'anthropics/anthropic-sdk-typescript', assistant: 'claude' },
  { full_name: 'googleapis/python-genai', assistant: 'gemini' },
  { full_name: 'google-gemini/gemini-cli', assistant: 'gemini' },
  { full_name: 'mistralai/client-python', assistant: 'mistral' },
  { full_name: 'meta-llama/llama', assistant: 'llama' },
]

const QUERY = `query Forks($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    forkCount
    forks(first: ${PAGE_SIZE}, after: $cursor, orderBy: { field: CREATED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes { owner { __typename ... on User { login location } } }
    }
  }
  rateLimit { remaining resetAt }
}`

interface ForksResponse {
  data?: {
    repository?: {
      forkCount: number
      forks: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null }
        nodes: ({ owner: { __typename: string; login?: string; location?: string | null } | null } | null)[]
      }
    } | null
    rateLimit?: { remaining: number; resetAt: string } | null
  }
  errors?: { message: string }[]
}

export interface RepoForks {
  full_name: string
  assistant: ProgramId
  forks_total: number
  forks_seen: number
  locations: string[]
}

async function enumerateForks(repo: (typeof REPOS)[number], token: string, log: PipelineContext['log']): Promise<RepoForks> {
  const [owner, name] = repo.full_name.split('/')
  const locations: string[] = []
  let cursor: string | null = null
  let seen = 0
  let total: number
  for (;;) {
    const res: ForksResponse = await fetchJson<ForksResponse>('https://api.github.com/graphql', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { owner, name, cursor } }),
      timeoutMs: 60_000,
    })
    const repository = res.data?.repository
    if (!repository) {
      throw new Error(`GraphQL: ${res.errors?.map((e) => e.message).join('; ') ?? 'repository not returned'}`)
    }
    total = repository.forkCount
    for (const node of repository.forks.nodes) {
      seen++
      const location = node?.owner?.__typename === 'User' ? node.owner.location?.trim() : undefined
      if (location) locations.push(location)
    }
    const remaining = res.data?.rateLimit?.remaining
    if (remaining !== undefined && remaining < 100) log.warn(`GitHub GraphQL rate limit low: ${remaining} remaining until ${res.data?.rateLimit?.resetAt ?? '?'}`)
    const { hasNextPage, endCursor } = repository.forks.pageInfo
    if (!hasNextPage || endCursor === null || seen >= MAX_FORKS_PER_REPO) break
    cursor = endCursor
  }
  log.info(`${repo.full_name}: ${seen} of ${total} forks, ${locations.length} with a location`)
  return { full_name: repo.full_name, assistant: repo.assistant, forks_total: total, forks_seen: seen, locations }
}

/** Geocodes every fork owner location and aggregates by city and country. Pure, so tests can drive it with fixtures. */
export function buildDeveloperCities(repos: readonly RepoForks[], asOf: string, geocode: (raw: string) => GeoMatch = geocodeLocation): DeveloperCities {
  const cities = new Map<string, { name: string; cc: string; lat: number; lng: number; counts: Partial<Record<ProgramId, number>> }>()
  const countries = new Map<string, Partial<Record<ProgramId, number>>>()
  let withLocation = 0
  let cityMatches = 0
  let countryMatches = 0
  for (const repo of repos) {
    for (const raw of repo.locations) {
      withLocation++
      const match = geocode(raw)
      if (match.kind === 'none') continue
      countryMatches++
      const country = countries.get(match.cc) ?? {}
      countries.set(match.cc, country)
      country[repo.assistant] = (country[repo.assistant] ?? 0) + 1
      if (match.kind !== 'city') continue
      cityMatches++
      const key = `${match.city.name}|${match.city.cc}`
      const city = cities.get(key) ?? { ...match.city, counts: {} }
      cities.set(key, city)
      city.counts[repo.assistant] = (city.counts[repo.assistant] ?? 0) + 1
    }
  }
  const total = (counts: Partial<Record<ProgramId, number>>) => PROGRAM_IDS.reduce((acc, id) => acc + (counts[id] ?? 0), 0)
  const pct = (n: number) => (withLocation === 0 ? 0 : Math.round((n / withLocation) * 1000) / 10)
  return {
    source: 'github_forks',
    as_of: asOf,
    repos: repos.map((r) => ({
      full_name: r.full_name,
      assistant: r.assistant,
      vendor: getProgram(r.assistant)?.vendor ?? r.assistant,
      forks_total: r.forks_total,
      forks_seen: r.forks_seen,
      with_location: r.locations.length,
    })),
    cities: [...cities.values()]
      .map((c) => ({ name: c.name, cc: c.cc, lat: c.lat, lng: c.lng, counts: sortedCounts(c.counts), total: total(c.counts) }))
      .filter((c) => c.total >= 1)
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
    countries: [...countries]
      .map(([cc, counts]) => ({ cc, name: countryName(cc), counts: sortedCounts(counts), total: total(counts) }))
      .filter((c) => c.total >= 1)
      .sort((a, b) => b.total - a.total || a.cc.localeCompare(b.cc)),
    geocoding: { method: GEOCODING_METHOD, matched_city_pct: pct(cityMatches), matched_country_pct: pct(countryMatches) },
  }
}

export const githubSource: Source = {
  meta: {
    id: 'github_forks',
    key: 'github',
    title: 'GitHub SDK fork owners by city',
    publisher: 'GitHub (GraphQL API)',
    url: 'https://docs.github.com/en/graphql',
    license: 'Public profile data via the GitHub API, subject to GitHub\'s Terms of Service; only aggregated counts are stored',
    description:
      'Self-reported profile locations of people who forked the official OpenAI, Anthropic, Google Gemini, Mistral and Meta Llama SDK repositories, geocoded offline to the globe\'s cities and to countries.',
    staleAfterDays: 45,
  },
  async fetch(ctx: PipelineContext): Promise<SourceResult> {
    const log = ctx.log.child('github')
    const token = ctx.env.GITHUB_TOKEN
    if (!token) throw new Error('GITHUB_TOKEN is not set (locally: GITHUB_TOKEN=$(gh auth token))')
    const repos: RepoForks[] = []
    for (const repo of REPOS) repos.push(await enumerateForks(repo, token, log))
    const asOf = toIsoDate(ctx.now)
    const data = buildDeveloperCities(repos, asOf)
    const seen = repos.reduce((a, r) => a + r.forks_seen, 0)
    const located = repos.reduce((a, r) => a + r.locations.length, 0)
    log.info(`${seen} forks, ${located} with location, ${data.cities.length} cities, ${data.countries.length} countries`)
    return {
      file: 'developer-cities.json',
      data,
      as_of: asOf,
      freshness_date: asOf,
      notes: [
        `${seen} fork owners enumerated (newest first, at most ${MAX_FORKS_PER_REPO} per repository); ${located} list a location.`,
        `Geocoding matched ${data.geocoding.matched_city_pct}% of locations to a globe city and ${data.geocoding.matched_country_pct}% to a country.`,
        'Organisations and users without a location are counted in forks_seen only.',
      ],
    }
  },
}
