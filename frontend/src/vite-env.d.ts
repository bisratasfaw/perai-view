/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'local' (in-browser simulator), 'api' (backend), or 'auto' (try the API, fall back to local). */
  readonly VITE_DATA_SOURCE?: 'local' | 'api' | 'auto'
  /** Base URL of the backend API, e.g. https://api.example.com/api. Defaults to /api. */
  readonly VITE_API_URL?: string
  /** WebSocket URL for the live feed. Defaults to <api>/ws/activities. */
  readonly VITE_WS_URL?: string
  /** Public source-code link shown in the About dialog. */
  readonly VITE_REPO_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
