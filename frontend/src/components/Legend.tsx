import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { MAP_LEGEND, getProgram } from '@shared/programs'
import { useRealData } from '@/data/realData'
import { useLayerData } from '@/data/useLayerData'
import { CHOROPLETH_GRADIENT_CSS } from '@/globe/choropleth'
import { HEAT_GRADIENT_CSS } from '@/globe/colors'
import { useIsCompact } from '@/hooks/useMediaQuery'
import { getLayer } from '@/layers'
import { useAppStore } from '@/store'

const DEVELOPER_LEGEND = [
  { key: 'chatgpt', label: 'OpenAI SDKs lead' },
  { key: 'gemini', label: 'Google SDKs lead' },
  { key: 'claude', label: 'Anthropic SDKs lead' },
  { key: 'other', label: 'Other SDKs lead' },
] as const

export function Legend() {
  const layer = useAppStore((s) => s.layer)
  const open = useAppStore((s) => s.legendOpen)
  const setOpen = useAppStore((s) => s.setLegendOpen)
  const setAboutOpen = useAppStore((s) => s.setAboutOpen)
  const compact = useIsCompact()
  const def = getLayer(layer)!
  const layerData = useLayerData(layer)
  const manifest = useRealData('manifest', def.kind === 'real')
  const source = def.source && manifest.status === 'ready' ? manifest.data.sources[def.source] : null
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

  const title =
    layer === 'activity' ? 'Leading assistant' : layer === 'heat' ? 'Activity right now' : layer === 'dev-cities' ? 'Developers by city' : def.short

  if (compact && !open) {
    return (
      <button ref={toggleRef} type="button" className="legend-toggle surface" aria-expanded={false} aria-controls="legend" onClick={() => toggle(true)}>
        <span className="legend-toggle-swatches" aria-hidden="true">
          {layer === 'activity' ? (
            MAP_LEGEND.map((item) => <span key={item.key} className="swatch" style={{ background: item.color }} />)
          ) : (
            <span className="heat-bar" style={{ background: def.geometry === 'countries' ? CHOROPLETH_GRADIENT_CSS : HEAT_GRADIENT_CSS, width: 44, height: 8 }} />
          )}
        </span>
        Legend
      </button>
    )
  }

  const provenance = def.kind === 'real' && (
    <p className="legend-source">
      {source ? `${source.publisher}${source.as_of ? ` · ${source.as_of}` : ''}` : 'Snapshot'}
      {' · '}
      <button type="button" className="link-btn" onClick={() => setAboutOpen(true)}>
        about this data
      </button>
    </p>
  )

  return (
    <section id="legend" className="legend surface" aria-labelledby="legend-title">
      <div className="legend-head">
        <h2 id="legend-title" className="control-label">
          {title}
        </h2>
        {compact && (
          <button ref={closeRef} type="button" className="btn icon-btn btn-ghost legend-close" aria-expanded={true} aria-label="Hide legend" onClick={() => toggle(false)}>
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      {layer === 'activity' && (
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
      )}

      {layer === 'heat' && (
        <>
          <div className="heat-bar" style={{ background: HEAT_GRADIENT_CSS }} aria-hidden="true" />
          <div className="heat-scale">
            <span>Quiet</span>
            <span>Busy</span>
          </div>
          <p className="legend-note">Glow shows combined activity near each city at its current local time.</p>
        </>
      )}

      {def.kind === 'real' && def.geometry === 'countries' && (
        <>
          <div className="heat-bar" style={{ background: CHOROPLETH_GRADIENT_CSS }} aria-hidden="true" />
          <div className="heat-scale">
            <span className="num">{layerData.status === 'ready' && layerData.data.geometry === 'countries' ? layerData.data.range.min : '–'}</span>
            <span className="num">{layerData.status === 'ready' && layerData.data.geometry === 'countries' ? layerData.data.range.max : '–'}</span>
          </div>
          <p className="legend-note">
            {layerData.status === 'ready' ? layerData.data.metric : def.description} Countries without published data stay unshaded.
          </p>
          {provenance}
        </>
      )}

      {layer === 'dev-cities' && (
        <>
          <ul>
            {DEVELOPER_LEGEND.map((item) => (
              <li key={item.key}>
                <span className="swatch" style={{ background: getProgram(item.key)?.color }} aria-hidden="true" />
                {item.label}
              </li>
            ))}
          </ul>
          <p className="legend-note">Beam height shows how many GitHub users in that city forked an official AI SDK repository (self-reported locations).</p>
          {provenance}
        </>
      )}
    </section>
  )
}
