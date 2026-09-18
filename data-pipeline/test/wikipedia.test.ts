import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { dateRange, lastFullDays } from '../src/lib/dates'
import { linesOfString } from '../src/lib/lines'
import { aggregateCountryDays, ARTICLES, leadingProgram, sumCountryViews } from '../src/sources/wikipedia'

const fixture = readFileSync(new URL('./fixtures/country_project_page-sample.tsv', import.meta.url), 'utf8')
const qidToAssistant = new Map(ARTICLES.map((a) => [a.qid, a.assistant]))

describe('sumCountryViews (country_project_page TSV)', () => {
  it('sums views per country and assistant for tracked Wikidata items only', async () => {
    const sums = await sumCountryViews(linesOfString(fixture), qidToAssistant)
    expect(sums).toEqual({
      US: { chatgpt: 5330, claude: 1300 },
      IN: { chatgpt: 2700 },
      DE: { gemini: 410, mistral: 95 },
    })
  })
})

describe('aggregateCountryDays', () => {
  it('sums the cached days inside the window and reports which days were covered', () => {
    const days = dateRange('2026-08-18', '2026-09-16')
    expect(days).toHaveLength(30)
    const cache = {
      '2026-08-17': { US: { chatgpt: 999 } }, // outside the window
      '2026-08-18': { US: { chatgpt: 100, claude: 50 }, DE: { gemini: 10 } },
      '2026-09-16': { US: { chatgpt: 200 }, IN: { chatgpt: 30, gemini: 30 } },
    }
    const { by_country, days_covered } = aggregateCountryDays(cache, days)
    expect(days_covered).toEqual(['2026-08-18', '2026-09-16'])
    expect(by_country).toEqual([
      { cc: 'US', name: 'United States', views: { chatgpt: 300, claude: 50 }, total: 350, leading: 'chatgpt' },
      { cc: 'IN', name: 'India', views: { chatgpt: 30, gemini: 30 }, total: 60, leading: 'chatgpt' },
      { cc: 'DE', name: 'Germany', views: { gemini: 10 }, total: 10, leading: 'gemini' },
    ])
  })

  it('breaks ties in PROGRAM_IDS order', () => {
    expect(leadingProgram({ gemini: 5, claude: 5 })).toBe('gemini')
    expect(leadingProgram({})).toBe('other')
  })
})

describe('lastFullDays', () => {
  it('ends yesterday in UTC and spans the requested count', () => {
    const window = lastFullDays(new Date('2026-09-17T04:15:00Z'), 30)
    expect(window).toMatchObject({ start: '2026-08-18', end: '2026-09-16' })
    expect(window.days).toHaveLength(30)
  })
})
