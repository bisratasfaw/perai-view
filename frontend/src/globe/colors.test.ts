import { describe, expect, it } from 'vitest'
import { MAP_COLORS } from '@shared/programs'
import { HEAT_GRADIENT_CSS, heatColor, hexToRgb, lighten, programMapColor } from './colors'

const luminance = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b

describe('colour helpers', () => {
  it('parses hex colours', () => {
    expect(hexToRgb('#199e70')).toEqual([25, 158, 112])
  })

  it('lightens toward white', () => {
    expect(lighten([0, 100, 200], 0.5)).toEqual([127.5, 177.5, 227.5])
    expect(lighten([10, 20, 30], 0)).toEqual([10, 20, 30])
  })

  it('maps non-highlighted assistants to the shared Other colour', () => {
    expect(programMapColor('claude')).toBe(MAP_COLORS.claude)
    expect(programMapColor('copilot')).toBe(MAP_COLORS.other)
    expect(programMapColor('unknown')).toBe(MAP_COLORS.other)
  })
})

describe('heat ramp', () => {
  it('is transparent at zero and nearly opaque at the top', () => {
    expect(heatColor(0)[3]).toBe(0)
    expect(heatColor(1)[3]).toBeGreaterThan(230)
  })

  it('gets lighter and more opaque as values rise (sequential ramp)', () => {
    let prev = heatColor(0)
    for (let v = 0.05; v <= 1.0001; v += 0.05) {
      const next = heatColor(v)
      expect(luminance(next)).toBeGreaterThanOrEqual(luminance(prev))
      expect(next[3]).toBeGreaterThanOrEqual(prev[3])
      prev = next
    }
  })

  it('clamps out-of-range values', () => {
    expect(heatColor(-1)).toEqual(heatColor(0))
    expect(heatColor(2)).toEqual(heatColor(1))
  })

  it('exposes a CSS gradient for the legend', () => {
    expect(HEAT_GRADIENT_CSS.startsWith('linear-gradient(90deg')).toBe(true)
  })
})
