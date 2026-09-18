import { ExternalLink } from 'lucide-react'
import { MAP_COLORS, getProgram, type ProgramId } from '@shared/programs'
import type { ActivityTypeSeries, SourceInfo } from '@shared/realData'
import { useRealData } from '@/data/realData'
import { useAppStore } from '@/store'
import { formatCompact, formatPercent } from '@/utils/format'
import { MultiLineChart, type LineSeries } from './MultiLineChart'

function SourceLine({ source, fallback }: { source: SourceInfo | undefined; fallback: string }) {
  if (!source) return <p className="panel-source">{fallback}</p>
  return (
    <p className="panel-source">
      <a href={source.url} target="_blank" rel="noreferrer">
        {source.title}
        <ExternalLink size={11} aria-hidden="true" />
      </a>
      {source.as_of ? ` · ${source.as_of}` : ''} · {source.license}
    </p>
  )
}

const MAX_CATEGORY_BARS = 10

/** Top categories as bars; anything beyond the first ten is summed into one "other" row. */
function visibleCategories(series: ActivityTypeSeries): ActivityTypeSeries['categories'] {
  const sorted = [...series.categories].sort((a, b) => b.share - a.share)
  if (sorted.length <= MAX_CATEGORY_BARS) return sorted
  const head = sorted.slice(0, MAX_CATEGORY_BARS - 1)
  const tail = sorted.slice(MAX_CATEGORY_BARS - 1)
  return [...head, { label: `Other (${tail.length} smaller categories)`, share: tail.reduce((s, c) => s + c.share, 0), note: tail.map((c) => c.label).join(', ') }]
}

function CategoryBars({ series }: { series: ActivityTypeSeries }) {
  const categories = visibleCategories(series)
  const max = Math.max(...categories.map((c) => c.share))
  const previous = new Map(series.previous?.categories.map((c) => [c.label, c.share]) ?? [])
  return (
    <ul className="bar-list">
      {categories.map((c) => {
        const prev = previous.get(c.label)
        const delta = prev === undefined ? null : Math.round((c.share - prev) * 1000) / 10
        return (
          <li key={c.label} className="bar-row">
            <div className="bar-meta">
              <span className="name" title={c.note}>
                {c.label}
              </span>
              <span className="value num">
                {formatPercent(c.share * 100)}
                {delta !== null && delta !== 0 && (
                  <span className={delta > 0 ? 'delta-up' : 'delta-down'} title={`${series.previous?.as_of}: ${formatPercent(prev! * 100)}`}>
                    {' '}
                    {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}
                  </span>
                )}
              </span>
            </div>
            <div className="bar-track" aria-hidden="true">
              <div className="bar-fill" style={{ width: `${(c.share / max) * 100}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function Unavailable({ what, error }: { what: string; error?: string | null }) {
  return (
    <p className="panel-note">
      {what} isn't available in this build{error ? `: ${error}` : '.'}
    </p>
  )
}

/** The analytics panel's "Real data" tab: every snapshot with its provenance. */
export function RealDataPanel() {
  const manifest = useRealData('manifest')
  const activity = useRealData('activityTypes')
  const wiki = useRealData('wikipediaInterest')
  const usage = useRealData('aiUsageByCountry')
  const devs = useRealData('developerCities')
  const sdk = useRealData('sdkDownloadsByCountry')
  const selectCountry = useAppStore((s) => s.selectCountry)
  const selectCity = useAppStore((s) => s.selectCity)
  const setLayer = useAppStore((s) => s.setLayer)
  const sources = manifest.status === 'ready' ? manifest.data.sources : undefined

  if (manifest.status === 'error') {
    return (
      <div className="panel-state" role="alert">
        <p>The real-data snapshots couldn't be loaded.</p>
        <p className="panel-note">{manifest.error}</p>
      </div>
    )
  }

  const wikiSeries: LineSeries[] =
    wiki.status === 'ready'
      ? (['chatgpt', 'gemini', 'claude'] as const)
          .filter((id) => wiki.data.daily.some((d) => (d.views[id] ?? 0) > 0))
          .map((id) => ({
            key: id,
            label: getProgram(id)?.name ?? id,
            color: getProgram(id)?.color ?? MAP_COLORS.other,
            values: wiki.data.daily.map((d) => d.views[id] ?? 0),
          }))
      : []

  const flyToCountry = (cc: string, layer: 'usage-index' | 'wiki-interest' | 'sdk-downloads') => {
    setLayer(layer)
    selectCountry(cc)
  }

  return (
    <>
      <p className="panel-note">
        Published, free datasets, refreshed nightly by a GitHub Action. Each block names its source and date. None of it is
        per-person tracking.
      </p>

      <section className="panel-section" aria-labelledby="real-types-title">
        <h3 id="real-types-title">What people use AI for</h3>
        {activity.status === 'ready' ? (
          activity.data.series.map((series) => (
            <div key={`${series.source}-${series.subject}`} className="panel-subsection">
              <h4>{series.title}</h4>
              <p className="panel-note">
                {series.subject} · {series.as_of}
                {series.previous ? ` · change since ${series.previous.as_of}` : ''}
              </p>
              <CategoryBars series={series} />
              <SourceLine source={sources?.[series.source]} fallback={series.method} />
            </div>
          ))
        ) : (
          <Unavailable what="Usage by category" error={activity.status === 'error' ? activity.error : null} />
        )}
      </section>

      <section className="panel-section" aria-labelledby="real-wiki-title">
        <h3 id="real-wiki-title">Wikipedia interest, last {wiki.status === 'ready' ? wiki.data.days : 30} days</h3>
        {wiki.status === 'ready' ? (
          <>
            <MultiLineChart
              dates={wiki.data.daily.map((d) => d.date)}
              series={wikiSeries}
              ariaLabel={`Daily Wikipedia article views per assistant over the last ${wiki.data.days} days, summed across language editions`}
            />
            {wiki.data.by_country.length > 0 && (
              <>
                <h4>Most views by country</h4>
                <ol className="rank-list">
                  {[...wiki.data.by_country]
                    .sort((a, b) => b.total - a.total)
                    .slice(0, 8)
                    .map((c, i) => (
                      <li key={c.cc}>
                        <button type="button" onClick={() => flyToCountry(c.cc, 'wiki-interest')} aria-label={`${c.name}: ${formatCompact(c.total)} views, ${getProgram(c.leading)?.name} leads. Show on globe.`}>
                          <span className="rank num">{i + 1}</span>
                          <span className="rank-city">
                            {c.name} <span>{getProgram(c.leading)?.name} leads</span>
                          </span>
                          <span className="rank-value num">{formatCompact(c.total)}</span>
                        </button>
                      </li>
                    ))}
                </ol>
                <p className="panel-note">{wiki.data.by_country_note}</p>
              </>
            )}
            <SourceLine source={sources?.wikipedia_pageviews} fallback="Wikimedia pageviews API" />
          </>
        ) : (
          <Unavailable what="Wikipedia interest" error={wiki.status === 'error' ? wiki.error : null} />
        )}
      </section>

      <section className="panel-section" aria-labelledby="real-usage-title">
        <h3 id="real-usage-title">Claude usage by country</h3>
        {usage.status === 'ready' ? (
          <>
            <p className="panel-note">
              {usage.data.product} · {usage.data.as_of}. The usage index is a country's share of usage divided by its share of the
              world's working-age population; 1.0 means proportional.
            </p>
            <ol className="rank-list">
              {[...usage.data.countries]
                .filter((c) => c.usage_per_capita_index !== null)
                .sort((a, b) => b.usage_per_capita_index! - a.usage_per_capita_index!)
                .slice(0, 8)
                .map((c, i) => (
                  <li key={c.cc}>
                    <button type="button" onClick={() => flyToCountry(c.cc, 'usage-index')} aria-label={`${c.name}: usage index ${c.usage_per_capita_index!.toFixed(2)}, ${c.usage_pct.toFixed(1)} percent of global usage. Show on globe.`}>
                      <span className="rank num">{i + 1}</span>
                      <span className="rank-city">
                        {c.name} <span>{c.usage_pct.toFixed(1)}% of usage</span>
                      </span>
                      <span className="rank-value num">{c.usage_per_capita_index!.toFixed(2)}×</span>
                    </button>
                  </li>
                ))}
            </ol>
            <SourceLine source={sources?.anthropic_economic_index} fallback="Anthropic Economic Index" />
          </>
        ) : (
          <Unavailable what="Country usage" error={usage.status === 'error' ? usage.error : null} />
        )}
      </section>

      <section className="panel-section" aria-labelledby="real-devs-title">
        <h3 id="real-devs-title">Developers by city</h3>
        {devs.status === 'ready' ? (
          <>
            <p className="panel-note">
              GitHub users who forked an official AI SDK repository, by self-reported location ({devs.data.geocoding.matched_city_pct.toFixed(0)}% of
              locations matched a city).
            </p>
            <ol className="rank-list">
              {[...devs.data.cities]
                .sort((a, b) => b.total - a.total)
                .slice(0, 8)
                .map((c, i) => {
                  const leader = (Object.entries(c.counts) as [ProgramId, number][]).sort((a, b) => b[1] - a[1])[0]?.[0]
                  return (
                    <li key={`${c.name}-${c.cc}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setLayer('dev-cities')
                          selectCity(c.name)
                        }}
                        aria-label={`${c.name}: ${c.total} developers. Show on globe.`}
                      >
                        <span className="rank num">{i + 1}</span>
                        <span className="rank-city">
                          {c.name} <span>{leader ? `${getProgram(leader)?.vendor} SDKs lead` : ''}</span>
                        </span>
                        <span className="rank-value num">{formatCompact(c.total)}</span>
                      </button>
                    </li>
                  )
                })}
            </ol>
            <SourceLine source={sources?.github_forks} fallback="GitHub GraphQL API" />
          </>
        ) : (
          <Unavailable what="Developer cities" error={devs.status === 'error' ? devs.error : null} />
        )}
      </section>

      <section className="panel-section" aria-labelledby="real-sdk-title">
        <h3 id="real-sdk-title">SDK downloads by country</h3>
        {sdk.status === 'ready' && (sdk.data.status === 'ok' || sdk.data.status === 'stale') ? (
          <>
            <ol className="rank-list">
              {[...sdk.data.countries]
                .sort((a, b) => b.total - a.total)
                .slice(0, 8)
                .map((c, i) => (
                  <li key={c.cc}>
                    <button type="button" onClick={() => flyToCountry(c.cc, 'sdk-downloads')} aria-label={`${c.name}: ${formatCompact(c.total)} downloads. Show on globe.`}>
                      <span className="rank num">{i + 1}</span>
                      <span className="rank-city">
                        {c.name} <span>{getProgram(c.leading)?.vendor} leads</span>
                      </span>
                      <span className="rank-value num">{formatCompact(c.total)}</span>
                    </button>
                  </li>
                ))}
            </ol>
            <SourceLine source={sources?.pypi_downloads} fallback="PyPI download statistics (BigQuery)" />
          </>
        ) : (
          <p className="panel-note">
            {sdk.status === 'ready' ? sdk.data.note : 'PyPI downloads are not available in this build.'}
          </p>
        )}
      </section>
    </>
  )
}
