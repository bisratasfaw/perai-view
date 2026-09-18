/**
 * Sequential colour ramp for country choropleths on the dark globe: one hue (teal → white),
 * lightness rising with value, so it reads without hue discrimination and is distinct from
 * the amber simulated heat map.
 */
export type Rgba = [number, number, number, number]

const STOPS: [number, number, number, number][] = [
  // value, r, g, b
  [0, 14, 70, 78],
  [0.25, 18, 118, 122],
  [0.5, 34, 172, 162],
  [0.75, 122, 216, 196],
  [1, 226, 250, 240],
]

export const CHOROPLETH_NO_DATA: Rgba = [255, 255, 255, 0.05]

export function choroplethColor(t: number): Rgba {
  const v = Math.min(1, Math.max(0, t))
  for (let i = 1; i < STOPS.length; i++) {
    const [v1, r1, g1, b1] = STOPS[i]
    if (v <= v1) {
      const [v0, r0, g0, b0] = STOPS[i - 1]
      const k = (v - v0) / (v1 - v0)
      return [r0 + (r1 - r0) * k, g0 + (g1 - g0) * k, b0 + (b1 - b0) * k, 0.78]
    }
  }
  const last = STOPS[STOPS.length - 1]
  return [last[1], last[2], last[3], 0.78]
}

export const CHOROPLETH_GRADIENT_CSS = `linear-gradient(90deg, ${STOPS.map(([v, r, g, b]) => `rgb(${r},${g},${b}) ${v * 100}%`).join(', ')})`

/**
 * Maps raw values to 0–1 for colouring. Skewed data (usage shares, download counts) uses a
 * square-root scale so a few dominant countries don't wash everything else out; ratios such as
 * the per-capita index use a linear scale clipped at a high percentile.
 */
export function normaliseValues(values: Map<string, number>, mode: 'sqrt' | 'linear'): Map<string, number> {
  const nums = [...values.values()].filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b)
  if (nums.length === 0) return new Map()
  const max = mode === 'linear' ? nums[Math.min(nums.length - 1, Math.floor(nums.length * 0.97))] : nums[nums.length - 1]
  const out = new Map<string, number>()
  for (const [key, v] of values) {
    if (!Number.isFinite(v) || v <= 0) continue
    out.set(key, Math.min(1, mode === 'sqrt' ? Math.sqrt(v / max) : v / max))
  }
  return out
}
