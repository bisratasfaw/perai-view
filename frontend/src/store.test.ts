// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createRng, generateActivity } from '@shared/simulation'
import { syncUrlWithStore, useAppStore } from './store'

const initial = useAppStore.getState()

beforeEach(() => {
  useAppStore.setState(initial, true)
  history.replaceState(null, '', '/')
})

describe('app store', () => {
  it('keeps the newest 30 unique events', () => {
    const rng = createRng(11)
    const events = Array.from({ length: 40 }, (_, i) => generateActivity(rng, 1_800_000_000_000 + i))
    for (const e of events) useAppStore.getState().pushActivity(e)
    useAppStore.getState().pushActivity(events[39])

    const feed = useAppStore.getState().feed
    expect(feed).toHaveLength(30)
    expect(feed[0].id).toBe(events[39].id)
    expect(new Set(feed.map((a) => a.id)).size).toBe(30)
  })

  it('mirrors layer, theme and city into the URL for sharing', () => {
    const stop = syncUrlWithStore()
    const { setLayer, setTheme, selectCity } = useAppStore.getState()

    setLayer('heat')
    setTheme('cyber')
    selectCity('Tokyo')
    expect(location.search).toBe('?layer=heat&theme=cyber&city=Tokyo')

    setLayer('activity')
    setTheme('natural')
    selectCity(null)
    expect(location.search).toBe('')
    stop()
  })

  it('drops invalid URL values when syncing starts', () => {
    history.replaceState(null, '', '/?layer=nope&theme=cyber&debug')
    useAppStore.setState({ theme: 'cyber' })
    const stop = syncUrlWithStore()
    expect(location.search).toBe('?theme=cyber&debug=')
    stop()
  })
})

describe('real layers and countries in the URL', () => {
  it('accepts a real layer id and a country code from the URL', () => {
    history.replaceState(null, '', '/?layer=usage-index&country=de')
    // The store reads the URL once at module load, so exercise the sync writer instead.
    const stop = syncUrlWithStore()
    useAppStore.getState().setLayer('wiki-interest')
    useAppStore.getState().selectCountry('DE')
    expect(location.search).toBe('?layer=wiki-interest&country=DE')
    stop()
  })

  it('selecting a country clears the city and vice versa', () => {
    useAppStore.getState().selectCity('Tokyo')
    useAppStore.getState().selectCountry('JP')
    expect(useAppStore.getState().selectedCity).toBeNull()
    expect(useAppStore.getState().selectedCountry).toBe('JP')
    useAppStore.getState().selectCity('Berlin')
    expect(useAppStore.getState().selectedCountry).toBeNull()
  })
})
