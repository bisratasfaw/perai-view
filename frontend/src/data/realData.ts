import { useEffect, useState } from 'react'
import { REAL_DATA_FILES, REAL_DATA_SCHEMAS, type RealDataKey } from '@shared/realData'
import type { z } from 'zod'

export type RealData<K extends RealDataKey> = z.infer<(typeof REAL_DATA_SCHEMAS)[K]>

export type RealDataState<K extends RealDataKey> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: RealData<K>; error: null }
  | { status: 'error'; data: null; error: string }

/** Base URL of the snapshot folder: the static site ships it next to index.html. */
export function realDataUrl(key: RealDataKey): string {
  return `${import.meta.env.BASE_URL}data/real/${REAL_DATA_FILES[key]}`
}

const cache = new Map<RealDataKey, Promise<unknown>>()

/**
 * Fetches and validates one snapshot. Results are cached for the page's lifetime: the files
 * change at most once a day, and a failed validation is worth surfacing rather than retrying.
 */
export function loadRealData<K extends RealDataKey>(key: K): Promise<RealData<K>> {
  let pending = cache.get(key) as Promise<RealData<K>> | undefined
  if (!pending) {
    pending = (async () => {
      const res = await fetch(realDataUrl(key), { signal: AbortSignal.timeout(15_000) })
      if (!res.ok) throw new Error(`${REAL_DATA_FILES[key]}: HTTP ${res.status}`)
      const parsed = REAL_DATA_SCHEMAS[key].safeParse(await res.json())
      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        throw new Error(`${REAL_DATA_FILES[key]} failed validation at ${issue?.path.join('.') || '(root)'}: ${issue?.message}`)
      }
      return parsed.data as RealData<K>
    })()
    pending.catch(() => cache.delete(key))
    cache.set(key, pending)
  }
  return pending
}

/** Clears the cache (tests only). */
export function resetRealDataCache(): void {
  cache.clear()
}

export function useRealData<K extends RealDataKey>(key: K, enabled = true): RealDataState<K> {
  const [state, setState] = useState<RealDataState<K>>({ status: 'loading', data: null, error: null })

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    loadRealData(key)
      .then((data) => !cancelled && setState({ status: 'ready', data, error: null }))
      .catch((err: unknown) => !cancelled && setState({ status: 'error', data: null, error: err instanceof Error ? err.message : String(err) }))
    return () => {
      cancelled = true
    }
  }, [key, enabled])

  return state
}
