import { DATA_SOURCE } from '@/config'
import { createApiSource, isApiAvailable } from './apiSource'
import { createLocalSource } from './localSource'
import type { DataSource } from './types'

let pending: Promise<DataSource> | null = null

/** Resolves the data source once per page load. */
export function resolveDataSource(): Promise<DataSource> {
  pending ??= (async () => {
    if (DATA_SOURCE === 'local') return createLocalSource()
    if (DATA_SOURCE === 'api') return createApiSource()
    return (await isApiAvailable()) ? createApiSource() : createLocalSource()
  })()
  return pending
}
