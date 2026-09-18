import { useEffect } from 'react'
import { X } from 'lucide-react'
import { getProgram, type ProgramId } from '@shared/programs'
import { useRealData } from '@/data/realData'
import { useRestoreFocus } from '@/hooks/useRestoreFocus'
import { useAppStore } from '@/store'
import { formatCompact } from '@/utils/format'

function leading(counts: Partial<Record<ProgramId, number>>): string | null {
  const best = (Object.entries(counts) as [ProgramId, number][]).sort((a, b) => b[1] - a[1])[0]
  return best && best[1] > 0 ? (getProgram(best[0])?.vendor ?? best[0]) : null
}

/** Real-data facts about the selected country, one row per source that covers it. */
export function CountryCard() {
  const cc = useAppStore((s) => s.selectedCountry)
  const selectCountry = useAppStore((s) => s.selectCountry)
  const countries = useRealData('countries', Boolean(cc))
  const usage = useRealData('aiUsageByCountry', Boolean(cc))
  const wiki = useRealData('wikipediaInterest', Boolean(cc))
  const sdk = useRealData('sdkDownloadsByCountry', Boolean(cc))
  const devs = useRealData('developerCities', Boolean(cc))
  useRestoreFocus(Boolean(cc), '.globe-controls button')

  useEffect(() => {
    if (!cc) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || useAppStore.getState().aboutOpen) return
      e.preventDefault()
      selectCountry(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [cc, selectCountry])

  if (!cc) return null
  const name = countries.status === 'ready' ? (countries.data.countries.find((c) => c.cc === cc)?.name ?? cc) : cc
  const u = usage.status === 'ready' ? usage.data.countries.find((c) => c.cc === cc) : undefined
  const w = wiki.status === 'ready' ? wiki.data.by_country.find((c) => c.cc === cc) : undefined
  const s = sdk.status === 'ready' && sdk.data.status === 'ok' ? sdk.data.countries.find((c) => c.cc === cc) : undefined
  const d = devs.status === 'ready' ? devs.data.countries.find((c) => c.cc === cc) : undefined
  const loading = [usage, wiki, sdk, devs].some((r) => r.status === 'loading')
  const rows: { label: string; value: string; detail?: string }[] = []
  if (u) {
    rows.push({ label: 'Claude usage index', value: u.usage_per_capita_index === null ? 'n/a' : `${u.usage_per_capita_index.toFixed(2)}×`, detail: u.usage_tier ?? undefined })
    rows.push({ label: 'Share of global Claude usage', value: `${u.usage_pct.toFixed(2)}%` })
  }
  if (w) rows.push({ label: `Wikipedia views, ${wiki.status === 'ready' ? wiki.data.days : 30} days`, value: formatCompact(w.total), detail: `${getProgram(w.leading)?.name} most viewed` })
  if (s) rows.push({ label: `SDK downloads, ${sdk.status === 'ready' ? sdk.data.period_days : 7} days`, value: formatCompact(s.total), detail: `${getProgram(s.leading)?.vendor} leads` })
  if (d) rows.push({ label: 'Developers who forked an AI SDK', value: formatCompact(d.total), detail: leading(d.counts) ? `${leading(d.counts)} SDKs lead` : undefined })

  return (
    <section className="city-card surface" aria-labelledby="country-title" aria-live="polite">
      <header>
        <div>
          <h2 id="country-title">{name}</h2>
          <p>Real data · {cc}</p>
        </div>
        <button type="button" className="btn icon-btn btn-ghost" aria-label="Close country details" onClick={() => selectCountry(null)}>
          <X size={19} aria-hidden="true" />
        </button>
      </header>
      {rows.length > 0 ? (
        <dl className="stat-rows">
          {rows.map((r) => (
            <div key={r.label}>
              <dt>{r.label}</dt>
              <dd>
                <span className="num">{r.value}</span>
                {r.detail && <span className="stat-detail">{r.detail}</span>}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="panel-note">{loading ? 'Loading…' : 'No published data covers this country yet.'}</p>
      )}
      <p className="panel-note">Sources and dates are listed in the analytics panel's Real data tab.</p>
    </section>
  )
}
