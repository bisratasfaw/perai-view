import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { activityTypeLabel, getProgram } from '@shared/programs'
import type { DataSource, RegionalStats } from '@/data/types'
import { useRestoreFocus } from '@/hooks/useRestoreFocus'
import { useAppStore } from '@/store'
import { formatCompact, formatHour } from '@/utils/format'

export function CityCard({ source }: { source: DataSource | null }) {
  const city = useAppStore((s) => s.selectedCity)
  const selectCity = useAppStore((s) => s.selectCity)
  const [stats, setStats] = useState<RegionalStats | null>(null)
  const [failedCity, setFailedCity] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  useRestoreFocus(Boolean(city), '.globe-controls button')

  useEffect(() => {
    if (!city || !source) return
    let cancelled = false
    source
      .getRegional(city)
      .then((result) => {
        if (cancelled) return
        setStats(result)
        setFailedCity(null)
      })
      .catch(() => !cancelled && setFailedCity(city))
    return () => {
      cancelled = true
    }
  }, [city, source, attempt])

  useEffect(() => {
    if (!city) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || useAppStore.getState().aboutOpen) return
      e.preventDefault()
      selectCity(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [city, selectCity])

  if (!city) return null
  const current = stats && stats.region.city === city ? stats : null
  const failed = failedCity === city && !current
  const program = current ? getProgram(current.statistics.leading_program) : undefined
  const intensityPct = current ? Math.round(current.statistics.current_intensity * 100) : 0
  const subtitle = current
    ? `${current.region.country_name} · ≈ ${formatHour(current.statistics.local_hour)} local time`
    : failed
      ? 'Details unavailable'
      : 'Loading…'

  return (
    <section className="city-card surface" aria-labelledby="city-title" aria-live="polite">
      <header>
        <div>
          <h2 id="city-title">{city}</h2>
          <p>{subtitle}</p>
        </div>
        <button type="button" className="btn icon-btn btn-ghost" aria-label="Close city details" onClick={() => selectCity(null)}>
          <X size={19} aria-hidden="true" />
        </button>
      </header>

      {failed && (
        <div role="alert" style={{ display: 'grid', gap: 10 }}>
          <p className="panel-note">Couldn't load this city's details. The API may be busy or offline.</p>
          <button type="button" className="btn" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}

      {current && (
        <>
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-3)' }}>Activity right now</span>
              <span className="num">{intensityPct}%</span>
            </div>
            <div
              className="meter"
              role="meter"
              aria-label="Activity right now"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={intensityPct}
            >
              <div style={{ width: `${Math.max(2, intensityPct)}%` }} />
            </div>
          </div>
          <dl className="stat-rows">
            <div>
              <dt>Leading assistant</dt>
              <dd>
                <span className="swatch" style={{ width: 10, height: 10, background: program?.color }} aria-hidden="true" />
                {program?.name}
              </dd>
            </div>
            <div>
              <dt>Most common use</dt>
              <dd>{activityTypeLabel(current.statistics.top_activity_type)}</dd>
            </div>
            <div>
              <dt>Activities, last 24 h</dt>
              <dd className="num">{formatCompact(current.statistics.activity_24h)}</dd>
            </div>
            <div>
              <dt>People using AI, 24 h</dt>
              <dd className="num">{formatCompact(current.statistics.active_users_24h)}</dd>
            </div>
          </dl>
          <p className="panel-note">Simulated. Activity rises and falls with the city's time of day.</p>
        </>
      )}
    </section>
  )
}
