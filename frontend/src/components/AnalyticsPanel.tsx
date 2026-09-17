import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { getProgram } from '@shared/programs'
import type { DataSource, GlobalStats, TrendPoint } from '@/data/types'
import { useIsCompact } from '@/hooks/useMediaQuery'
import { useRestoreFocus } from '@/hooks/useRestoreFocus'
import { useAppStore } from '@/store'
import { formatCompact, formatNumber, formatPercent } from '@/utils/format'
import { TrendChart } from './TrendChart'

const REFRESH_MS = 60_000

export function AnalyticsPanel({ source }: { source: DataSource | null }) {
  const setPanelOpen = useAppStore((s) => s.setPanelOpen)
  const setAboutOpen = useAppStore((s) => s.setAboutOpen)
  const selectCity = useAppStore((s) => s.selectCity)
  const [stats, setStats] = useState<GlobalStats | null>(null)
  const [trends, setTrends] = useState<TrendPoint[]>([])
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const compact = useIsCompact()
  // Declared before the focus-on-open effect so it records the toggle button, not the close button.
  useRestoreFocus(true, '[data-focus-return="analytics"]')
  const closeRef = useRef<HTMLButtonElement>(null)

  const load = useCallback(async () => {
    if (!source) return
    setLoading(true)
    try {
      const [s, t] = await Promise.all([source.getGlobalStats(), source.getTrends(24)])
      setStats(s)
      setTrends(t)
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [source])

  useEffect(() => {
    // Initial fetch and a gentle refresh; data changes slowly.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    const timer = setInterval(load, REFRESH_MS)
    return () => clearInterval(timer)
  }, [load])

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      // Escape closes the topmost layer only: an open city card or dialog goes first.
      const { selectedCity, aboutOpen } = useAppStore.getState()
      if (e.key === 'Escape' && !selectedCity && !aboutOpen && !e.defaultPrevented) setPanelOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [setPanelOpen])

  const updated = stats ? new Date(stats.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null
  const maxType = stats ? Math.max(...stats.activity_by_type.map((t) => t.count)) : 1

  return (
    <aside className="panel surface" aria-labelledby="panel-title">
      <div className="panel-head">
        <div>
          <h2 id="panel-title">Analytics</h2>
          <p>Last 24 hours · simulated{updated ? ` · updated ${updated}` : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn icon-btn btn-ghost" aria-label="Refresh analytics" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={17} aria-hidden="true" />
          </button>
          <button ref={closeRef} type="button" className="btn icon-btn btn-ghost" aria-label="Close analytics" onClick={() => setPanelOpen(false)}>
            <X size={19} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="panel-body">
        {error && !stats && (
          <div className="panel-state" role="alert">
            <p>Couldn't load analytics. The API may be offline.</p>
            <button type="button" className="btn" style={{ marginTop: 12 }} onClick={() => void load()}>
              Try again
            </button>
          </div>
        )}
        {!stats && !error && (
          <p className="panel-state" role="status">
            Loading analytics…
          </p>
        )}

        {stats && (
          <>
            <section className="panel-section" aria-label="Totals">
              <div className="tiles">
                <div className="tile">
                  <div className="tile-value num">{formatCompact(stats.total_activities_24h)}</div>
                  <div className="tile-label">AI activities</div>
                </div>
                <div className="tile">
                  <div className="tile-value num">{formatCompact(stats.active_users_24h)}</div>
                  <div className="tile-label">People using AI</div>
                </div>
                <div className="tile">
                  <div className="tile-value num">{stats.active_countries}</div>
                  <div className="tile-label">Countries</div>
                </div>
                <div className="tile">
                  <div className="tile-value num">{stats.active_cities}</div>
                  <div className="tile-label">Cities</div>
                </div>
              </div>
            </section>

            {trends.length > 1 && (
              <section className="panel-section" aria-labelledby="trend-title">
                <h3 id="trend-title">Activity per hour</h3>
                <TrendChart data={trends} />
              </section>
            )}

            <section className="panel-section" aria-labelledby="assistants-title">
              <h3 id="assistants-title">Assistants by share</h3>
              <ul className="bar-list">
                {stats.top_programs.map((p) => (
                  <li key={p.program_id} className="bar-row">
                    <div className="bar-meta">
                      <span className="swatch" style={{ width: 10, height: 10, background: getProgram(p.program_id)?.color }} aria-hidden="true" />
                      <span className="name">{p.program_name}</span>
                      <span className="value num">
                        {formatPercent(p.percentage)} · {formatCompact(p.activity_count)}
                      </span>
                    </div>
                    <div className="bar-track" aria-hidden="true">
                      <div className="bar-fill" style={{ width: `${p.percentage}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel-section" aria-labelledby="cities-title">
              <h3 id="cities-title">Busiest cities</h3>
              <ol className="rank-list">
                {stats.top_regions.map((r, i) => (
                  <li key={r.city}>
                    <button
                      type="button"
                      onClick={() => {
                        selectCity(r.city)
                        // On phones the sheet would cover the city card and the camera flight.
                        if (compact) setPanelOpen(false)
                      }}
                      aria-label={`${r.city}, ${r.country_name}: ${formatNumber(r.activity_count)} activities. Show on globe.`}>
                      <span className="rank num">{i + 1}</span>
                      <span className="rank-city">
                        {r.city} <span>{r.country_name}</span>
                      </span>
                      <span className="rank-value num">{formatCompact(r.activity_count)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>

            <section className="panel-section" aria-labelledby="types-title">
              <h3 id="types-title">What people use AI for</h3>
              <ul className="bar-list">
                {stats.activity_by_type.map((t) => (
                  <li key={t.type} className="bar-row">
                    <div className="bar-meta">
                      <span className="name">{t.label}</span>
                      <span className="value num">{formatCompact(t.count)}</span>
                    </div>
                    <div className="bar-track" aria-hidden="true">
                      <div className="bar-fill" style={{ width: `${(t.count / maxType) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <p className="panel-note">
              Every number here comes from a deterministic simulation, not real usage data.{' '}
              <button type="button" className="link-btn" onClick={() => setAboutOpen(true)}>
                How it works
              </button>
            </p>
          </>
        )}
      </div>
    </aside>
  )
}
