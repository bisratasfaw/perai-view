import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { MAP_LEGEND } from '@shared/programs'
import { HEAT_GRADIENT_CSS } from '@/globe/colors'
import { useIsCompact } from '@/hooks/useMediaQuery'
import { useAppStore } from '@/store'

export function Legend() {
  const layer = useAppStore((s) => s.layer)
  const open = useAppStore((s) => s.legendOpen)
  const setOpen = useAppStore((s) => s.setLegendOpen)
  const compact = useIsCompact()
  const toggleRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const userToggled = useRef(false)

  // The toggle and close buttons replace each other, so move focus to whichever is now shown.
  useEffect(() => {
    if (!compact || !userToggled.current) return
    userToggled.current = false
    ;(open ? closeRef.current : toggleRef.current)?.focus()
  }, [open, compact])

  const toggle = (next: boolean) => {
    userToggled.current = true
    setOpen(next)
  }

  if (compact && !open) {
    return (
      <button
        ref={toggleRef}
        type="button"
        className="legend-toggle surface"
        aria-expanded={false}
        aria-controls="legend"
        onClick={() => toggle(true)}
      >
        <span className="legend-toggle-swatches" aria-hidden="true">
          {layer === 'activity' ? (
            MAP_LEGEND.map((item) => <span key={item.key} className="swatch" style={{ background: item.color }} />)
          ) : (
            <span className="heat-bar" style={{ background: HEAT_GRADIENT_CSS, width: 44, height: 8 }} />
          )}
        </span>
        Legend
      </button>
    )
  }

  return (
    <section id="legend" className="legend surface" aria-labelledby="legend-title">
      <div className="legend-head">
        <h2 id="legend-title" className="control-label">
          {layer === 'activity' ? 'Leading assistant' : 'Activity right now'}
        </h2>
        {compact && (
          <button
            ref={closeRef}
            type="button"
            className="btn icon-btn btn-ghost legend-close"
            aria-expanded={true}
            aria-label="Hide legend"
            onClick={() => toggle(false)}
          >
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      {layer === 'activity' ? (
        <>
          <ul>
            {MAP_LEGEND.map((item) => (
              <li key={item.key}>
                <span className="swatch" style={{ background: item.color }} aria-hidden="true" />
                {item.label}
              </li>
            ))}
          </ul>
          <p className="legend-note">Beam height shows how busy a city is right now. Cities on the daylit side are busier.</p>
        </>
      ) : (
        <>
          <div className="heat-bar" style={{ background: HEAT_GRADIENT_CSS }} aria-hidden="true" />
          <div className="heat-scale">
            <span>Quiet</span>
            <span>Busy</span>
          </div>
          <p className="legend-note">Glow shows combined activity near each city at its current local time.</p>
        </>
      )}
    </section>
  )
}
