import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, Layers } from 'lucide-react'
import { LAYERS, getLayer, type LayerId } from '@/layers'
import { useAppStore } from '@/store'
import { useRealData } from '@/data/realData'

interface LayerMenuProps {
  /** Render as an always-open list (inside the compact popover) instead of a dropdown. */
  inline?: boolean
}

/** Picks the map layer. Simulated layers first, then real-data layers with their source status. */
export function LayerMenu({ inline = false }: LayerMenuProps) {
  const layer = useAppStore((s) => s.layer)
  const setLayer = useAppStore((s) => s.setLayer)
  const manifest = useRealData('manifest')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  const availability = (id: LayerId): { disabled: boolean; hint: string | null } => {
    const def = getLayer(id)!
    if (def.kind === 'simulated') return { disabled: false, hint: null }
    if (manifest.status === 'loading') return { disabled: false, hint: null }
    if (manifest.status === 'error') return { disabled: true, hint: 'snapshots unavailable' }
    const source = def.source ? manifest.data.sources[def.source] : undefined
    if (!source) return { disabled: true, hint: 'no snapshot yet' }
    if (source.status === 'not_configured') return { disabled: true, hint: 'not configured' }
    if (source.status === 'failed' && !source.fetched_at) return { disabled: true, hint: 'unavailable' }
    if (source.status === 'stale') return { disabled: false, hint: `stale · ${source.as_of ?? ''}`.trim() }
    return { disabled: false, hint: source.as_of }
  }

  const choose = (id: LayerId) => {
    setLayer(id)
    if (!inline) {
      setOpen(false)
      buttonRef.current?.focus()
    }
  }

  const list = (
    <ul id={listId} className="layer-list" role="listbox" aria-label="Map layer">
      {(['simulated', 'real'] as const).map((kind) => (
        <li key={kind} className="layer-group" role="presentation">
          <span className="control-label">{kind === 'simulated' ? 'Simulation' : 'Real data'}</span>
          <ul role="presentation">
            {LAYERS.filter((l) => l.kind === kind).map((l) => {
              const { disabled, hint } = availability(l.id)
              const selected = l.id === layer
              return (
                <li key={l.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    aria-disabled={disabled || undefined}
                    className="layer-option"
                    onClick={() => !disabled && choose(l.id)}
                    title={l.description}
                  >
                    <span className="layer-check" aria-hidden="true">{selected && <Check size={15} />}</span>
                    <span className="layer-text">
                      <span>{l.label}</span>
                      {hint && <small>{hint}</small>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </li>
      ))}
    </ul>
  )

  if (inline) return list

  const current = getLayer(layer)!
  return (
    <div ref={rootRef} className="layer-menu">
      <button
        ref={buttonRef}
        type="button"
        className="btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
      >
        <Layers size={16} aria-hidden="true" />
        <span className="control-label" style={{ letterSpacing: 0, textTransform: 'none', fontSize: 12 }}>Layer</span>
        {current.short}
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && <div className="layer-popover surface">{list}</div>}
    </div>
  )
}
