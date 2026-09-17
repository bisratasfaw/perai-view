import type { RequestHandler } from 'express'
import type { Logger } from '../logger'

/** Logs method, path (never the query string or body), status and duration. */
export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const start = process.hrtime.bigint()
    res.on('finish', () => {
      const path = req.originalUrl.split('?')[0] ?? req.originalUrl
      if (path === '/api/health') return
      logger.info('request', {
        method: req.method,
        path,
        status: res.statusCode,
        ms: Number((process.hrtime.bigint() - start) / 1000n) / 1000,
      })
    })
    next()
  }
}
