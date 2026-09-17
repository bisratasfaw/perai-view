import { heatColor } from './colors'

export interface HeatPoint {
  lat: number
  lng: number
  /** 0–1 activity right now. */
  intensity: number
  /** 1–100 city size; bigger cities spread further. */
  weight: number
}

export const HEAT_TEXTURE_WIDTH = 2048
export const HEAT_TEXTURE_HEIGHT = 1024

/**
 * Renders a continuous heat surface as an equirectangular texture that can be
 * draped over the whole globe. Blobs are accumulated additively in greyscale,
 * then coloured through the heat ramp.
 */
export function renderHeatCanvas(points: HeatPoint[], canvas = document.createElement('canvas')): HTMLCanvasElement {
  const width = HEAT_TEXTURE_WIDTH
  const height = HEAT_TEXTURE_HEIGHT
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return canvas

  const pxPerDeg = width / 360
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)
  ctx.globalCompositeOperation = 'lighter'

  for (const p of points) {
    if (p.intensity <= 0.01) continue
    const radiusDeg = 1.1 + 3.4 * Math.sqrt(p.weight / 100)
    const radius = radiusDeg * pxPerDeg
    // Stretch horizontally so blobs stay round on the sphere.
    const stretch = 1 / Math.max(0.25, Math.cos((p.lat * Math.PI) / 180))
    const y = ((90 - p.lat) / 180) * height
    const baseX = ((p.lng + 180) / 360) * width
    const strength = Math.min(1, 0.25 + p.intensity * 0.95)

    for (const offset of [-width, 0, width]) {
      const x = baseX + offset
      if (x + radius * stretch < 0 || x - radius * stretch > width) continue
      ctx.save()
      ctx.translate(x, y)
      ctx.scale(stretch, 1)
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius)
      gradient.addColorStop(0, `rgba(255,255,255,${(0.62 * strength).toFixed(3)})`)
      gradient.addColorStop(0.35, `rgba(255,255,255,${(0.34 * strength).toFixed(3)})`)
      gradient.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(0, 0, radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }

  const image = ctx.getImageData(0, 0, width, height)
  const data = image.data
  const lut: [number, number, number, number][] = []
  for (let i = 0; i < 256; i++) lut.push(heatColor(i / 255))
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = lut[data[i]]
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = a
  }
  ctx.globalCompositeOperation = 'copy'
  ctx.putImageData(image, 0, 0)
  return canvas
}
