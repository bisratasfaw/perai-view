import { API_URL, wsUrl } from '@/config'
import type { Activity, ClassificationResult, DataSource, GlobalStats, RegionalStats, TrendPoint } from './types'

const REQUEST_TIMEOUT_MS = 8000

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`GET ${path} failed with ${res.status}`)
  return (await res.json()) as T
}

/** True when the backend answers its health check in time. */
export async function isApiAvailable(timeoutMs = 1500): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) return false
    const body = (await res.json()) as { status?: string }
    return body.status === 'ok'
  } catch {
    return false
  }
}

interface HeatmapResponse {
  features: { properties: { city: string; intensity: number } }[]
}

export function createApiSource(): DataSource {
  return {
    kind: 'api',
    getGlobalStats: () => getJson<GlobalStats>('/analytics/global'),
    getTrends: async (hours) => (await getJson<{ data: TrendPoint[] }>(`/analytics/trends?hours=${hours}`)).data,
    getRegional: async (city) => {
      const res = await fetch(`${API_URL}/analytics/regional?city=${encodeURIComponent(city)}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      // Unknown city → null; anything else (rate limit, outage) is an error the UI can retry.
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`City details failed with ${res.status}`)
      return (await res.json()) as RegionalStats
    },
    getCityIntensities: async () =>
      (await getJson<HeatmapResponse>('/analytics/heatmap')).features.map((f) => ({
        city: f.properties.city,
        intensity: f.properties.intensity,
      })),
    classify: async (text) => {
      const res = await fetch(`${API_URL}/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!res.ok) throw new Error(res.status === 429 ? 'Too many requests. Try again in a minute.' : `Classification failed (${res.status}).`)
      return (await res.json()) as ClassificationResult
    },

    subscribe({ onActivity, onState }) {
      let socket: WebSocket | null = null
      let retryTimer: ReturnType<typeof setTimeout> | undefined
      let attempt = 0
      let closed = false

      const connect = () => {
        if (closed) return
        // Only announce the first attempt; retries keep the current state so the chip doesn't flicker.
        if (attempt === 0) onState('connecting')
        socket = new WebSocket(wsUrl())

        socket.onopen = () => {
          attempt = 0
          onState('live')
        }
        socket.onmessage = (event) => {
          try {
            const msg = JSON.parse(String(event.data)) as { type?: string; data?: Activity }
            if (msg.type === 'activity' && msg.data) onActivity(msg.data)
          } catch {
            // Ignore frames that aren't JSON.
          }
        }
        socket.onclose = () => {
          socket = null
          if (closed) return
          attempt += 1
          onState(attempt > 5 ? 'offline' : 'reconnecting')
          // Exponential backoff with jitter so many tabs don't reconnect in lockstep.
          const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)) * (0.75 + Math.random() * 0.5)
          retryTimer = setTimeout(connect, delay)
        }
        socket.onerror = () => socket?.close()
      }

      connect()

      return () => {
        closed = true
        if (retryTimer) clearTimeout(retryTimer)
        socket?.close()
      }
    },
  }
}
