import { useEffect, useState } from 'react'
import { activityTypeLabel } from '@shared/programs'
import { programMapColor } from '@/globe/colors'
import { useAppStore } from '@/store'
import { formatRelative } from '@/utils/format'

const VISIBLE = 4

export function LiveFeed() {
  const feed = useAppStore((s) => s.feed)
  const selectCity = useAppStore((s) => s.selectCity)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(timer)
  }, [])

  if (feed.length === 0) return null

  return (
    <section className="feed surface" aria-labelledby="feed-title">
      <div className="feed-head">
        <h2 id="feed-title" className="control-label">
          Live feed
        </h2>
        <span className="control-label" style={{ textTransform: 'none', letterSpacing: 0 }}>
          simulated events
        </span>
      </div>
      <ol>
        {feed.slice(0, VISIBLE).map((a) => (
          <li key={a.id}>
            <span className="feed-dot" style={{ background: programMapColor(a.program_id) }} aria-hidden="true" />
            <div className="feed-main">
              <strong>{a.program_name}</strong> · {activityTypeLabel(a.activity_type).toLowerCase()}
              <span>
                <button type="button" className="link-btn" style={{ color: 'inherit' }} onClick={() => selectCity(a.city)}>
                  {a.city}
                </button>
                , {a.country_name}
              </span>
            </div>
            <time className="feed-time" dateTime={a.created_at}>
              {formatRelative(a.created_at, now)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  )
}
