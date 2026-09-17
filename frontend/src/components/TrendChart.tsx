import { useId, useMemo, useState, type PointerEvent } from 'react'
import type { TrendPoint } from '@/data/types'
import { formatClock, formatCompact, formatNumber } from '@/utils/format'

const W = 340
const H = 150
const M = { top: 10, right: 8, bottom: 22, left: 40 }

function niceMax(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value))
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (step * magnitude >= value) return step * magnitude
  }
  return 10 * magnitude
}

/** Hourly activity: area + line, recessive grid, hover crosshair with tooltip. */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  const gradientId = useId()
  const [active, setActive] = useState<number | null>(null)

  const geometry = useMemo(() => {
    const max = niceMax(Math.max(...data.map((d) => d.activity_count)) * 1.05)
    const innerW = W - M.left - M.right
    const innerH = H - M.top - M.bottom
    const x = (i: number) => M.left + (i / Math.max(1, data.length - 1)) * innerW
    const y = (v: number) => M.top + innerH - (v / max) * innerH
    const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.activity_count).toFixed(1)}`).join('')
    const area = `${line}L${x(data.length - 1).toFixed(1)},${M.top + innerH}L${M.left},${M.top + innerH}Z`
    const ticks = [0, max / 2, max]
    return { max, x, y, line, area, ticks, innerH }
  }, [data])

  if (data.length < 2) return null

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.round(((px - M.left) / (W - M.left - M.right)) * (data.length - 1))
    setActive(Math.min(data.length - 1, Math.max(0, i)))
  }

  const labelIdx = [0, Math.floor((data.length - 1) / 2), data.length - 1]
  const activePoint = active === null ? null : data[active]

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Activity per hour over the last ${data.length} hours, from ${formatCompact(data[0].activity_count)} to ${formatCompact(data[data.length - 1].activity_count)}.`}
        onPointerMove={onMove}
        onPointerLeave={() => setActive(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5cc8ff" stopOpacity="0.32" />
            <stop offset="1" stopColor="#5cc8ff" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {geometry.ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={M.left} x2={W - M.right} y1={geometry.y(t)} y2={geometry.y(t)} />
            <text className="axis-label" x={M.left - 6} y={geometry.y(t) + 4} textAnchor="end">
              {formatCompact(t)}
            </text>
          </g>
        ))}
        <path d={geometry.area} fill={`url(#${gradientId})`} />
        <path d={geometry.line} fill="none" stroke="#5cc8ff" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle
          cx={geometry.x(data.length - 1)}
          cy={geometry.y(data[data.length - 1].activity_count)}
          r="4"
          fill="#5cc8ff"
          stroke="#0a111b"
          strokeWidth="2"
        />
        {labelIdx.map((i, n) => (
          <text
            key={i}
            className="axis-label"
            x={geometry.x(i)}
            y={H - 4}
            textAnchor={n === 0 ? 'start' : n === 2 ? 'end' : 'middle'}
          >
            {formatClock(data[i].timestamp)}
          </text>
        ))}
        {activePoint && active !== null && (
          <g>
            <line
              x1={geometry.x(active)}
              x2={geometry.x(active)}
              y1={M.top}
              y2={M.top + geometry.innerH}
              stroke="rgba(232,238,245,0.35)"
              strokeWidth="1"
            />
            <circle cx={geometry.x(active)} cy={geometry.y(activePoint.activity_count)} r="4.5" fill="#9adfff" stroke="#0a111b" strokeWidth="2" />
          </g>
        )}
      </svg>
      {activePoint && active !== null && (
        <div
          className="chart-tooltip"
          style={{
            left: `${(geometry.x(active) / W) * 100}%`,
            transform: `translateX(${active > data.length / 2 ? 'calc(-100% - 10px)' : '10px'})`,
          }}
        >
          <strong className="num">{formatNumber(activePoint.activity_count)}</strong>
          {formatClock(activePoint.timestamp)} hour
        </div>
      )}
      <table className="sr-only">
        <caption>Activity per hour</caption>
        <thead>
          <tr>
            <th scope="col">Hour starting</th>
            <th scope="col">Activities</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.timestamp}>
              <td>{formatClock(d.timestamp)}</td>
              <td>{formatNumber(d.activity_count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
