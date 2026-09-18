/** Small, schema-valid snapshots for tests. */
import type { AiUsageByCountry, Countries, DeveloperCities, Manifest, SdkDownloadsByCountry, WikipediaInterest } from '@shared/realData'

const NOW = '2026-09-17T04:15:00Z'

export const manifestFixture: Manifest = {
  schema_version: 1,
  generated_at: NOW,
  pipeline_version: 'test',
  sources: {
    anthropic_economic_index: {
      id: 'anthropic_economic_index',
      title: 'Anthropic Economic Index',
      publisher: 'Anthropic',
      url: 'https://huggingface.co/datasets/Anthropic/EconomicIndex',
      license: 'CC-BY',
      description: 'Claude usage by country.',
      status: 'ok',
      fetched_at: NOW,
      as_of: 'May 2026',
      error: null,
      notes: [],
    },
    openai_usage_report: {
      id: 'openai_usage_report',
      title: 'How People Use ChatGPT',
      publisher: 'OpenAI / NBER',
      url: 'https://www.nber.org/papers/w34255',
      license: 'Figures cited from the paper',
      description: 'Message shares by topic.',
      status: 'ok',
      fetched_at: NOW,
      as_of: 'July 2025',
      error: null,
      notes: [],
    },
    wikipedia_pageviews: {
      id: 'wikipedia_pageviews',
      title: 'Wikimedia pageviews',
      publisher: 'Wikimedia Foundation',
      url: 'https://wikimedia.org/api/rest_v1/',
      license: 'CC0',
      description: 'Article views.',
      status: 'ok',
      fetched_at: NOW,
      as_of: '2026-09-16',
      error: null,
      notes: [],
    },
    pypi_downloads: {
      id: 'pypi_downloads',
      title: 'PyPI downloads',
      publisher: 'PyPI via BigQuery',
      url: 'https://packaging.python.org/en/latest/guides/analyzing-pypi-package-downloads/',
      license: 'Public dataset',
      description: 'SDK downloads by country.',
      status: 'not_configured',
      fetched_at: null,
      as_of: null,
      error: null,
      notes: [],
    },
    github_forks: {
      id: 'github_forks',
      title: 'GitHub fork owners',
      publisher: 'GitHub',
      url: 'https://docs.github.com/graphql',
      license: 'GitHub API terms',
      description: 'Developers by city.',
      status: 'ok',
      fetched_at: NOW,
      as_of: '2026-09-17',
      error: null,
      notes: [],
    },
  },
}

export const countriesFixture: Countries = {
  generated_at: NOW,
  source: 'world-countries',
  countries: [
    { cc: 'US', name: 'United States', ccn3: '840', lat: 38, lng: -97 },
    { cc: 'DE', name: 'Germany', ccn3: '276', lat: 51, lng: 9 },
    { cc: 'IN', name: 'India', ccn3: '356', lat: 20, lng: 77 },
    { cc: 'JP', name: 'Japan', ccn3: '392', lat: 36, lng: 138 },
    { cc: 'BR', name: 'Brazil', ccn3: '076', lat: -10, lng: -55 },
    ...Array.from({ length: 150 }, (_, i) => ({ cc: `A${String.fromCharCode(65 + (i % 26))}`, name: `Country ${i}`, ccn3: String(900 + i).slice(0, 3), lat: 0, lng: 0 })),
  ],
}

export const usageFixture: AiUsageByCountry = {
  source: 'anthropic_economic_index',
  release: 'release_2026_06_26',
  product: 'Claude chat (Free, Pro, Max)',
  period: { start: '2026-05-01', end: '2026-06-01' },
  as_of: 'May 2026',
  metrics: { usage_pct: 'Share of global usage', usage_per_capita_index: 'Usage share / working-age population share' },
  countries: [
    { cc: 'US', name: 'United States', usage_pct: 21.6, usage_per_capita_index: 3.62, usage_tier: 'Leading', usage_count: 208200 },
    { cc: 'DE', name: 'Germany', usage_pct: 3.4, usage_per_capita_index: 2.1, usage_tier: 'Leading', usage_count: 33000 },
    { cc: 'IN', name: 'India', usage_pct: 7.2, usage_per_capita_index: 0.27, usage_tier: 'Emerging', usage_count: 69000 },
    { cc: 'JP', name: 'Japan', usage_pct: 2.2, usage_per_capita_index: 1.1, usage_tier: null, usage_count: null },
    { cc: 'BR', name: 'Brazil', usage_pct: 2.9, usage_per_capita_index: null, usage_tier: null, usage_count: null },
    ...Array.from({ length: 16 }, (_, i) => ({ cc: `A${String.fromCharCode(65 + i)}`, name: `Country ${i}`, usage_pct: 0.1, usage_per_capita_index: 0.05 + i * 0.01, usage_tier: null, usage_count: null })),
  ],
}

const DAYS = Array.from({ length: 30 }, (_, i) => `2026-08-${String(18 + i).padStart(2, '0')}`.replace(/2026-08-(3[2-9]|4\d)/, (m) => `2026-09-${String(Number(m.slice(8)) - 31).padStart(2, '0')}`))

export const wikiFixture: WikipediaInterest = {
  source: 'wikipedia_pageviews',
  as_of: '2026-09-16',
  days: 30,
  articles: [
    { assistant: 'chatgpt', qid: 'Q115564437', label: 'ChatGPT', projects: 60 },
    { assistant: 'claude', qid: 'Q118876059', label: 'Claude', projects: 20 },
    { assistant: 'gemini', qid: 'Q116698014', label: 'Gemini', projects: 25 },
  ],
  daily: DAYS.map((date, i) => ({ date, views: { chatgpt: 60000 + i * 100, claude: 8000 + (i % 5) * 50, gemini: 12000 } })),
  by_country: [
    { cc: 'IN', name: 'India', views: { chatgpt: 250000, claude: 30000, gemini: 20000 }, total: 300000, leading: 'chatgpt' },
    { cc: 'US', name: 'United States', views: { chatgpt: 160000, claude: 55000, gemini: 15000 }, total: 230000, leading: 'chatgpt' },
    { cc: 'DE', name: 'Germany', views: { chatgpt: 190000, claude: 20000 }, total: 210000, leading: 'chatgpt' },
  ],
  by_country_note: 'Lower bound: only pages above a privacy threshold per country and day are published.',
}

export const devsFixture: DeveloperCities = {
  source: 'github_forks',
  as_of: '2026-09-17',
  repos: [{ full_name: 'openai/openai-python', assistant: 'chatgpt', vendor: 'OpenAI', forks_total: 5576, forks_seen: 5576, with_location: 2400 }],
  cities: [
    { name: 'San Francisco', cc: 'US', lat: 37.7749, lng: -122.4194, counts: { chatgpt: 120, claude: 60 }, total: 180 },
    { name: 'Bangalore', cc: 'IN', lat: 12.9716, lng: 77.5946, counts: { chatgpt: 90, gemini: 40 }, total: 130 },
    { name: 'Berlin', cc: 'DE', lat: 52.52, lng: 13.405, counts: { claude: 30, chatgpt: 25 }, total: 55 },
    ...Array.from({ length: 8 }, (_, i) => ({ name: `City ${i}`, cc: 'US', lat: 40 + i, lng: -100 + i, counts: { llama: 3 }, total: 3 })),
  ],
  countries: [
    { cc: 'US', name: 'United States', counts: { chatgpt: 600, claude: 200 }, total: 800 },
    { cc: 'IN', name: 'India', counts: { chatgpt: 300, gemini: 120 }, total: 420 },
  ],
  geocoding: { method: 'offline match against the city list', matched_city_pct: 41.5, matched_country_pct: 63.2 },
}

export const sdkNotConfiguredFixture: SdkDownloadsByCountry = {
  source: 'pypi_downloads',
  status: 'not_configured',
  as_of: null,
  period_days: 7,
  packages: [{ name: 'openai', assistant: 'chatgpt', vendor: 'OpenAI' }],
  countries: [],
  note: 'Set BIGQUERY_PROJECT and GCP_SERVICE_ACCOUNT_KEY to enable this source.',
}

export const sdkFixture: SdkDownloadsByCountry = {
  ...sdkNotConfiguredFixture,
  status: 'ok',
  as_of: '2026-09-16',
  countries: [
    { cc: 'US', name: 'United States', downloads: { openai: 900000, anthropic: 300000 }, total: 1200000, leading: 'chatgpt' },
    { cc: 'DE', name: 'Germany', downloads: { openai: 100000, anthropic: 120000 }, total: 220000, leading: 'claude' },
  ],
}
