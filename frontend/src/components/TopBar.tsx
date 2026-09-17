import { useEffect, useRef, useState } from 'react'
import { BarChart3, Flame, Info, Layers, MapPin, Moon, Sun } from 'lucide-react'
import { useAppStore, type GlobeTheme, type Layer } from '@/store'
import { useIsCompact } from '@/hooks/useMediaQuery'
import { BrandMark } from './BrandMark'
import { Segmented, type SegmentedOption } from './Segmented'

const LAYER_OPTIONS: SegmentedOption<Layer>[] = [
  { value: 'activity', label: 'Activity', icon: <MapPin size={15} aria-hidden="true" /> },
  { value: 'heat', label: 'Heat map', icon: <Flame size={15} aria-hidden="true" /> },
]

const THEME_OPTIONS: SegmentedOption<GlobeTheme>[] = [
  { value: 'natural', label: 'Natural', icon: <Sun size={15} aria-hidden="true" /> },
  { value: 'cyber', label: 'Cyber', icon: <Moon size={15} aria-hidden="true" /> },
]

const CONNECTION_TEXT = {
  connecting: 'Connecting',
  live: 'Live',
  reconnecting: 'Reconnecting',
  offline: 'Offline',
} as const

function StatusChip() {
  const connection = useAppStore((s) => s.connection)
  const setAboutOpen = useAppStore((s) => s.setAboutOpen)
  return (
    <button
      type="button"
      className="status-chip"
      onClick={() => setAboutOpen(true)}
      aria-label={`Simulated data, feed ${CONNECTION_TEXT[connection].toLowerCase()}. Learn how the data is generated.`}
    >
      <span className="status-dot" data-state={connection} aria-hidden="true" />
      Simulated data · {CONNECTION_TEXT[connection]}
    </button>
  )
}

export function TopBar() {
  const layer = useAppStore((s) => s.layer)
  const theme = useAppStore((s) => s.theme)
  const panelOpen = useAppStore((s) => s.panelOpen)
  const setLayer = useAppStore((s) => s.setLayer)
  const setTheme = useAppStore((s) => s.setTheme)
  const setPanelOpen = useAppStore((s) => s.setPanelOpen)
  const setAboutOpen = useAppStore((s) => s.setAboutOpen)
  const compact = useIsCompact()
  const [layersOpen, setLayersOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const layersButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!layersOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLayersOpen(false)
        layersButtonRef.current?.focus()
      }
    }
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node
      if (!popoverRef.current?.contains(target) && !layersButtonRef.current?.contains(target)) setLayersOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [layersOpen])

  const togglePanel = () => setPanelOpen(!panelOpen)

  return (
    <>
      <header className="topbar surface">
        <div className="brand">
          <BrandMark />
          <div>
            <h1>PerAI View</h1>
            <p>Where AI assistants are busy right now, simulated</p>
          </div>
        </div>

        {compact ? (
          <div className="topbar-controls">
            <StatusChip />
            <button
              ref={layersButtonRef}
              type="button"
              className="btn icon-btn"
              aria-label="Map layers and style"
              aria-expanded={layersOpen}
              aria-controls="layers-popover"
              onClick={() => setLayersOpen((open) => !open)}
            >
              <Layers size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn icon-btn"
              aria-label="Analytics"
              aria-pressed={panelOpen}
              data-focus-return="analytics"
              onClick={togglePanel}
            >
              <BarChart3 size={20} aria-hidden="true" />
            </button>
            <button type="button" className="btn icon-btn" aria-label="About this project" onClick={() => setAboutOpen(true)}>
              <Info size={20} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="topbar-controls">
            <Segmented label="Map layer" value={layer} options={LAYER_OPTIONS} onChange={setLayer} />
            <Segmented label="Globe style" value={theme} options={THEME_OPTIONS} onChange={setTheme} />
            <span className="divider" aria-hidden="true" />
            <StatusChip />
            <button type="button" className="btn" aria-pressed={panelOpen} data-focus-return="analytics" onClick={togglePanel}>
              <BarChart3 size={16} aria-hidden="true" />
              Analytics
            </button>
            <button type="button" className="btn icon-btn btn-ghost" aria-label="About this project" onClick={() => setAboutOpen(true)}>
              <Info size={18} aria-hidden="true" />
            </button>
          </div>
        )}
      </header>

      {compact && layersOpen && (
        <div id="layers-popover" ref={popoverRef} className="popover surface" role="group" aria-label="Map options">
          <div className="field">
            <span className="control-label">Layer</span>
            <Segmented label="Map layer" value={layer} options={LAYER_OPTIONS} onChange={setLayer} />
          </div>
          <div className="field">
            <span className="control-label">Style</span>
            <Segmented label="Globe style" value={theme} options={THEME_OPTIONS} onChange={setTheme} />
          </div>
        </div>
      )}
    </>
  )
}
