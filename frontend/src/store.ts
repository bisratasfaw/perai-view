import { create } from 'zustand'
import { findCity } from '@shared/cities'
import type { Activity, ConnectionState, SourceKind } from '@/data/types'

export type Layer = 'activity' | 'heat'
export type GlobeTheme = 'natural' | 'cyber'

const MAX_FEED = 30

interface AppState {
  layer: Layer
  theme: GlobeTheme
  panelOpen: boolean
  aboutOpen: boolean
  legendOpen: boolean
  selectedCity: string | null
  /** User-controlled pause of the globe's auto-rotation. */
  rotationPaused: boolean
  source: SourceKind | null
  connection: ConnectionState
  feed: Activity[]

  setLayer: (layer: Layer) => void
  setTheme: (theme: GlobeTheme) => void
  setPanelOpen: (open: boolean) => void
  setAboutOpen: (open: boolean) => void
  setLegendOpen: (open: boolean) => void
  selectCity: (city: string | null) => void
  setRotationPaused: (paused: boolean) => void
  setSource: (source: SourceKind) => void
  setConnection: (state: ConnectionState) => void
  pushActivity: (activity: Activity) => void
}

function readInitialUrlState() {
  const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
  const layer = params.get('layer') === 'heat' ? 'heat' : 'activity'
  const theme = params.get('theme') === 'cyber' ? 'cyber' : 'natural'
  const city = params.get('city')
  return { layer, theme, city: city && findCity(city) ? findCity(city)!.name : null } as const
}

const initial = readInitialUrlState()

export const useAppStore = create<AppState>((set) => ({
  layer: initial.layer,
  theme: initial.theme,
  panelOpen: false,
  aboutOpen: false,
  legendOpen: false,
  selectedCity: initial.city,
  rotationPaused: false,
  source: null,
  connection: 'connecting',
  feed: [],

  setLayer: (layer) => set({ layer }),
  setTheme: (theme) => set({ theme }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setAboutOpen: (aboutOpen) => set({ aboutOpen }),
  setLegendOpen: (legendOpen) => set({ legendOpen }),
  selectCity: (selectedCity) => set({ selectedCity }),
  setRotationPaused: (rotationPaused) => set({ rotationPaused }),
  setSource: (source) => set({ source }),
  setConnection: (connection) => set({ connection }),
  pushActivity: (activity) =>
    set((state) => (state.feed.some((a) => a.id === activity.id) ? state : { feed: [activity, ...state.feed].slice(0, MAX_FEED) })),
}))

/** Keeps layer, theme and selected city in the URL so views can be shared. */
export function syncUrlWithStore(): () => void {
  const write = (state: AppState) => {
    const params = new URLSearchParams(location.search)
    const apply = (key: string, value: string | null, fallback: string | null) => {
      if (value && value !== fallback) params.set(key, value)
      else params.delete(key)
    }
    apply('layer', state.layer, 'activity')
    apply('theme', state.theme, 'natural')
    apply('city', state.selectedCity, null)
    const query = params.toString()
    const next = `${location.pathname}${query ? `?${query}` : ''}${location.hash}`
    if (next !== `${location.pathname}${location.search}${location.hash}`) history.replaceState(null, '', next)
  }
  // Normalise the URL straight away so invalid values (e.g. ?layer=nope) don't linger.
  write(useAppStore.getState())
  return useAppStore.subscribe((state, prev) => {
    if (state.layer === prev.layer && state.theme === prev.theme && state.selectedCity === prev.selectedCity) return
    write(state)
  })
}
