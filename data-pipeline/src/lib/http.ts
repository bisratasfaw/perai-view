import { setTimeout as sleep } from 'node:timers/promises'
import { errorMessage } from './log'

/** Wikimedia and GitHub ask automated clients to identify themselves with a contact URL. */
export const USER_AGENT = 'PerAI-View-data-pipeline/1.0 (https://github.com/bisratasfaw/perai-view; nightly open-data refresh)'

export interface RequestOptions {
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  /** Time allowed for the response headers to arrive. Streaming bodies rely on undici's idle timeout. */
  timeoutMs?: number
  /** Retries on network errors, 408/425/429/5xx, and 403 with a Retry-After header (GitHub secondary limits). */
  retries?: number
  /** Statuses returned instead of thrown (e.g. 404 when "no data" is a normal answer). */
  okStatuses?: number[]
  /** Injection point for tests. */
  fetchImpl?: typeof fetch
}

export class HttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
    readonly bodySnippet: string,
  ) {
    super(`HTTP ${status} for ${url}${bodySnippet ? `: ${bodySnippet}` : ''}`)
    this.name = 'HttpError'
  }
}

function isRetryable(res: Response): boolean {
  const { status } = res
  if (status === 408 || status === 425 || status === 429 || status >= 500) return true
  return status === 403 && res.headers.has('retry-after')
}

function retryAfterMs(res: Response): number | undefined {
  const header = res.headers.get('retry-after')
  if (header === null) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const at = Date.parse(header)
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now())
}

function backoffMs(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** attempt) + Math.random() * 500
}

export async function fetchWithRetry(url: string, options: RequestOptions = {}): Promise<Response> {
  const { timeoutMs = 30_000, retries = 4, okStatuses = [], fetchImpl = fetch } = options
  const headers = { 'user-agent': USER_AGENT, ...options.headers }
  let delay = 0
  for (let attempt = 0; ; attempt++) {
    if (delay > 0) await sleep(delay)
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort(new Error(`timeout after ${timeoutMs} ms`))
    }, timeoutMs)
    let res: Response
    try {
      res = await fetchImpl(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.body,
        signal: controller.signal,
        redirect: 'follow',
      })
    } catch (error) {
      clearTimeout(timer)
      if (attempt >= retries) throw new Error(`${url}: ${errorMessage(error)}`, { cause: error })
      delay = backoffMs(attempt)
      continue
    }
    if (res.ok || okStatuses.includes(res.status)) {
      clearTimeout(timer)
      return res
    }
    const snippet = (await res.text().catch(() => '')).slice(0, 200).replace(/\s+/g, ' ')
    clearTimeout(timer)
    if (!isRetryable(res) || attempt >= retries) throw new HttpError(url, res.status, snippet)
    delay = Math.min(retryAfterMs(res) ?? backoffMs(attempt), 120_000)
  }
}

export async function fetchJson<T = unknown>(url: string, options: RequestOptions = {}): Promise<T> {
  const res = await fetchWithRetry(url, { ...options, headers: { accept: 'application/json', ...options.headers } })
  return (await res.json()) as T
}

export async function fetchText(url: string, options: RequestOptions = {}): Promise<string> {
  const res = await fetchWithRetry(url, options)
  return res.text()
}
