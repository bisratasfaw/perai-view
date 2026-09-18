import { useMemo, useState, type PointerEvent } from 'react'
import { formatCompact, formatNumber } from '@/utils/format'

export interface LineSeries {
  key: string
  label: string
  color: string
  values: number[]
}

interface MultiLineChartProps {
  /** ISO dates, one per point, oldest first. */
  dates: string[]
  series: LineSeries[]
  ariaLabel: string
}

const W = 340
const H = 160
const M = { top: 10, right: 8, bottom: 22, left: 42 }

function niceMax(value: number): number {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (step * magnitude >= value) return step * magnitude
  return 10 * magnitude
}

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** Several daily series on one scale, with a hover crosshair listing every series. */
export function MultiLineChart({ dates, series, ariaLabel }: MultiLineChartProps) {
  const [active, setActive] = useState<number | null>(null)
  const n = dates.length

  const geometry = useMemo(() => {
    const max = niceMax(Math.max(...series.flatMap((s) => s.values)) * 1.05)
    const innerW = W - M.left - M.right
    const innerH = H - M.top - M.bottom
    const x = (i: number) => M.left + (i / Math.max(1, n - 1)) * innerW
    const y = (v: number) => M.top + innerH - (v / max) * innerH
    const paths = series.map((s) => s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(''))
    return { max, x, y, paths, innerH, ticks: [0, max / 2, max] }
  }, [series, n])

  if (n < 2 || series.length === 0) return null

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.round(((px - M.left) / (W - M.left - M.right)) * (n - 1))
    setActive(Math.min(n - 1, Math.max(0, i)))
  }

  const labelIdx = [0, Math.floor((n - 1) / 2), n - 1]

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} onPointerMove={onMove} onPointerLeave={() => setActive(null)}>
        {geometry.ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={M.left} x2={W - M.right} y1={geometry.y(t)} y2={geometry.y(t)} />
            <text className="axis-label" x={M.left - 6} y={geometry.y(t) + 4} textAnchor="end">
              {formatCompact(t)}
            </text>
          </g>
        ))}
        {series.map((s, i) => (
          <path key={s.key} d={geometry.paths[i]} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {labelIdx.map((i, k) => (
          <text key={i} className="axis-label" x={geometry.x(i)} y={H - 4} textAnchor={k === 0 ? 'start' : k === 2 ? 'end' : 'middle'}>
            {shortDate(dates[i])}
          </text>
        ))}
        {active !== null && (
          <g>
            <line x1={geometry.x(active)} x2={geometry.x(active)} y1={M.top} y2={M.top + geometry.innerH} stroke="rgba(232,238,245,0.35)" strokeWidth="1" />
            {series.map((s) => (
              <circle key={s.key} cx={geometry.x(active)} cy={geometry.y(s.values[active])} r="3.5" fill={s.color} stroke="#0a111b" strokeWidth="1.5" />
            ))}
          </g>
        )}
      </svg>
      {active !== null && (
        <div
          className="chart-tooltip"
          style={{ left: `${(geometry.x(active) / W) * 100}%`, transform: `translateX(${active > n / 2 ? 'calc(-100% - 10px)' : '10px'})` }}
        >
          <strong>{shortDate(dates[active])}</strong>
          {series.map((s) => (
            <div key={s.key} className="chart-tooltip-row">
              <span className="swatch" style={{ width: 8, height: 8, background: s.color }} aria-hidden="true" />
              {s.label} <span className="num">{formatNumber(s.values[active])}</span>
            </div>
          ))}
        </div>
      )}
      <ul className="chart-legend" aria-label="Series">
        {series.map((s) => (
          <li key={s.key}>
            <span className="swatch" style={{ width: 9, height: 9, background: s.color }} aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ul>
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dates.map((d, i) => (
            <tr key={d}>
              <td>{d}</td>
              {series.map((s) => (
                <td key={s.key}>{formatNumber(s.values[i])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
