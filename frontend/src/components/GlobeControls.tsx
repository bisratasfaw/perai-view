import { Home, Minus, Pause, Play, Plus } from 'lucide-react'
import { globeController } from '@/globe/controller'
import { useReducedMotion } from '@/hooks/useMediaQuery'
import { useAppStore } from '@/store'

export function GlobeControls() {
  const paused = useAppStore((s) => s.rotationPaused)
  const setPaused = useAppStore((s) => s.setRotationPaused)
  const reducedMotion = useReducedMotion()

  return (
    <div className="globe-controls surface" role="group" aria-label="Globe controls">
      <button type="button" className="btn" aria-label="Zoom in" onClick={() => globeController.zoomIn()}>
        <Plus size={18} aria-hidden="true" />
      </button>
      <button type="button" className="btn" aria-label="Zoom out" onClick={() => globeController.zoomOut()}>
        <Minus size={18} aria-hidden="true" />
      </button>
      <button type="button" className="btn" aria-label="Reset view" onClick={() => globeController.resetView()}>
        <Home size={17} aria-hidden="true" />
      </button>
      {!reducedMotion && (
        <>
          <hr />
          <button
            type="button"
            className="btn"
            aria-label="Pause rotation"
            aria-pressed={paused}
            onClick={() => setPaused(!paused)}
          >
            {paused ? <Play size={17} aria-hidden="true" /> : <Pause size={17} aria-hidden="true" />}
          </button>
        </>
      )}
    </div>
  )
}
