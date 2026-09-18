import { type ActivityTypeSeries, type SourceId } from '@shared/realData'
import { type PipelineContext } from '../context'

export interface SourceMeta {
  id: SourceId
  /** Short name accepted by `--only` / `--skip`. */
  key: string
  title: string
  publisher: string
  url: string
  license: string
  description: string
  /**
   * Data older than this (measured from `freshness_date`) is reported as `stale`. Null for
   * static transcriptions that have no refresh cadence.
   */
  staleAfterDays: number | null
}

export interface SourceResult {
  /** Snapshot file this source owns (a name from REAL_DATA_FILES), or null when it only contributes series. */
  file: string | null
  data: unknown
  /** Entries for activity-types.json; the orchestrator merges them across sources. */
  series?: ActivityTypeSeries[]
  /** Human-readable currency shown next to the numbers, e.g. "2026-09-16" or "May 2026". */
  as_of: string | null
  /** ISO date the staleness check compares against: window end or publication date. */
  freshness_date: string | null
  notes: string[]
  status?: 'ok' | 'not_configured'
}

export interface Source {
  meta: SourceMeta
  fetch(ctx: PipelineContext): Promise<SourceResult>
}
