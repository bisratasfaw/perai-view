const env = import.meta.env

export type DataSourcePreference = 'local' | 'api' | 'auto'

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

/** Base URL of the backend API (no trailing slash). */
export const API_URL = trimSlash(env.VITE_API_URL || '/api')

/** WebSocket URL of the live activity feed. */
export function wsUrl(): string {
  if (env.VITE_WS_URL) return env.VITE_WS_URL
  const api = API_URL.startsWith('http')
    ? API_URL.replace(/^http/, 'ws')
    : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${API_URL}`
  return `${api}/ws/activities`
}

/**
 * Where data comes from:
 * - production builds default to the in-browser simulator, so the site works on
 *   free static hosting with no server, unless VITE_API_URL is set;
 * - the dev server defaults to "auto": use the local API if it is running.
 */
export const DATA_SOURCE: DataSourcePreference =
  env.VITE_DATA_SOURCE ?? (env.DEV ? 'auto' : env.VITE_API_URL ? 'api' : 'local')

export const REPO_URL = env.VITE_REPO_URL || 'https://github.com/bisratasfaw/perai-view'
