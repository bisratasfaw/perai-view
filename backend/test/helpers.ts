import { once } from 'node:events'
import { createServer, type RequestListener, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createRng } from '@shared/simulation'
import { createApp, type AppDependencies } from '../src/app'
import { parseConfig, type AppConfig } from '../src/config'
import { ActivityFeed } from '../src/services/activityFeed'

/** A fixed instant so analytics responses can be compared with the shared functions. */
export const FIXED_NOW = Date.UTC(2026, 5, 15, 14, 30, 0)
export const ALLOWED_ORIGIN = 'http://localhost:5173'
export const DISALLOWED_ORIGIN = 'http://evil.example'

/**
 * Test configuration. The classifier is explicitly disabled so tests never depend on
 * something listening on the development default (127.0.0.1:8000).
 */
export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return { ...parseConfig({ NODE_ENV: 'test', AI_CLASSIFIER_URL: 'off' }), ...overrides }
}

/** Deterministic feed with `events` buffered events. */
export function testFeed(events = 60, capacity = 200): ActivityFeed {
  const feed = new ActivityFeed({ rng: createRng(42), now: () => FIXED_NOW, capacity })
  feed.seed(events)
  return feed
}

export function testApp(overrides: Partial<AppConfig> = {}, deps: AppDependencies = {}) {
  const config = testConfig(overrides)
  const feed = deps.feed ?? testFeed()
  const app = createApp(config, { now: () => FIXED_NOW, ...deps, feed })
  return { app, config, feed }
}

export async function listen(server: Server): Promise<string> {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address() as AddressInfo
  return `127.0.0.1:${port}`
}

export async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => { resolve() }))
}

/** Starts a throwaway HTTP server on an ephemeral port. */
export async function startHttpServer(handler: RequestListener) {
  const server = createServer(handler)
  const host = await listen(server)
  return { url: `http://${host}`, close: () => closeServer(server) }
}

/** A URL on which nothing is listening (a port that was just released). */
export async function unusedUrl(): Promise<string> {
  const { url, close } = await startHttpServer(() => undefined)
  await close()
  return url
}
