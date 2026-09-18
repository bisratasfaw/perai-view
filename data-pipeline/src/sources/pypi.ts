import { getProgram, type ProgramId } from '@shared/programs'
import { type SdkDownloadsByCountry } from '@shared/realData'
import { GoogleAuth } from 'google-auth-library'
import { type PipelineContext } from '../context'
import { countryName, isAlpha2 } from '../lib/countries'
import { addDays, toIsoDate } from '../lib/dates'
import { fetchJson } from '../lib/http'
import { type Source, type SourceResult } from './types'
import { leadingProgram } from './wikipedia'

export const PERIOD_DAYS = 7

const PACKAGE_ASSISTANT: readonly { name: string; assistant: ProgramId }[] = [
  { name: 'openai', assistant: 'chatgpt' },
  { name: 'anthropic', assistant: 'claude' },
  { name: 'google-genai', assistant: 'gemini' },
  { name: 'mistralai', assistant: 'mistral' },
]

export const PACKAGES = PACKAGE_ASSISTANT.map((p) => ({ ...p, vendor: getProgram(p.assistant)?.vendor ?? p.assistant }))

const SETUP_NOTE =
  'Not configured. Five-minute setup, free of charge: (1) create a Google Cloud project; (2) open BigQuery and accept the sandbox ' +
  '(no billing account needed, 1 TB of queries per month); (3) create a service account with the "BigQuery Job User" role ' +
  '(public datasets are readable by everyone) and download a JSON key; (4) add the repository secrets BIGQUERY_PROJECT (the project id) ' +
  'and GCP_SERVICE_ACCOUNT_KEY (the JSON key contents); locally use BIGQUERY_PROJECT plus GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json. ' +
  'The query scans tens of GB, so the workflow runs it weekly (Mondays) or on demand.'

const DATA_NOTE =
  'File downloads recorded by PyPI (pip, CI runners and mirrors alike), grouped by the country PyPI geolocated the download to, ' +
  `over the last ${PERIOD_DAYS} complete UTC days. Source: bigquery-public-data.pypi.file_downloads.`

interface QueryResponse {
  jobComplete?: boolean
  jobReference?: { jobId?: string; location?: string }
  schema?: { fields?: { name: string }[] }
  rows?: { f: { v: string | null }[] }[]
  pageToken?: string
  totalBytesProcessed?: string
}

interface DownloadRow {
  country_code: string
  project: string
  downloads: number
}

export function buildQuery(start: string, endExclusive: string): string {
  const names = PACKAGES.map((p) => `'${p.name}'`).join(', ')
  return (
    'SELECT country_code, file.project AS project, COUNT(*) AS downloads\n' +
    'FROM `bigquery-public-data.pypi.file_downloads`\n' +
    `WHERE timestamp >= TIMESTAMP('${start}') AND timestamp < TIMESTAMP('${endExclusive}')\n` +
    `  AND file.project IN (${names})\n` +
    '  AND country_code IS NOT NULL\n' +
    'GROUP BY country_code, project'
  )
}

function credentialsFromEnv(env: PipelineContext['env']): { projectId: string; auth: GoogleAuth } | { missing: string } {
  const projectId = env.BIGQUERY_PROJECT
  const keyJson = env.GCP_SERVICE_ACCOUNT_KEY
  const keyFile = env.GOOGLE_APPLICATION_CREDENTIALS
  if (!projectId) return { missing: 'BIGQUERY_PROJECT' }
  if (!keyJson && !keyFile) return { missing: 'GCP_SERVICE_ACCOUNT_KEY or GOOGLE_APPLICATION_CREDENTIALS' }
  const scopes = ['https://www.googleapis.com/auth/bigquery.readonly']
  const auth = keyJson
    ? new GoogleAuth({ scopes, credentials: JSON.parse(keyJson) as Record<string, string> })
    : new GoogleAuth({ scopes, keyFilename: keyFile })
  return { projectId, auth }
}

async function runQuery(projectId: string, token: string, query: string, log: PipelineContext['log']): Promise<DownloadRow[]> {
  const base = `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(projectId)}`
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  let res = await fetchJson<QueryResponse>(`${base}/queries`, {
    method: 'POST',
    headers,
    timeoutMs: 120_000,
    body: JSON.stringify({ query, useLegacySql: false, timeoutMs: 60_000, maxResults: 10_000, maximumBytesBilled: '300000000000' }),
  })
  const jobId = res.jobReference?.jobId
  const location = res.jobReference?.location ?? ''
  if (!jobId) throw new Error('BigQuery returned no job reference')
  const resultsUrl = (params: Record<string, string>) =>
    `${base}/queries/${encodeURIComponent(jobId)}?${new URLSearchParams({ location, timeoutMs: '60000', maxResults: '10000', ...params }).toString()}`
  while (!res.jobComplete) {
    res = await fetchJson<QueryResponse>(resultsUrl({}), { headers, timeoutMs: 120_000 })
  }
  const fields = (res.schema?.fields ?? []).map((f) => f.name)
  const rows: DownloadRow[] = []
  for (;;) {
    for (const row of res.rows ?? []) {
      const record: Record<string, string | null> = {}
      row.f.forEach((cell, i) => {
        record[fields[i] ?? String(i)] = cell.v
      })
      rows.push({ country_code: record.country_code ?? '', project: record.project ?? '', downloads: Number(record.downloads ?? 0) })
    }
    if (!res.pageToken) break
    res = await fetchJson<QueryResponse>(resultsUrl({ pageToken: res.pageToken }), { headers, timeoutMs: 120_000 })
  }
  log.info(`BigQuery job ${jobId}: ${rows.length} rows, ${(Number(res.totalBytesProcessed ?? 0) / 1e9).toFixed(1)} GB processed`)
  return rows
}

export function buildDownloads(rows: readonly DownloadRow[], asOf: string): SdkDownloadsByCountry {
  const byAssistant = new Map(PACKAGES.map((p) => [p.name, p.assistant]))
  const byCountry = new Map<string, Record<string, number>>()
  for (const row of rows) {
    const cc = row.country_code.toUpperCase()
    if (!isAlpha2(cc) || !byAssistant.has(row.project)) continue
    const downloads = byCountry.get(cc) ?? {}
    byCountry.set(cc, downloads)
    downloads[row.project] = (downloads[row.project] ?? 0) + row.downloads
  }
  const countries = [...byCountry]
    .map(([cc, downloads]) => {
      const sorted: Record<string, number> = {}
      for (const p of PACKAGES) {
        const count = downloads[p.name]
        if (count !== undefined) sorted[p.name] = count
      }
      const counts: Partial<Record<ProgramId, number>> = {}
      for (const p of PACKAGES) counts[p.assistant] = (counts[p.assistant] ?? 0) + (sorted[p.name] ?? 0)
      const total = Object.values(sorted).reduce((a, b) => a + b, 0)
      return { cc, name: countryName(cc), downloads: sorted, total, leading: leadingProgram(counts) }
    })
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total || a.cc.localeCompare(b.cc))
  return { source: 'pypi_downloads', status: 'ok', as_of: asOf, period_days: PERIOD_DAYS, packages: PACKAGES, countries, note: DATA_NOTE }
}

export function buildStub(reason: string): SdkDownloadsByCountry {
  return {
    source: 'pypi_downloads',
    status: 'not_configured',
    as_of: null,
    period_days: PERIOD_DAYS,
    packages: PACKAGES,
    countries: [],
    note: `${SETUP_NOTE} Missing: ${reason}.`,
  }
}

export const pypiSource: Source = {
  meta: {
    id: 'pypi_downloads',
    key: 'pypi',
    title: 'PyPI SDK downloads by country',
    publisher: 'Python Software Foundation (PyPI) via Google BigQuery public datasets',
    url: 'https://console.cloud.google.com/marketplace/product/gcp-public-data-pypi/pypi',
    license: 'BigQuery public dataset bigquery-public-data.pypi (PyPI download statistics, published under the PSF\'s open data terms)',
    description: `Downloads of the openai, anthropic, google-genai and mistralai Python packages by country over the last ${PERIOD_DAYS} complete days.`,
    staleAfterDays: 45,
  },
  async fetch(ctx: PipelineContext): Promise<SourceResult> {
    const log = ctx.log.child('pypi')
    const creds = credentialsFromEnv(ctx.env)
    if ('missing' in creds) {
      log.info(`not configured (${creds.missing} unset); writing stub`)
      return { file: 'sdk-downloads-by-country.json', data: buildStub(creds.missing), as_of: null, freshness_date: null, notes: [], status: 'not_configured' }
    }
    const token = await creds.auth.getAccessToken()
    if (!token) throw new Error('could not obtain a Google access token')
    const today = toIsoDate(ctx.now)
    const start = addDays(today, -PERIOD_DAYS)
    const rows = await runQuery(creds.projectId, token, buildQuery(start, today), log)
    const data = buildDownloads(rows, addDays(today, -1))
    log.info(`${data.countries.length} countries`)
    return {
      file: 'sdk-downloads-by-country.json',
      data,
      as_of: data.as_of,
      freshness_date: data.as_of,
      notes: [`Window ${start} to ${addDays(today, -1)} (${PERIOD_DAYS} complete days); ${rows.length} country/package rows.`],
    }
  },
}
