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
