import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { aiUsageByCountrySchema, activityTypeSeriesSchema } from '@shared/realData'
import { csvRecords, parseCsvLine } from '../src/lib/csv'
import { linesOfString } from '../src/lib/lines'
import { extractFromCsv } from '../src/sources/anthropic'

const fixture = readFileSync(new URL('./fixtures/aei-sample.csv', import.meta.url), 'utf8')

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const item of iterable) out.push(item)
  return out
}

describe('parseCsvLine', () => {
  it('splits plain fields', () => {
    expect(parseCsvLine('a,b,,d')).toEqual(['a', 'b', '', 'd'])
  })

  it('keeps commas and doubled quotes inside quoted fields', () => {
    expect(parseCsvLine('1,"Prepare documents, reports",x')).toEqual(['1', 'Prepare documents, reports', 'x'])
    expect(parseCsvLine('"He said ""hi""",2')).toEqual(['He said "hi"', '2'])
  })
})

describe('csvRecords', () => {
  it('keys values by the header, skips blank lines and joins quoted line breaks', async () => {
    const text = 'id,name\n1,"multi\nline"\n\n2,plain\n'
    const rows = await collect(csvRecords(linesOfString(text)))
    expect(rows).toEqual([
      { id: '1', name: 'multi\nline' },
      { id: '2', name: 'plain' },
    ])
  })

  it('ignores a UTF-8 byte order mark on the header', async () => {
    const rows = await collect(csvRecords(linesOfString('﻿a,b\n1,2')))
    expect(rows).toEqual([{ a: '1', b: '2' }])
  })
})

describe('extractFromCsv (Anthropic Economic Index)', () => {
  it('keeps the latest month of country usage, US states and top-level request shares', async () => {
    const { usage, series, notes } = await extractFromCsv(linesOfString(fixture), 'release_2026_06_26', '2026-06-26')

    expect(usage.as_of).toBe('May 2026')
    expect(usage.period).toEqual({ start: '2026-05-01', end: '2026-05-31' })
    expect(usage.countries.map((c) => c.cc)).toEqual(['US', 'IN', 'DE'])
    expect(usage.countries[0]).toMatchObject({ cc: 'US', name: 'United States', usage_pct: 21.6, usage_per_capita_index: 3.62, usage_count: null, usage_tier: null })
    expect(usage.countries[2]?.usage_per_capita_index).toBeNull()
    expect(usage.us_states).toEqual([
      { code: 'CA', name: 'California', usage_pct: 25.4, usage_per_capita_index: 2.1 },
      { code: 'NY', name: 'New York', usage_pct: 9.8, usage_per_capita_index: null },
    ])
    expect(notes.some((n) => n.includes('XXX'))).toBe(true)

    expect(series).toHaveLength(1)
    const [s] = series
    expect(s?.as_of).toBe('May 2026')
    expect(s?.categories.map((c) => c.label)).toEqual([
      'Software Development',
      'Existential, Relational, and Emotional Support',
      'Not published (below reporting threshold)',
    ])
    expect(s?.categories.reduce((a, c) => a + c.share, 0)).toBeCloseTo(1, 6)
    expect(s?.previous?.as_of).toBe('April 2026')
    expect(s?.previous?.categories).toEqual([
      { label: 'Existential, Relational, and Emotional Support', share: 0.5 },
      { label: 'Software Development', share: 0.5 },
    ])
  })

  it('produces data that satisfies the shared schemas (with enough countries)', async () => {
    const { usage, series } = await extractFromCsv(linesOfString(fixture), 'release_2026_06_26', '2026-06-26')
    const first = usage.countries[0]
    if (!first) throw new Error('fixture yielded no countries')
    const padded = { ...usage, countries: [...usage.countries, ...Array.from({ length: 20 }, (_, i) => ({ ...first, cc: `A${String.fromCharCode(65 + i)}` }))] }
    expect(aiUsageByCountrySchema.safeParse(padded).success).toBe(true)
    expect(activityTypeSeriesSchema.safeParse(series[0]).success).toBe(true)
  })
})
