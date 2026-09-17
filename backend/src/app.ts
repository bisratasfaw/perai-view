import express, { type Express } from 'express'
import type { AppConfig } from './config'
import { createLogger, type Logger } from './logger'
import { errorHandler, notFound } from './middleware/errorHandler'
import { requestLogger } from './middleware/requestLogger'
import { corsPolicy, limiter, securityHeaders } from './middleware/security'
import { createOriginPolicy } from './origins'
import { activitiesRouter } from './routes/activities'
import { analyticsRouter } from './routes/analytics'
import { classifyRouter } from './routes/classify'
import { healthRouter } from './routes/health'
import { programsRouter } from './routes/programs'
import { ActivityFeed } from './services/activityFeed'
import { createClassifier, type Classify } from './services/classifier'

export const JSON_BODY_LIMIT = '16kb'
export const SEED_EVENTS = 20

export interface AppDependencies {
  /** Live event buffer. Defaults to a new, seeded (but not started) feed. */
  feed?: ActivityFeed
  classify?: Classify
  logger?: Logger
  /** Clock for the analytics endpoints. */
  now?: () => number
}

/** Builds the Express application. Has no side effects: no listening, no timers. */
export function createApp(config: AppConfig, deps: AppDependencies = {}): Express {
  const logger = deps.logger ?? createLogger(config.logging)
  const feed = deps.feed ?? seededFeed()
  const classify = deps.classify ?? createClassifier({ ...config.classifier, logger })
  const now = deps.now ?? Date.now
  const origins = createOriginPolicy(config.corsOrigins)

  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', config.trustProxy > 0 ? config.trustProxy : false)

  if (config.logging) app.use(requestLogger(logger))
  app.use(securityHeaders())
  app.use(corsPolicy(origins))
  app.use(limiter('general', config.rateLimit, (path) => path === '/api/health'))
  app.use('/api/classify', limiter('classify', config.classifyRateLimit))
  app.use(express.json({ limit: JSON_BODY_LIMIT }))

  app.use('/api/health', healthRouter())
  app.use('/api/programs', programsRouter())
  app.use('/api/activities', activitiesRouter(feed))
  app.use('/api/analytics', analyticsRouter(now))
  app.use('/api/classify', classifyRouter(classify))

  app.use(notFound)
  app.use(errorHandler(config, logger))
  return app
}

function seededFeed(): ActivityFeed {
  const feed = new ActivityFeed()
  feed.seed(SEED_EVENTS)
  return feed
}
