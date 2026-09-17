import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { useReducedMotion } from '@/hooks/useMediaQuery'
import type { DataSource } from '@/data/types'
import { bindGlobeController } from './controller'
import type { GlobeEngine } from './engine'

const INTENSITY_REFRESH_MS = 60_000

type Status = 'loading' | 'ready' | 'error'

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    // Release the probe context right away; browsers cap live WebGL contexts.
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return Boolean(gl)
  } catch {
    return false
  }
}

export function GlobeViewer({ source, onRestart }: { source: DataSource | null; onRestart: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<GlobeEngine | null>(null)
  const [engine, setEngine] = useState<GlobeEngine | null>(null)
  const [hasWebgl] = useState(webglAvailable)
  const [status, setStatus] = useState<Status>(hasWebgl ? 'loading' : 'error')
  const [error, setError] = useState<string | null>(
    hasWebgl ? null : 'Your browser or device could not start WebGL, which the 3D globe needs. The analytics panel and live feed still work.',
  )
  const [hover, setHover] = useState<{ city: string; x: number; y: number } | null>(null)

  const layer = useAppStore((s) => s.layer)
  const theme = useAppStore((s) => s.theme)
  const selectedCity = useAppStore((s) => s.selectedCity)
  const rotationPaused = useAppStore((s) => s.rotationPaused)
  const feed = useAppStore((s) => s.feed)
  const selectCity = useAppStore((s) => s.selectCity)
  const reducedMotion = useReducedMotion()

  // Create the Cesium viewer once.
  useEffect(() => {
    const container = containerRef.current
    if (!container || !hasWebgl) return

    let cancelled = false
    let created: GlobeEngine | null = null
    const fallbackTimer = setTimeout(() => !cancelled && setStatus((s) => (s === 'loading' ? 'ready' : s)), 12_000)

    ;(async () => {
      try {
        const { GlobeEngine } = await import('./engine')
        if (cancelled) return
        created = await GlobeEngine.create(container, {})
        if (cancelled) {
          created.destroy()
          return
        }
        engineRef.current = created
        if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
          ;(window as unknown as { __globe?: GlobeEngine }).__globe = created
        }
        setEngine(created)
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          setError('The globe failed to start. Try reloading the page.')
          setStatus('error')
        }
      }
    })()

    return () => {
      cancelled = true
      clearTimeout(fallbackTimer)
      bindGlobeController(null)
      created?.destroy()
      engineRef.current = null
    }
  }, [hasWebgl])

  // Events that need fresh store actions.
  useEffect(() => {
    if (!engine) return
    engine.setEvents({
      onCityClick: (city) => {
        if (city) selectCity(city)
      },
      onCityHover: setHover,
      onFirstTilesLoaded: () => setStatus('ready'),
      onRenderError: (message) => {
        setError(
          message === 'context-lost'
            ? 'The graphics card ran out of memory and the globe stopped. Restarting it usually fixes this.'
            : 'The globe hit a rendering error and stopped.',
        )
        setStatus('error')
      },
    })
    bindGlobeController({
      zoomIn: () => engine.zoom(1),
      zoomOut: () => engine.zoom(-1),
      resetView: () => {
        selectCity(null)
        engine.resetView()
      },
    })
  }, [engine, selectCity])

  useEffect(() => engine?.setTheme(theme), [engine, theme])
  useEffect(() => engine?.setLayer(layer), [engine, layer])
  useEffect(() => engine?.setReducedMotion(reducedMotion), [engine, reducedMotion])
  useEffect(() => engine?.setRotationWanted(!rotationPaused), [engine, rotationPaused])
  useEffect(() => engine?.selectCity(selectedCity), [engine, selectedCity])

  // City activity levels: load now, then refresh each minute as the sun moves.
  useEffect(() => {
    if (!engine || !source) return
    let cancelled = false
    const load = () =>
      source
        .getCityIntensities()
        .then((values) => !cancelled && engine.setIntensities(values))
        .catch((err) => console.warn('Could not load city activity', err))
    void load()
    const timer = setInterval(load, INTENSITY_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [engine, source])

  // Flash each new live event on the globe.
  const lastFlashed = useRef<string | null>(null)
  useEffect(() => {
    if (!engine || feed.length === 0) return
    const newest = feed[0]
    if (lastFlashed.current === null) {
      lastFlashed.current = newest.id
      return
    }
    if (newest.id === lastFlashed.current) return
    const fresh = []
    for (const activity of feed) {
      if (activity.id === lastFlashed.current) break
      fresh.push(activity)
    }
    lastFlashed.current = newest.id
    fresh.reverse().forEach((a) => engine.flash(a))
  }, [engine, feed])

  return (
    <section className="globe" aria-label="Interactive 3D globe">
      <p className="sr-only">
        A rotating globe showing simulated AI activity by city. Drag to rotate, scroll or pinch to zoom, and select a city
        for details. The analytics panel lists the same data as text.
      </p>
      <div ref={containerRef} className="globe-canvas" />

      {status === 'loading' && (
        <div className="globe-overlay" role="status">
          <div className="spinner" aria-hidden="true" />
          <p>Loading NASA imagery…</p>
        </div>
      )}

      {status === 'error' && error && (
        <div className="globe-overlay globe-error" role="alert">
          <p>{error}</p>
          {hasWebgl && (
            <button type="button" className="btn" onClick={onRestart}>
              Restart globe
            </button>
          )}
        </div>
      )}

      {hover && (
        <div className="globe-tooltip" style={{ transform: `translate(${hover.x + 14}px, ${hover.y + 14}px)` }} aria-hidden="true">
          {hover.city}
        </div>
      )}
    </section>
  )
}
