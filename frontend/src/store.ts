import { create } from 'zustand'
import { findCity } from '@shared/cities'
import type { Activity, ConnectionState, SourceKind } from '@/data/types'
import { isLayerId, type LayerId } from '@/layers'

export type Layer = LayerId
export type GlobeTheme = 'natural' | 'cyber'

const MAX_FEED = 30

interface AppState {
  layer: Layer
  theme: GlobeTheme
  panelOpen: boolean
  aboutOpen: boolean
  legendOpen: boolean
  selectedCity: string | null
  /** ISO 3166-1 alpha-2 of the country selected on a country layer. */
  selectedCountry: string | null
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
  selectCountry: (cc: string | null) => void
  setRotationPaused: (paused: boolean) => void
  setSource: (source: SourceKind) => void
  setConnection: (state: ConnectionState) => void
  pushActivity: (activity: Activity) => void
}

function readInitialUrlState() {
  const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
  const layerParam = params.get('layer')
  const layer: LayerId = isLayerId(layerParam) ? layerParam : 'activity'
  const theme = params.get('theme') === 'cyber' ? 'cyber' : 'natural'
  const city = params.get('city')
  const country = params.get('country')?.toUpperCase() ?? null
  return {
    layer,
    theme,
    city: city && findCity(city) ? findCity(city)!.name : null,
    country: country && /^[A-Z]{2}$/.test(country) ? country : null,
  } as const
}

const initial = readInitialUrlState()

export const useAppStore = create<AppState>((set) => ({
  layer: initial.layer,
  theme: initial.theme,
  panelOpen: false,
  aboutOpen: false,
  legendOpen: false,
  selectedCity: initial.city,
  selectedCountry: initial.city ? null : initial.country,
  rotationPaused: false,
  source: null,
  connection: 'connecting',
  feed: [],

  setLayer: (layer) => set({ layer }),
  setTheme: (theme) => set({ theme }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setAboutOpen: (aboutOpen) => set({ aboutOpen }),
  setLegendOpen: (legendOpen) => set({ legendOpen }),
  selectCity: (selectedCity) => set({ selectedCity, ...(selectedCity ? { selectedCountry: null } : {}) }),
  selectCountry: (selectedCountry) => set({ selectedCountry, ...(selectedCountry ? { selectedCity: null } : {}) }),
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
    apply('country', state.selectedCountry, null)
    const query = params.toString()
    const next = `${location.pathname}${query ? `?${query}` : ''}${location.hash}`
    if (next !== `${location.pathname}${location.search}${location.hash}`) history.replaceState(null, '', next)
  }
  // Normalise the URL straight away so invalid values (e.g. ?layer=nope) don't linger.
  write(useAppStore.getState())
  return useAppStore.subscribe((state, prev) => {
    if (
      state.layer === prev.layer &&
      state.theme === prev.theme &&
      state.selectedCity === prev.selectedCity &&
      state.selectedCountry === prev.selectedCountry
    )
      return
    write(state)
  })
}
