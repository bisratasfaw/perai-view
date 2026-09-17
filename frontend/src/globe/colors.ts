import { MAP_COLORS, getProgram } from '@shared/programs'

export type Rgb = [number, number, number]

export function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Map colour for an assistant: its own hue if highlighted, else the shared "Other" colour. */
export function programMapColor(programId: string): string {
  const program = getProgram(programId)
  return program?.color ?? MAP_COLORS.other
}

/** Mix a colour toward white by `amount` (0–1). */
export function lighten([r, g, b]: Rgb, amount: number): Rgb {
  return [r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount]
}

/**
 * Sequential heat ramp for a dark globe: one warm hue family, lightness rising
 * with value, transparent at zero so quiet regions show the map underneath.
 * Returns [r, g, b, a] with components 0–255.
 */
const HEAT_STOPS: [number, number, number, number, number][] = [
  // value, r, g, b, alpha
  [0.0, 110, 28, 0, 0],
  [0.08, 150, 45, 6, 70],
  [0.3, 214, 92, 20, 150],
  [0.6, 250, 150, 48, 205],
  [0.85, 255, 206, 120, 232],
  [1.0, 255, 240, 205, 245],
]

export function heatColor(value: number): [number, number, number, number] {
  const v = Math.min(1, Math.max(0, value))
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    const [v1, r1, g1, b1, a1] = HEAT_STOPS[i]
    if (v <= v1) {
      const [v0, r0, g0, b0, a0] = HEAT_STOPS[i - 1]
      const t = (v - v0) / (v1 - v0)
      return [r0 + (r1 - r0) * t, g0 + (g1 - g0) * t, b0 + (b1 - b0) * t, a0 + (a1 - a0) * t].map(Math.round) as [
        number, number, number, number,
      ]
    }
  }
  const last = HEAT_STOPS[HEAT_STOPS.length - 1]
  return [last[1], last[2], last[3], last[4]]
}

/** CSS gradient matching the heat ramp, for the legend. */
export const HEAT_GRADIENT_CSS = `linear-gradient(90deg, ${HEAT_STOPS.map(
  ([v, r, g, b, a]) => `rgba(${r},${g},${b},${Math.max(0.25, a / 255).toFixed(2)}) ${Math.round(v * 100)}%`,
).join(', ')})`
