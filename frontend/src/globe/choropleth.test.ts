import { describe, expect, it } from 'vitest'
import { CHOROPLETH_GRADIENT_CSS, CHOROPLETH_NO_DATA, choroplethColor, normaliseValues } from './choropleth'

const luminance = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b

describe('choropleth colour ramp', () => {
  it('gets lighter with value and clamps', () => {
    let prev = choroplethColor(0)
    for (let v = 0.1; v <= 1.0001; v += 0.1) {
      const next = choroplethColor(v)
      expect(luminance(next)).toBeGreaterThan(luminance(prev))
      prev = next
    }
    expect(choroplethColor(-5)).toEqual(choroplethColor(0))
    expect(choroplethColor(7)).toEqual(choroplethColor(1))
    expect(CHOROPLETH_NO_DATA[3]).toBeLessThan(0.2)
    expect(CHOROPLETH_GRADIENT_CSS).toMatch(/^linear-gradient\(90deg/)
  })
})

describe('normaliseValues', () => {
  it('square-roots skewed counts so the maximum is 1', () => {
    const out = normaliseValues(new Map([['A', 100], ['B', 25], ['C', 0], ['D', -3]]), 'sqrt')
    expect(out.get('A')).toBe(1)
    expect(out.get('B')).toBeCloseTo(0.5)
    expect(out.has('C')).toBe(false)
    expect(out.has('D')).toBe(false)
  })

  it('clips linear scales at the 97th percentile so one outlier does not flatten the rest', () => {
    const values = new Map(Array.from({ length: 100 }, (_, i) => [`k${i}`, i + 1]))
    values.set('outlier', 10_000)
    const out = normaliseValues(values, 'linear')
    expect(out.get('outlier')).toBe(1)
    expect(out.get('k99')!).toBeGreaterThan(0.95)
  })

  it('handles empty input', () => {
    expect(normaliseValues(new Map(), 'sqrt').size).toBe(0)
  })
})
