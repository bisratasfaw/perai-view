import { describe, expect, it } from 'vitest'
import { activityTypeSeriesSchema } from '@shared/realData'
import { OPENAI_SERIES } from '../src/sources/openai'

function sum(categories: readonly { share: number }[]): number {
  return categories.reduce((acc, c) => acc + c.share, 0)
}

describe('OpenAI "How People Use ChatGPT" series', () => {
  it('has shares between 0 and 1 that sum to 1 ± 0.005, now and previously', () => {
    expect(Math.abs(sum(OPENAI_SERIES.categories) - 1)).toBeLessThanOrEqual(0.005)
    expect(OPENAI_SERIES.previous).not.toBeNull()
    expect(Math.abs(sum(OPENAI_SERIES.previous?.categories ?? []) - 1)).toBeLessThanOrEqual(0.005)
    for (const c of OPENAI_SERIES.categories) expect(c.share).toBeGreaterThan(0)
  })

  it('quotes the values stated in the paper', () => {
    const share = (label: string) => OPENAI_SERIES.categories.find((c) => c.label === label)?.share
    expect(share('Practical guidance')).toBe(0.29)
    expect(share('Seeking information')).toBe(0.24)
    expect(share('Writing')).toBe(0.24)
    expect(share('Technical help')).toBe(0.05)
    expect(share('Multimedia')).toBe(0.07)
    expect(OPENAI_SERIES.categories.at(-1)?.note).toMatch(/remainder/i)
    expect(OPENAI_SERIES.method).toBe("Transcribed from the paper's text (Figure 7 discussion)")
  })

  it('matches the shared schema', () => {
    expect(activityTypeSeriesSchema.safeParse(OPENAI_SERIES).success).toBe(true)
  })
})
