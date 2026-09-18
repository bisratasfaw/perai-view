import { type SourceInfo } from '@shared/realData'
import { daysBetween, toIsoDate } from './lib/dates'
import { type SourceMeta, type SourceResult } from './sources/types'

export type Outcome =
  | { kind: 'fetched'; result: SourceResult }
  | { kind: 'failed'; error: string }
  /** Not selected for this run (or skipped): the previous snapshot and manifest entry are kept. */
  | { kind: 'kept' }

/** `stale` when the data is older than the source's cadence allows; static sources never go stale. */
export function computeStatus(meta: SourceMeta, freshnessDate: string | null, now: Date): 'ok' | 'stale' {
  if (meta.staleAfterDays === null || freshnessDate === null) return 'ok'
  return daysBetween(freshnessDate, toIsoDate(now)) > meta.staleAfterDays ? 'stale' : 'ok'
}

export function buildSourceInfo(
  meta: SourceMeta,
  outcome: Outcome,
  previous: SourceInfo | undefined,
  previousFreshness: string | null,
  now: Date,
): { info: SourceInfo; freshness_date: string | null } {
  const base = {
    id: meta.id,
    title: meta.title,
    publisher: meta.publisher,
    url: meta.url,
    license: meta.license,
    description: meta.description,
  }
  switch (outcome.kind) {
    case 'fetched': {
      const { result } = outcome
      const status = result.status === 'not_configured' ? 'not_configured' : computeStatus(meta, result.freshness_date, now)
      return {
        info: { ...base, status, fetched_at: now.toISOString(), as_of: result.as_of, error: null, notes: result.notes },
        freshness_date: result.freshness_date,
      }
    }
    case 'failed':
      return {
        info: {
          ...base,
          status: 'failed',
          fetched_at: previous?.fetched_at ?? null,
          as_of: previous?.as_of ?? null,
          error: outcome.error,
          notes: previous?.notes ?? [],
        },
        freshness_date: previousFreshness,
      }
    case 'kept': {
      if (!previous) {
        return {
          info: { ...base, status: 'failed', fetched_at: null, as_of: null, error: 'never fetched', notes: [] },
          freshness_date: null,
        }
      }
      const status = previous.status === 'ok' || previous.status === 'stale' ? computeStatus(meta, previousFreshness, now) : previous.status
      return { info: { ...base, status, fetched_at: previous.fetched_at, as_of: previous.as_of, error: previous.error, notes: previous.notes }, freshness_date: previousFreshness }
    }
  }
}
