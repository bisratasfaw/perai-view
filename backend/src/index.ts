import { createServer } from 'node:http'
import { SIMULATION_VERSION } from '@shared/simulation'
import { SEED_EVENTS, createApp } from './app'
import { ConfigError, loadConfig, type AppConfig } from './config'
import { createLogger } from './logger'
import { createOriginPolicy } from './origins'
import { WS_PATH, attachActivitySocket } from './realtime/activitySocket'
import { ActivityFeed } from './services/activityFeed'
import { APP_VERSION } from './version'

const SHUTDOWN_TIMEOUT_MS = 10_000

function readConfig(): AppConfig {
  try {
    return loadConfig()
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`${err.message}\n`)
      process.exit(1)
    }
    throw err
  }
}

function main(): void {
  const config = readConfig()
  const logger = createLogger(config.logging)

  const feed = new ActivityFeed()
  feed.seed(SEED_EVENTS)
  feed.start()

  const app = createApp(config, { feed, logger })
  const server = createServer(app)
  // Bound slow clients (slowloris-style) well below Node's generous defaults.
  server.headersTimeout = 15_000
  server.requestTimeout = 30_000

  const socket = attachActivitySocket(server, {
    feed,
    origins: createOriginPolicy(config.corsOrigins),
    ...config.ws,
    trustProxy: config.trustProxy,
    version: APP_VERSION,
    logger,
  })

  server.on('error', (err) => {
    logger.error('server failed', { error: err.message })
    process.exit(1)
  })

  server.listen(config.port, config.host, () => {
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : config.port
    logger.info('PerAI View API listening (all data is simulated)', {
      url: `http://${config.host}:${String(port)}`,
      websocket: WS_PATH,
      version: APP_VERSION,
      simulation_version: SIMULATION_VERSION,
      env: config.nodeEnv,
      cors_origins: config.corsOrigins,
      classifier: config.classifier.url ?? 'keyword fallback only',
    })
  })

  let shuttingDown = false
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info('shutting down', { signal })
    const force = setTimeout(() => {
      logger.error('shutdown timed out, forcing exit')
      process.exit(1)
    }, SHUTDOWN_TIMEOUT_MS)

    feed.stop()
    void socket.close().then(() => {
      server.close((err) => {
        clearTimeout(force)
        if (err) logger.error('error while closing HTTP server', { error: err.message })
        process.exitCode = err ? 1 : 0
      })
      server.closeIdleConnections()
    })
  }

  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

main()
