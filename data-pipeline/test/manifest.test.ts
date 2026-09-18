import { describe, expect, it } from 'vitest'
import { sourceInfoSchema, type SourceInfo } from '@shared/realData'
import { buildSourceInfo, computeStatus } from '../src/manifest'
import { type SourceMeta, type SourceResult } from '../src/sources/types'

const now = new Date('2026-09-17T04:15:00Z')

const meta: SourceMeta = {
  id: 'wikipedia_pageviews',
  key: 'wikipedia',
  title: 'T',
  publisher: 'P',
  url: 'https://example.org',
  license: 'L',
  description: 'D',
  staleAfterDays: 45,
}

function result(overrides: Partial<SourceResult> = {}): SourceResult {
  return { file: 'wikipedia-interest.json', data: {}, as_of: '2026-09-16', freshness_date: '2026-09-16', notes: ['n'], ...overrides }
}

describe('computeStatus', () => {
  it('is ok within the threshold and stale beyond it', () => {
    expect(computeStatus(meta, '2026-09-16', now)).toBe('ok')
    expect(computeStatus(meta, '2026-08-03', now)).toBe('ok') // exactly 45 days
    expect(computeStatus(meta, '2026-08-02', now)).toBe('stale')
  })

  it('never marks static sources or unknown dates as stale', () => {
    expect(computeStatus({ ...meta, staleAfterDays: null }, '2020-01-01', now)).toBe('ok')
    expect(computeStatus(meta, null, now)).toBe('ok')
  })
})

describe('buildSourceInfo', () => {
  it('records a successful fetch', () => {
    const { info, freshness_date } = buildSourceInfo(meta, { kind: 'fetched', result: result() }, undefined, null, now)
    expect(info).toMatchObject({ id: 'wikipedia_pageviews', status: 'ok', fetched_at: now.toISOString(), as_of: '2026-09-16', error: null, notes: ['n'] })
    expect(freshness_date).toBe('2026-09-16')
    expect(sourceInfoSchema.safeParse(info).success).toBe(true)
  })

  it('passes not_configured through', () => {
    const { info } = buildSourceInfo(meta, { kind: 'fetched', result: result({ status: 'not_configured', as_of: null, freshness_date: null }) }, undefined, null, now)
    expect(info.status).toBe('not_configured')
  })

  it('keeps the previous currency when a fetch fails', () => {
    const previous: SourceInfo = { ...buildSourceInfo(meta, { kind: 'fetched', result: result() }, undefined, null, now).info }
    const { info, freshness_date } = buildSourceInfo(meta, { kind: 'failed', error: 'boom' }, previous, '2026-09-16', now)
    expect(info).toMatchObject({ status: 'failed', error: 'boom', fetched_at: previous.fetched_at, as_of: '2026-09-16', notes: ['n'] })
    expect(freshness_date).toBe('2026-09-16')
  })

  it('reports failed with "never fetched" when nothing exists yet', () => {
    const { info } = buildSourceInfo(meta, { kind: 'failed', error: 'boom' }, undefined, null, now)
    expect(info).toMatchObject({ status: 'failed', fetched_at: null, as_of: null, error: 'boom' })
    expect(buildSourceInfo(meta, { kind: 'kept' }, undefined, null, now).info).toMatchObject({ status: 'failed', error: 'never fetched' })
  })

  it('re-evaluates staleness for a kept entry', () => {
    const previous = buildSourceInfo(meta, { kind: 'fetched', result: result() }, undefined, null, now).info
    const later = new Date('2026-12-01T04:15:00Z')
    expect(buildSourceInfo(meta, { kind: 'kept' }, previous, '2026-09-16', later).info.status).toBe('stale')
    expect(buildSourceInfo(meta, { kind: 'kept' }, previous, '2026-09-16', now).info.status).toBe('ok')
    expect(buildSourceInfo(meta, { kind: 'kept' }, { ...previous, status: 'not_configured' }, null, later).info.status).toBe('not_configured')
  })
})
