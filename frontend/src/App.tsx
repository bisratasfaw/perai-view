import { useEffect, useState } from 'react'
import { AboutDialog } from '@/components/AboutDialog'
import { AnalyticsPanel } from '@/components/AnalyticsPanel'
import { CityCard } from '@/components/CityCard'
import { GlobeControls } from '@/components/GlobeControls'
import { Legend } from '@/components/Legend'
import { LiveFeed } from '@/components/LiveFeed'
import { TopBar } from '@/components/TopBar'
import { resolveDataSource } from '@/data/source'
import type { DataSource } from '@/data/types'
import { GlobeViewer } from '@/globe/GlobeViewer'
import { syncUrlWithStore, useAppStore } from '@/store'

export default function App() {
  const [source, setSource] = useState<DataSource | null>(null)
  const [globeKey, setGlobeKey] = useState(0)
  const panelOpen = useAppStore((s) => s.panelOpen)
  const selectedCity = useAppStore((s) => s.selectedCity)

  useEffect(() => syncUrlWithStore(), [])

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let cancelled = false
    void resolveDataSource().then((resolved) => {
      if (cancelled) return
      const store = useAppStore.getState()
      store.setSource(resolved.kind)
      setSource(resolved)
      unsubscribe = resolved.subscribe({
        onActivity: (activity) => useAppStore.getState().pushActivity(activity),
        onState: (state) => useAppStore.getState().setConnection(state),
      })
    })
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  const className = ['app', panelOpen && 'panel-open', selectedCity && 'city-open'].filter(Boolean).join(' ')

  return (
    <div className={className}>
      <TopBar />
      <main style={{ display: 'contents' }}>
        <GlobeViewer key={globeKey} source={source} onRestart={() => setGlobeKey((k) => k + 1)} />
        <GlobeControls />
        <LiveFeed />
        <Legend />
        <CityCard source={source} />
        {panelOpen && <AnalyticsPanel source={source} />}
      </main>
      <AboutDialog source={source} />
    </div>
  )
}
